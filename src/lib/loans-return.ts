import { NextResponse } from 'next/server';
import { calcFine, jsonError, FINE_PER_DAY } from '@/lib/supabase/auth';
import { createLogger } from '@/lib/logger';
import type { SupabaseClient } from '@supabase/supabase-js';

type SupabaseLike = Pick<SupabaseClient, 'from'> & Partial<Pick<SupabaseClient, 'rpc'>>;

export type ReturnLoanOptions = {
  supabase: SupabaseLike;
  id: string;
  userId?: string | null;
  returnedAt?: Date | string;
  notes?: string;
  /** kondisi kontrak return POST: baik|rusak|hilang. Absen = simple return (PUT paths). */
  kondisi?: string;
};

function retryableError(message: string, details?: unknown) {
  return NextResponse.json(
    {
      error: { code: 'SAVE_FAILED', message, retryable: true },
      ...(details === undefined ? {} : { details }),
    },
    { status: 500, headers: { 'Retry-After': '1' } }
  );
}

function mapRpcError(code: string, msg: string) {
  if (code === '02000') return jsonError('NOT_FOUND', 'Peminjaman tidak ditemukan.', 404);
  if (code === '25001') return jsonError('CONFLICT', 'Sudah dikembalikan.', 409);
  if (code === '22000') {
    if (/kondisi/i.test(msg))
      return jsonError('VALIDATION', 'kondisi harus: baik|rusak|hilang.', 422);
    return jsonError('VALIDATION', 'Data pengembalian tidak valid.', 422, msg);
  }
  if (code === '42501')
    return jsonError('FORBIDDEN', 'Tidak berhak mengembalikan peminjaman ini.', 403);
  return null;
}

async function getFineRate(supabase: SupabaseLike): Promise<number> {
  try {
    const { data } = await supabase
      .from('library_settings')
      .select('fine_per_day')
      .eq('id', 1)
      .single();
    const v = Number((data as { fine_per_day?: unknown } | null)?.fine_per_day);
    if (Number.isFinite(v) && v > 0) return v;
  } catch {
    // Intentionally empty: fall through to FINE_PER_DAY default below.
  }
  return FINE_PER_DAY;
}

/**
 * S-roi3 single-source return — atomic via return_loan RPC.
 * Satu transaksi DB: row lock + guard 409 + loan update + stock clamp
 * + fines insert + audit. Tanpa jendela partial-failure sekuensial.
 * Fallback ke jalur legacy bila fungsi belum terdeploy (42883/PGRST202)
 * atau klien mock tanpa .rpc.
 */
export async function returnLoan(opts: ReturnLoanOptions): Promise<Response> {
  const { supabase, id } = opts;
  const userId = opts.userId ?? null;
  const hasKondisi = opts.kondisi !== undefined;
  const kondisi = hasKondisi
    ? String(opts.kondisi ?? 'baik')
        .trim()
        .toLowerCase()
    : 'baik';

  if (hasKondisi && !['baik', 'rusak', 'hilang'].includes(kondisi)) {
    return jsonError('VALIDATION', 'kondisi harus: baik|rusak|hilang.', 422);
  }

  let returnedAt: Date;
  if (opts.returnedAt instanceof Date) {
    returnedAt = opts.returnedAt;
  } else if (typeof opts.returnedAt === 'string' && opts.returnedAt) {
    returnedAt = new Date(opts.returnedAt);
  } else {
    returnedAt = new Date();
  }
  if (Number.isNaN(returnedAt.getTime())) {
    return jsonError(
      'VALIDATION',
      hasKondisi ? 'tanggal_kembali/returned_at tidak valid.' : 'returned_at tidak valid.',
      422
    );
  }
  // RACE-04: tolak returned_at masa depan (tutup awal + fine 0 diam-diam).
  if (returnedAt.getTime() > Date.now() + 5 * 60 * 1000) {
    return jsonError('VALIDATION', 'returned_at tidak boleh di masa depan.', 422);
  }

  const notes = typeof opts.notes === 'string' && opts.notes.trim() ? opts.notes.trim() : null;
  const rate = await getFineRate(supabase);

  if (typeof supabase.rpc === 'function') {
    try {
      const { data, error } = (await (
        supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>
        ) => Promise<{ data: unknown; error: unknown }>
      )('return_loan', {
        p_loan_id: id,
        p_returned_at: returnedAt.toISOString(),
        p_kondisi: kondisi,
        p_notes: notes,
        p_user_id: userId,
        p_fine_per_day: rate,
      })) as { data: unknown; error: { code?: string; message?: string } | null };
      if (!error) return NextResponse.json({ data });
      const rpcErr = error as { code?: string; message?: string };
      const rpcCode = rpcErr.code ?? '';
      const rpcMsg = rpcErr.message ?? '';
      const rpcMissing =
        rpcCode === '42883' ||
        rpcCode === 'PGRST202' ||
        /could not find.*return_loan|function.*return_loan.*does not exist/i.test(rpcMsg);
      if (!rpcMissing) {
        const mapped = mapRpcError(rpcCode, rpcMsg);
        if (mapped) return mapped;
        if (/Sudah dikembalikan/i.test(rpcMsg))
          return jsonError('CONFLICT', 'Sudah dikembalikan.', 409);
        if (/Peminjaman tidak ditemukan/i.test(rpcMsg))
          return jsonError('NOT_FOUND', 'Peminjaman tidak ditemukan.', 404);
        return retryableError('Gagal memproses pengembalian. Silakan coba lagi.', rpcMsg);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/return_loan|fetch|network/i.test(msg)) {
        return retryableError('Gagal memproses pengembalian. Silakan coba lagi.', msg);
      }
    }
  }

  return legacyReturnLoan(opts, returnedAt, kondisi, hasKondisi);
}

