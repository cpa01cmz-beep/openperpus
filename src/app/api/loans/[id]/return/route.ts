import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireStaff, jsonError } from '@/lib/supabase/auth';
import { returnLoan } from '@/lib/loans-return';
import { createLogger, requestIdFromHeaders } from '@/lib/logger';

type Ctx = { params: { id: string } };

/**
 * POST /api/loans/[id]/return {tanggal_kembali?, returned_at?, kondisi?|notes?}
 *   — pustakawan+. Server hitung denda Rp1000/hari, buat row fines bila >0,
 *   kembalikan stok (+1 clamp stock_total).
 * Kondisi (kontrak): baik|rusak|hilang — dicatat ke notes (tanpa kolom baru).
 */

export async function POST(req: Request, { params }: Ctx) {
  const log = createLogger(requestIdFromHeaders(req.headers));
  const guard = await requireStaff(['admin', 'librarian']);
  if ('errorResponse' in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase, user } = guard as {
    supabase: ReturnType<typeof createClient>;
    user: { id: string };
  };

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError('INVALID_JSON', 'Body JSON tidak valid.', 400);
  }

  const res = await returnLoan({
    supabase,
    id: params.id,
    userId: user?.id ?? null,
    returnedAt: (body.tanggal_kembali ?? body.returned_at) as string | undefined,
    notes: typeof body.notes === 'string' ? body.notes : undefined,
    kondisi: String(body.kondisi ?? body.condition ?? 'baik'),
  });
  if (res.status !== 200) {
    log.warn('loans.id.return_failed', { status: res.status });
    return res;
  }
  const j = (await res.json()) as { data: unknown };

  const revalidated: string[] = [];
  try {
    revalidateTag('loans');
    revalidated.push('loans');
  } catch {
    /* abaikan */
  }
  try {
    revalidateTag('books');
    revalidated.push('books');
  } catch {
    /* abaikan */
  }
  try {
    revalidateTag('fines');
    revalidated.push('fines');
  } catch {
    /* abaikan */
  }
  try {
    revalidatePath('/admin/peminjaman');
    revalidated.push('/admin/peminjaman');
  } catch {
    /* abaikan */
  }

  return NextResponse.json({ data: j.data, revalidated });
}
