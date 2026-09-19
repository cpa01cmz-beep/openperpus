import { NextResponse } from 'next/server';
import { calcFine, jsonError } from '@/lib/supabase/auth';
import type { SupabaseClient } from '@supabase/supabase-js';

type SupabaseLike = Pick<SupabaseClient, 'from'>;

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
 * S-roi3 single-source return.
 * Satu-satunya pemilik guard 409 + calcFine + stock clamp + fines insert + audit.
 * Ketiga route (PUT kolektif, PUT alias, POST return) adalah alias tipis.
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

  const { data: loan } = await supabase.from('loans').select('*').eq('id', id).single();
  if (!loan) return jsonError('NOT_FOUND', 'Peminjaman tidak ditemukan.', 404);
  const l = loan as {
    status: string;
    due_at: string;
    book_id: string;
    member_id: string;
  };
  if (l.status === 'returned') return jsonError('CONFLICT', 'Sudah dikembalikan.', 409);

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

  const fine = calcFine(l.due_at, returnedAt); // Rp1000/hari telat

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
  if (error) return jsonError('SAVE_FAILED', 'Gagal memproses pengembalian.', 500, error.message);

  // Kembalikan stok (+1, clamp ke stock_total).
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
      // Stok: rusak/hilang -> stock_total -1 + sesuaikan available (tanpa negatif).
      const nextTotal = Math.max(0, b.stock_total - 1);
      await supabase
        .from('books')
        .update({
          stock_total: nextTotal,
          stock_available: Math.min(Math.max(0, b.stock_available), nextTotal),
        })
        .eq('id', l.book_id);
    } else {
      await supabase
        .from('books')
        .update({ stock_available: Math.min(b.stock_total, b.stock_available + 1) })
        .eq('id', l.book_id);
    }
  }

  // Catat denda ke tabel fines bila >0 (kontrak: return membuat fines)
  if (fine > 0) {
    await supabase.from('fines').insert({
      loan_id: id,
      member_id: l.member_id,
      amount: fine,
      status: 'unpaid',
      notes: hasKondisi
        ? `Denda keterlambatan otomatis Rp1000/hari (due ${l.due_at}). Kondisi: ${kondisi}.`
        : `Denda keterlambatan otomatis Rp1000/hari (due ${l.due_at}).`,
    });
  }

  const auditPayload = hasKondisi
    ? {
        user_id: userId,
        action: 'loans.return',
        entity_type: 'loans',
        entity_id: id,
        metadata: { fine, kondisi, book_id: l.book_id },
      }
    : {
        user_id: userId,
        action: 'loans.return',
        entity_type: 'loans',
        entity_id: id,
        metadata: { fine },
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
