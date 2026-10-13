import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { jsonError } from '@/lib/supabase/auth';
import { isUuid } from '@/lib/api-utils';
import { getSession } from '@/lib/session';
import { createLogger, requestIdFromHeaders } from '@/lib/logger';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/reservations/[id] — pemilik / pustakawan+
 * PATCH /api/reservations/[id] {status:"cancelled"|..., notes?} — pemilik hanya boleh batal
 * PUT /api/reservations/[id] — alias PATCH (staf penuh)
 * DELETE /api/reservations/[id] — pemilik / pustakawan+
 *
 * STATE-MACHINE (issue #73): pending->ready, any->cancelled/expired.
 * status='completed' TIDAK bisa lewat PUT — hanya via checkout atomik
 * POST /api/reservations/{id}/checkout (RPC checkout_reservation_tx, migrasi
 * 0024) yang membuat loan + menandai completed dalam satu transaksi.
 *
 * #176: 'completed' adalah status TERMINAL (memuat loan hidup) dan setiap
 * penulisan status wajib dibawa guard optimistic-lock — lihat catatan di
 * `updateById`.
 */

const STATUSES = ['pending', 'ready', 'completed', 'cancelled', 'expired'] as const;

function normStatus(v: unknown): string {
  return String(v ?? '')
    .trim()
    .toLowerCase();
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

/**
 * 0-baris dari PostgREST (guard optimistic-lock tak cocok) — dipakai untuk
 * memisahkan konflik dari kegagalan DB sungguhan. Bentuk sama seperti
 * deteksi pemenang konkuren di legacyReturn.ts:308-318: PGRST116 / 406 /
 * "no rows", dan `{ data: null, error: null }` (beberapa klien/mock) juga
 * dihitung 0-baris. Kode lain (23505, 42501, …) BUKAN 0-baris -> 500.
 */
function isZeroRows(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return true;
  const code = e.code ?? '';
  const msg = e.message ?? '';
  return /PGRST116|406|0 rows|multiple \(or no\) rows/i.test(`${code} ${msg}`);
}

async function scoped(id: string) {
  const s = await getSession();
  if ('errorResponse' in s) return { errorResponse: s.errorResponse };
  const { supabase, userId, role, isStaff, memberId } = s.session;
  // #54: id path WAJIB UUID — tolak 400 lebih awal (GET/PUT/PATCH/DELETE lewat sini).
  if (!isUuid(id)) {
    return {
      errorResponse: jsonError('VALIDATION', 'ID reservasi tidak valid (harus UUID).', 400),
    };
  }
  const { data: cur } = await supabase
    .from('reservations')
    .select('*, books(id,title,slug)')
    .eq('id', id)
    .single();
  if (!cur) return { errorResponse: jsonError('NOT_FOUND', 'Reservasi tidak ditemukan.', 404) };
  const c = cur as { member_id: string };
  if (!isStaff && c.member_id !== memberId)
    return { errorResponse: jsonError('FORBIDDEN', 'Bukan reservasi milik Anda.', 403) };

  return { supabase, userId, role, isStaff, memberId, cur };
}

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const log = createLogger(requestIdFromHeaders(_req.headers));
  const sc = await scoped(id);
  if ('errorResponse' in sc && sc.errorResponse) {
    log.warn('reservations.id.denied', { status: sc.errorResponse.status });
    return sc.errorResponse;
  }
  return NextResponse.json({ data: sc.cur }, { headers: { 'Cache-Control': 'no-store' } });
}

async function updateById(req: Request, id: string) {
  const log = createLogger(requestIdFromHeaders(req.headers));
  const sc = await scoped(id);
  if ('errorResponse' in sc) return sc.errorResponse;
  const { supabase, userId, role, isStaff } = sc;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError('INVALID_JSON', 'Body JSON tidak valid.', 400);
  }

  const cur = sc.cur as { member_id: string; status: string };

  const payload: Record<string, unknown> = {};
  if (body.status !== undefined) {
    const st = normStatus(body.status);
    if (!(STATUSES as readonly string[]).includes(st)) {
      return jsonError(
        'VALIDATION',
        'status harus: pending|ready|completed|cancelled|expired.',
        422
      );
    }
    if (!isStaff && st !== 'cancelled')
      return jsonError('FORBIDDEN', 'Anggota hanya boleh membatalkan reservasi.', 403);
    // #73: completed WAJIB lewat checkout atomik (POST .../checkout) yang
    // membuat loan. PUT completed langsung = stok tak berkurang + antrean
    // fiktif selesai — jalur ini ditutup total.
    if (st === 'completed') {
      return jsonError(
        'VALIDATION',
        'Selesaikan reservasi lewat POST /api/reservations/{id}/checkout (membuat loan atomik).',
        422
      );
    }
    const from = cur.status;
    const allowed =
      from === st ||
      st === 'cancelled' ||
      st === 'expired' ||
      (from === 'pending' && st === 'ready');
    if (!allowed) {
      return jsonError('VALIDATION', `Transisi status ${from}->${st} tidak diizinkan.`, 422);
    }
    // #176: 'completed' adalah baris dengan loan HIDUP (checkout atomik
    // checkout_reservation_tx, migrasi 0024) dan bersifat TERMINAL. Membalikkannya
    // ke cancelled/expired memutus tautan loan<->reservasi serta menghapus jejak
    // "reservasi selesai" sementara loan tetap berjalan — arah kebalikan dari
    // invariant #73 (completed hanya lahir bersama loan). DELETE di bawah sudah
    // menolak baris yang "sudah diproses"; transisi status wajib konsisten.
    // Koreksi kesalahan input tetap mungkin: proses pinjamannya lewat
    // pengembalian (PUT /api/loans/{id}) — reservasi tetap 'completed' sebagai
    // audit, sama seperti loan 'returned' yang tidak bisa dibuka kembali.
    if (from === 'completed') {
      return jsonError(
        'VALIDATION',
        'Reservasi ini sudah selesai (loan tercatat). Pembatalan/kedaluwarsa hanya untuk reservasi tanpa loan — proses pinjamannya lewat pengembalian.',
        422
      );
    }
    payload.status = st;
  }
  if (body.notes !== undefined) payload.notes = body.notes as string | null;
  if (!isStaff && body.expires_at !== undefined) {
    return jsonError('FORBIDDEN', 'Hanya pustakawan yang boleh memproses reservasi.', 403);
  }
  if (isStaff && body.expires_at !== undefined) {
    // Migrasi 0028: kolom NOT NULL — null eksplisit ditolak 422 (bukan 500 DB).
    if (body.expires_at === null)
      return jsonError('VALIDATION', 'expires_at tidak boleh kosong.', 422);
    else {
      const d = new Date(body.expires_at as string);
      if (Number.isNaN(d.getTime())) return jsonError('VALIDATION', 'expires_at tidak valid.', 422);
      payload.expires_at = d.toISOString();
    }
  }

  // #176: penulisan STATUS wajib dibawa guard optimistic-lock. Status yang
  // diperiksa di atas berasal dari SELECT di scoped(); tanpa kondisi pada
  // UPDATE, baris yang bergerak di antara keduanya (checkout_reservation_tx
  // atau sweep "Tandai kedaluwarsa" konkuren, src/lib/reservation-sweep.ts)
  // ditimpa ABSOLUT: reservasi 'completed' + loan_id bisa diam-diam menjadi
  // 'expired'/'cancelled'. Bentuknya sama seperti guard `.eq('due_at', …)` di
  // extendLoan, `.in('status', ACTIVE_LOAN_STATUSES)` di legacyReturn, dan
  // `.in('status', ['unpaid','partial'])` di pay — reservations adalah satu
  // state-machine terakhir yang ditulis tanpa kondisi.
  // 0-baris = baris sudah berubah di bawah kita -> 409 CONFLICT (klien memuat
  // ulang), bukan sukses palsu dan bukan 500. Penulisan TANPA perubahan status
  // (mis. hanya notes/expires_at) TIDAK dijaga supaya edit biasa tidak gagal
  // karena status yang bergerak di belakangnya.
  const changingStatus = payload.status !== undefined;
  let write = supabase.from('reservations').update(payload).eq('id', id);
  if (changingStatus) write = write.eq('status', cur.status);

  const { data, error } = await write.select().single();
  if (error || !data) {
    if (changingStatus && !data && isZeroRows(error)) {
      log.warn('reservations.id.status_conflict', {
        detail: (error as { message?: unknown })?.message ?? '0 baris cocok guard status',
      });
      return jsonError('CONFLICT', 'Reservasi sudah berubah status, muat ulang dulu.', 409, {
        requestId: log.requestId,
      });
    }
    log.error('reservations.id.save_failed', {
      detail: (error as { message?: unknown })?.message ?? String(error),
    });
    return jsonError('SAVE_FAILED', 'Gagal mengupdate reservasi.', 500, {
      requestId: log.requestId,
    });
  }

  try {
    await supabase.from('activity_logs').insert({
      user_id: userId,
      action: `reservations.${String(payload.status ?? 'update')}`,
      entity_type: 'reservations',
      entity_id: id,
      metadata: { role, ...payload },
    });
  } catch {
    /* best-effort */
  }

  return NextResponse.json({ data, revalidated: revalidated() });
}