/**
 * KOMPENSASI legacy: loan sudah terupdate tetapi langkah berikut (stok)
 * gagal — coba kembalikan loan ke borrowed agar tidak ada partial state
 * diam-diam. Best-effort: false berarti panggil details.needsReconciliation.
 */
async function tryRevertLoanReturn(supabase: SupabaseLike, id: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('loans')
      .update({ status: 'borrowed', returned_at: null, fine_amount: 0 })
      .eq('id', id);
    return !error;
  } catch {
    return false;
  }
}

async function legacyReturnLoan(
  opts: ReturnLoanOptions,
  returnedAt: Date,
  kondisi: string,
  hasKondisi: boolean
): Promise<Response> {
  const { supabase, id } = opts;
  const userId = opts.userId ?? null;

  const { data: loan } = await supabase.from('loans').select('*').eq('id', id).single();
  if (!loan) return jsonError('NOT_FOUND', 'Peminjaman tidak ditemukan.', 404);
  const l = loan as {
    status: string;
    due_at: string;
    book_id: string;
    member_id: string;
  };
  if (l.status === 'returned' || l.status === 'lost')
    return jsonError('CONFLICT', 'Sudah dikembalikan.', 409);

  const rate = await getFineRate(supabase);
  const fine = calcFine(l.due_at, returnedAt, rate);

  const cleanNotes = typeof opts.notes === 'string' ? opts.notes.trim().slice(0, 500) : '';
  const noteExtra = cleanNotes ? ` | ${cleanNotes}` : '';

  const updatePayload: Record<string, unknown> = hasKondisi
    ? {
        returned_at: returnedAt.toISOString(),
        status: kondisi === 'hilang' ? 'lost' : 'returned',
        fine_amount: fine,
        notes: `Kondisi kembali: ${kondisi}${noteExtra}`,
      }
    : {
        returned_at: returnedAt.toISOString(),
        status: 'returned',
        fine_amount: fine,
        ...(cleanNotes ? { notes: cleanNotes } : {}),
      };

  const { data, error } = await supabase
    .from('loans')
    .update(updatePayload)
    .eq('id', id)
    // RACE-01: conditional write — dua return konkuren, hanya 1 yang menang.
    // Mock lama tanpa .in tetap lolos (chainable); 0-baris/error -> 409.
    .in('status', ['borrowed', 'overdue'])
    .select()
    .single();
  if (error || !data) {
    const msg = (error as { message?: string; code?: string } | null)?.message ?? '';
    const code = (error as { code?: string } | null)?.code ?? '';
    // 0-baris = pemenang konkuren sudah memproses (PGRST116/406 atau null) -> 409.
    if (
      !data &&
      (!error ||
        /concurrent winner|PGRST116|406|0 rows|multiple \(or no\) rows/i.test(`${msg} ${code}`))
    ) {
      return jsonError('CONFLICT', 'Peminjaman sudah diproses peminjam lain.', 409);
    }
    return retryableError(
      'Gagal memproses pengembalian. Silakan coba lagi.',
      (error as { message?: string } | null)?.message
    );
  }

  // RETURN-CLAMP: Math.min(stock_total, available+1) agar return konkuren
  // ganda / stok penuh tidak pernah melebihi stock_total.
  const { data: book } = await supabase
    .from('books')
    .select('stock_available,stock_total')
    .eq('id', l.book_id)
    .single();
  if (book) {
    const b = book as { stock_available: number; stock_total: number };
    if (hasKondisi && kondisi !== 'baik') {
      const nextTotal = Math.max(0, b.stock_total - 1);
      const { error: stockErr } = await supabase
        .from('books')
        .update({
          stock_total: nextTotal,
          stock_available: Math.min(Math.max(0, b.stock_available), nextTotal),
        })
        .eq('id', l.book_id);
      if (stockErr) {
        const reverted = await tryRevertLoanReturn(supabase, id);
        return retryableError('Pengembalian tersimpan, stok gagal diperbarui. Silakan coba lagi.', {
          reason: stockErr.message,
          reverted,
          needsReconciliation: !reverted,
        });
      }
    } else {
      const { error: stockErr } = await supabase
        .from('books')
        .update({ stock_available: Math.min(b.stock_total, b.stock_available + 1) })
        .eq('id', l.book_id);
      if (stockErr) {
        const reverted = await tryRevertLoanReturn(supabase, id);
        return retryableError('Pengembalian tersimpan, stok gagal diperbarui. Silakan coba lagi.', {
          reason: stockErr.message,
          reverted,
          needsReconciliation: !reverted,
        });
      }
    }
  }

  if (fine > 0) {
    const { error: fineErr } = await supabase.from('fines').insert({
      loan_id: id,
      member_id: l.member_id,
      amount: fine,
      status: 'unpaid',
      notes: hasKondisi
        ? `Denda keterlambatan otomatis Rp${rate}/hari (due ${l.due_at}). Kondisi: ${kondisi}.`
        : `Denda keterlambatan otomatis Rp${rate}/hari (due ${l.due_at}).`,
    });
    if (fineErr) {
      const loanReverted = await tryRevertLoanReturn(supabase, id);
      return retryableError('Pengembalian tersimpan, denda gagal dicatat. Silakan coba lagi.', {
        reason: fineErr.message,
        reverted: loanReverted,
        needsReconciliation: !loanReverted,
      });
    }
  }

  const auditPayload = {
    user_id: userId,
    action: 'loans.return',
    entity_type: 'loans',
    entity_id: id,
    metadata: hasKondisi ? { fine, kondisi, book_id: l.book_id } : { fine },
  };
  const firstAudit = await supabase.from('activity_logs').insert(auditPayload);
  if (firstAudit.error) {
    createLogger().warn('audit.activity_logs_retry', { detail: firstAudit.error.message });
    const retryAudit = await supabase.from('activity_logs').insert(auditPayload);
    if (retryAudit.error) {
      createLogger().error('audit.activity_logs_failed', {
        detail: retryAudit.error.message,
        entity_id: id,
      });
    }
  }

  return NextResponse.json({ data });
}

