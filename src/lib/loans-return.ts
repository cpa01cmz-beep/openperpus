import { NextResponse } from 'next/server';
import { calcFine, jsonError } from '@/lib/supabase/auth';
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

  const notes = typeof opts.notes === 'string' && opts.notes.trim() ? opts.notes.trim() : null;

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

  const fine = calcFine(l.due_at, returnedAt);

  const noteExtra =
    typeof opts.notes === 'string' && opts.notes.trim() ? ` | ${opts.notes.trim()}` : '';

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
        ...(typeof opts.notes === 'string' ? { notes: opts.notes } : {}),
      };

  const { data, error } = await supabase
    .from('loans')
    .update(updatePayload)
    .eq('id', id)
    .select()
    .single();
  if (error)
    return retryableError(
      'Gagal memproses pengembalian. Silakan coba lagi.',
      (error as { message?: string }).message
    );

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
      if (stockErr)
        return retryableError(
          'Pengembalian tersimpan, stok gagal diperbarui. Silakan coba lagi.',
          stockErr.message
        );
    } else {
      const { error: stockErr } = await supabase
        .from('books')
        .update({ stock_available: Math.min(b.stock_total, b.stock_available + 1) })
        .eq('id', l.book_id);
      if (stockErr)
        return retryableError(
          'Pengembalian tersimpan, stok gagal diperbarui. Silakan coba lagi.',
          stockErr.message
        );
    }
  }

  if (fine > 0) {
    const { error: fineErr } = await supabase.from('fines').insert({
      loan_id: id,
      member_id: l.member_id,
      amount: fine,
      status: 'unpaid',
      notes: hasKondisi
        ? `Denda keterlambatan otomatis Rp1000/hari (due ${l.due_at}). Kondisi: ${kondisi}.`
        : `Denda keterlambatan otomatis Rp1000/hari (due ${l.due_at}).`,
    });
    if (fineErr)
      return retryableError(
        'Pengembalian tersimpan, denda gagal dicatat. Silakan coba lagi.',
        fineErr.message
      );
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
    console.error('[audit] activity_logs insert failed (retrying once):', firstAudit.error.message);
    const retryAudit = await supabase.from('activity_logs').insert(auditPayload);
    if (retryAudit.error) {
      console.error(
        '[audit] activity_logs insert failed twice (500 detail):',
        retryAudit.error.message,
        auditPayload
      );
    }
  }

  return NextResponse.json({ data });
}