export async function PUT(req: Request, ctx: Ctx) {
  return updateById(req, (await ctx.params).id);
}

export async function PATCH(req: Request, ctx: Ctx) {
  return updateById(req, (await ctx.params).id);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const log = createLogger(requestIdFromHeaders(_req.headers));
  const sc = await scoped(id);
  if ('errorResponse' in sc) return sc.errorResponse;
  const { supabase, userId, isStaff } = sc;
  const c = sc.cur as { status: string };

  if (c.status === 'ready' || c.status === 'completed') {
    return jsonError('CONFLICT', 'Reservasi yang sudah diproses tidak bisa dihapus.', 409);
  }
  void isStaff;

  const { error } = await supabase.from('reservations').delete().eq('id', id);
  if (error) {
    log.error('reservations.id.delete_failed', {
      detail: (error as { message?: unknown })?.message ?? String(error),
    });
    return jsonError('DELETE_FAILED', 'Gagal menghapus reservasi.', 500, {
      requestId: log.requestId,
    });
  }

  try {
    await supabase.from('activity_logs').insert({
      user_id: userId,
      action: 'reservations.delete',
      entity_type: 'reservations',
      entity_id: id,
      metadata: {},
    });
  } catch {
    /* best-effort */
  }

  return NextResponse.json({ message: 'Reservasi dihapus.', revalidated: revalidated() });
}