export type ExtendLoanOptions = {
  supabase: SupabaseLike;
  id: string;
  userId?: string | null;
  /** jumlah hari perpanjangan (1..90). Default 7. */
  days?: number;
};

/**
 * S-roi7 single-source extend — due_at += N days untuk loan aktif.
 * Aktif = borrowed|overdue. returned/lost -> 409. Audit loans.extend
 * dengan old_due_at + new_due_at. is_overdue dihitung ulang dari new due.
 */
export async function extendLoan(opts: ExtendLoanOptions): Promise<Response> {
  const { supabase, id } = opts;
  const userId = opts.userId ?? null;
  const days = opts.days === undefined ? 7 : Number(opts.days);
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    return jsonError('VALIDATION', 'days harus bilangan bulat 1..90.', 422);
  }

  const { data: loan } = await supabase.from('loans').select('*').eq('id', id).single();
  if (!loan) return jsonError('NOT_FOUND', 'Peminjaman tidak ditemukan.', 404);
  const l = loan as { status: string; due_at: string };
  if (l.status === 'returned' || l.status === 'lost') {
    return jsonError('CONFLICT', 'Peminjaman sudah selesai, tidak bisa diperpanjang.', 409);
  }

  const oldDue = new Date(l.due_at);
  // RACE-03: tolak due_at rusak sebelum aritmetika (hindari RangeError 500).
  if (Number.isNaN(oldDue.getTime())) {
    return jsonError('VALIDATION', 'due_at peminjaman tidak valid.', 422);
  }
  const newDue = new Date(oldDue.getTime() + days * 86400000);
  const newDueIso = newDue.toISOString();

  // RACE-02: optimistic-lock — dua extend konkuren, hanya 1 yang menang.
  const { data, error } = await supabase
    .from('loans')
    .update({ due_at: newDueIso, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('due_at', l.due_at)
    .select()
    .single();
  if (error || !data) {
    const msg = (error as { message?: string; code?: string } | null)?.message ?? '';
    const code = (error as { code?: string } | null)?.code ?? '';
    if (
      !data &&
      (!error ||
        /concurrent winner|PGRST116|406|0 rows|multiple \(or no\) rows/i.test(`${msg} ${code}`))
    ) {
      return jsonError('CONFLICT', 'Peminjaman sudah diperpanjang pihak lain.', 409);
    }
    return retryableError(
      'Gagal memperpanjang pinjaman. Silakan coba lagi.',
      (error as { message?: string } | null)?.message
    );
  }

  const row = { ...(data as Record<string, unknown>), is_overdue: newDue.getTime() < Date.now() };

  const auditPayload = {
    user_id: userId,
    action: 'loans.extend',
    entity_type: 'loans',
    entity_id: id,
    metadata: { old_due_at: l.due_at, new_due_at: newDueIso, days },
  };
  const firstAudit = await supabase.from('activity_logs').insert(auditPayload);
  if (firstAudit.error) {
    createLogger().warn('audit.activity_logs_retry', { detail: firstAudit.error.message });
    const retryAudit = await supabase.from('activity_logs').insert(auditPayload);
    if (retryAudit.error) {
      createLogger().error('audit.activity_logs_failed', {
        detail: retryAudit.error.message,
        entity_id: id,
      });
    }
  }

  return NextResponse.json({ data: row });
}
