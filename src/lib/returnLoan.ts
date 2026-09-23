import { NextResponse } from 'next/server';
import { jsonError } from '@/lib/supabase/auth';
import { legacyReturnLoan, getFineRate, retryableError } from '@/lib/legacyReturn';
import type { SupabaseLike } from '@/lib/legacyReturn';

export type ReturnLoanOptions = {
  supabase: SupabaseLike;
  id: string;
  userId?: string | null;
  returnedAt?: Date | string;
  notes?: string;
  /** kondisi kontrak return POST: baik|rusak|hilang. Absen = simple return (PUT paths). */
  kondisi?: string;
};

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
