import { NextResponse } from 'next/server';
import { calcFine, jsonError, FINE_PER_DAY } from '@/lib/supabase/auth';
import { capLateFine, getFineMax, getReplacementFee } from '@/lib/loan-settings';
import { createLogger } from '@/lib/logger';
import type { SupabaseClient } from '@supabase/supabase-js';

export type SupabaseLike = Pick<SupabaseClient, 'from'> & Partial<Pick<SupabaseClient, 'rpc'>>;

export function retryableError(message: string, details?: unknown) {
  return NextResponse.json(
    {
      error: { code: 'SAVE_FAILED', message, retryable: true },
      ...(details === undefined ? {} : { details }),
    },
    { status: 500, headers: { 'Retry-After': '1' } }
  );
}

export async function getFineRate(supabase: SupabaseLike): Promise<number> {
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
 * KOMPENSASI legacy: loan sudah terupdate tetapi langkah berikut (stok)
 * gagal — coba kembalikan loan ke borrowed agar tidak ada partial state
 * diam-diam. Best-effort: false berarti panggil details.needsReconciliation.
 */
export async function tryRevertLoanReturn(supabase: SupabaseLike, id: string): Promise<boolean> {
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

export type ReturnLoanOptions = {
  supabase: SupabaseLike;
  id: string;
  userId?: string | null;
  returnedAt?: Date | string;
  notes?: string;
  /** kondisi kontrak return POST: baik|rusak|hilang. Absen = simple return (PUT paths). */
  kondisi?: string;
};

/**
 * Legacy fallback read-then-write path for returnLoan.
 * Used when RPC is unavailable or fails with 'function not found'.
 * Sequential steps with compensation on mid-sequence failures.
 */
export async function legacyReturnLoan(
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
  // Isu #72: denda telat dipatok library_settings.fine_max (0 = tanpa plafon).
  // Jalur utama (RPC return_loan) menjepitnya di DB; ini jalur fallback.
  const fineMax = await getFineMax(supabase);
  const capped = capLateFine(calcFine(l.due_at, returnedAt, rate), fineMax);
  const lateFine = capped.fine;
  // Isu #74: rusak/hilang dikenakan biaya ganti rugi dari settings
  // (library_settings.replacement_fee_damaged / replacement_fee_lost).
  // Jalur utama (RPC return_loan) menghitungnya sendiri di DB — ini jalur
  // fallback bila fungsi belum terdeploy.
  const replacement = await getReplacementFee(supabase, kondisi);
  const fine = lateFine + replacement;

  const cleanNotes = typeof opts.notes === 'string' ? opts.notes.trim().slice(0, 500) : '';
  const noteExtra = cleanNotes ? ` | ${cleanNotes}` : '';
  const replacementNote =
    replacement > 0
      ? ` | Biaya ganti rugi (${kondisi}): Rp${replacement.toLocaleString('id-ID')}`
      : '';
  const capNote = capped.capped
    ? ` | Denda dipatok maksimum Rp${fineMax.toLocaleString('id-ID')}`
    : '';

  const updatePayload: Record<string, unknown> = hasKondisi
    ? {
        returned_at: returnedAt.toISOString(),
        status: kondisi === 'hilang' ? 'lost' : 'returned',
        fine_amount: fine,
        notes: `Kondisi kembali: ${kondisi}${replacementNote}${capNote}${noteExtra}`,
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
      notes:
        `Denda keterlambatan otomatis Rp${rate}/hari (due ${l.due_at}).` +
        (capped.capped ? ` Denda dipatok maksimum Rp${fineMax} (setelan plafon denda).` : '') +
        (replacement > 0 ? ` Biaya ganti rugi (${kondisi}): Rp${replacement}.` : '') +
        (hasKondisi ? ` Kondisi: ${kondisi}.` : ''),
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
    metadata: hasKondisi
      ? {
          fine,
          late_fine: lateFine,
          replacement_fee: replacement,
          kondisi,
          book_id: l.book_id,
          capped: capped.capped,
          fine_max: fineMax,
        }
      : { fine, late_fine: lateFine, capped: capped.capped, fine_max: fineMax },
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
