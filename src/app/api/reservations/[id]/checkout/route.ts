import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireStaff, jsonError } from '@/lib/supabase/auth';
import { createLogger, requestIdFromHeaders } from '@/lib/logger';

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/reservations/[id]/checkout — reservasi ready -> loan + completed
 * ATOMIK (issue #73). Menggantikan orkestrasi 2-call lama
 * (POST /api/loans lalu PUT /api/reservations {status:"completed"}) yang bisa
 * gagal separuh: loan terbuat tapi reservasi belum completed, atau completed
 * tanpa loan sama sekali (tombol "Selesaikan" sudah dihapus).
 *
 * Semua kerja ada di RPC checkout_reservation_tx (migrasi 0024): lock
 * reservasi + buku FOR UPDATE, gate stok + kelayakan anggota, insert loan,
 * update reservasi (completed + loan_id) dalam SATU transaksi Postgres.
 * Gagal di titik mana pun = rollback penuh; retry aman (idempoten bila
 * reservasi sudah completed dengan loan).
 *
 * RESPONS: 201 { data: { loan, reservation } }
 * ERROR (SQLSTATE -> jsonError):
 *   02000 NOT_FOUND | 25000/25001..25004 CONFLICT (409) | 22000/22005 VALIDATION
 *   42501 FORBIDDEN | 42883/PGRST202 SAVE_FAILED (migrasi 0024 belum jalan)
 */

type CheckoutResult = {
  loan?: unknown;
  reservation?: unknown;
  idempotent?: boolean;
};

function isUuid(v: unknown): boolean {
  return (
    typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  );
}

function revalidated(): string[] {
  const done: string[] = [];
  try {
    revalidateTag('reservations', 'max');
    done.push('reservations');
  } catch {
    /* abaikan */
  }
  try {
    revalidatePath('/admin/reservasi');
    done.push('/admin/reservasi');
  } catch {
    /* abaikan */
  }
  return done;
}

export async function POST(req: Request, { params }: Ctx) {
  const log = createLogger(requestIdFromHeaders(req.headers));
  const guard = await requireStaff(['admin', 'librarian']);
  if ('errorResponse' in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase } = guard as { supabase: ReturnType<typeof createClient> };

  const { id } = await params;
  if (!isUuid(id)) return jsonError('VALIDATION', 'id reservasi harus UUID valid.', 422);

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    // Body opsional: kosong = default borrowed/due di RPC.
    body = {};
  }

  // Opsional: override tempo pinjam. Validasi ringan — aturan otoritatif
  // (due > borrowed) tetap ditegakkan RPC (22000).
  const borrowedAt = body.borrowed_at ? new Date(body.borrowed_at as string) : null;
  if (borrowedAt && Number.isNaN(borrowedAt.getTime()))
    return jsonError('VALIDATION', 'borrowed_at tidak valid.', 422);
  const dueAt = body.due_at ? new Date(body.due_at as string) : null;
  if (dueAt && Number.isNaN(dueAt.getTime()))
    return jsonError('VALIDATION', 'due_at tidak valid.', 422);

  const notesRaw = typeof body.notes === 'string' ? body.notes.trim() : null;
  if (notesRaw !== null && notesRaw.length > 500)
    return jsonError('VALIDATION', 'notes maksimal 500 karakter.', 422);
  const notes = notesRaw && notesRaw.length > 0 ? notesRaw : null;

  const { data, error } = await supabase.rpc('checkout_reservation_tx', {
    p_reservation_id: id,
    ...(borrowedAt ? { p_borrowed_at: borrowedAt.toISOString() } : {}),
    ...(dueAt ? { p_due_at: dueAt.toISOString() } : {}),
    p_notes: notes,
  });

  if (error) {
    const code = (error as { code?: string }).code ?? '';
    const msg = error.message ?? '';
    const rpcMissing =
      code === '42883' ||
      code === 'PGRST202' ||
      /could not find.*checkout_reservation_tx|function.*checkout_reservation_tx.*does not exist/i.test(
        msg
      );
    if (rpcMissing) {
      log.error('reservations.checkout.rpc_missing', { detail: msg });
      return jsonError(
        'SAVE_FAILED',
        'Fungsi checkout_reservation_tx belum terdeploy. Jalankan migrasi 0024.',
        500,
        { requestId: log.requestId }
      );
    }
    // Pemetaan SQLSTATE eksak (bukan regex pesan yang rapuh) — lihat header.
    // Pesan RPC sudah spesifik (Reservasi/Buku/Anggota tidak ditemukan).
    if (code === '02000' || /tidak ditemukan/i.test(msg))
      return jsonError('NOT_FOUND', msg || 'Data tidak ditemukan.', 404);
    if (code === '25001' || /sudah meminjam buku ini/i.test(msg))
      return jsonError('CONFLICT', 'Anggota sudah meminjam buku ini (loan aktif).', 409);
    if (code === '25000' || /Stok buku habis/i.test(msg))
      return jsonError('CONFLICT', 'Stok buku habis.', 409);
    if (code === '25002' || /tagihan denda/i.test(msg))
      return jsonError('CONFLICT', 'Anggota memiliki tagihan denda belum lunas.', 409);
    if (code === '25003' || /terlambat/i.test(msg))
      return jsonError('CONFLICT', 'Anggota memiliki peminjaman terlambat.', 409);
    if (code === '25004' || /batas/i.test(msg))
      return jsonError('CONFLICT', 'Anggota sudah mencapai batas pinjaman aktif.', 409);
    if (code === '25006' || /belum siap diambil/i.test(msg))
      return jsonError('CONFLICT', 'Reservasi belum siap diambil (status bukan ready).', 409);
    if (code === '22005' || /Anggota tidak aktif/i.test(msg))
      return jsonError('VALIDATION', 'Anggota tidak aktif (suspended/expired/pending).', 422);
    if (code === '22000' || /due_at harus sesudah/i.test(msg))
      return jsonError('VALIDATION', 'due_at harus sesudah borrowed_at.', 422);
    if (code === '42501')
      return jsonError('FORBIDDEN', 'Hanya pustakawan yang boleh memproses reservasi.', 403);
    log.error('reservations.checkout_failed', { detail: msg });
    return jsonError('SAVE_FAILED', 'Gagal memproses checkout reservasi.', 500, {
      requestId: log.requestId,
    });
  }

  const out = (data ?? {}) as CheckoutResult;
  return NextResponse.json(
    { data: { loan: out.loan ?? null, reservation: out.reservation ?? null }, revalidated: revalidated() },
    { status: 201, headers: { 'Cache-Control': 'no-store' } }
  );
}
