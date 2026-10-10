import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { jsonError, parsePaging } from '@/lib/supabase/auth';
import { isUuid, createWriteLog } from '@/lib/api-utils';
import { checkMemberLoanEligibility } from '@/lib/loan-eligibility';
import { sanitizeIlike } from '@/lib/search';
import { createLogger, requestIdFromHeaders } from '@/lib/logger';
import { getSession } from '@/lib/session';

/**
 * GET /api/reservations?status=&member_id=&book_id=&q=&page=&per_page=
 *   — q mencari member_code | judul buku | catatan (lintas relasi).
 *   — anggota: otomatis miliknya (member_id diabaikan); pustakawan+: semua/filter.
 * POST /api/reservations {book_id, member_id?, notes?}
 *   — anggota: {book_id} -> pending (member_id miliknya); pustakawan+: boleh untuk member lain.
 *   Gate kelayakan (#56): denda belum lunas / terlambat / batas pinjaman -> 409.
 * PUT/DELETE satu-resource PINDAH ke /api/reservations/{id} (issue #54 —
 * transport ?id= dihapus; kontrak lengkap + state-machine ada di route [id]).
 *
 * Kolom migrasi 0001: book_id, member_id, status pending|ready|completed|cancelled|expired,
 * reserved_at, expires_at, notes. Unik pending (book_id,member_id).
 *
 * STATE-MACHINE (issue #73): pending->ready, any->cancelled/expired.
 * status='completed' TIDAK bisa lewat PUT — hanya via checkout atomik
 * POST /api/reservations/{id}/checkout (RPC checkout_reservation_tx, migrasi
 * 0024) yang membuat loan + menandai completed dalam satu transaksi.
 */

const writeLog = createWriteLog('reservations');

function revalidateReservations(): string[] {
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

export async function GET(req: Request) {
  const log = createLogger(requestIdFromHeaders(req.headers));
  const s = await getSession();
  if ('errorResponse' in s) return s.errorResponse;
  const { supabase, memberId, isStaff } = s.session;

  const { sp, page, perPage, q, from, to } = parsePaging(req.url, 20);
  const status = (sp.get('status') ?? '').trim();
  const bookId = (sp.get('book_id') ?? '').trim();
  let memberFilter = (sp.get('member_id') ?? '').trim();

  // Anggota: paksa miliknya.
  if (!isStaff) memberFilter = memberId ?? '__none__';

  let query = supabase
    .from('reservations')
    .select('*, books(id,title,slug), members(id,member_code)', { count: 'exact' })
    .order('reserved_at', { ascending: false })
    .range(from, to);

  if (status) query = query.eq('status', status);
  if (bookId) query = query.eq('book_id', bookId);
  if (memberFilter) query = query.eq('member_id', memberFilter);
  if (q) {
    // Cari lintas relasi: kode anggota, judul buku, catatan (embedded PostgREST).
    const clean = sanitizeIlike(q);
    if (clean)
      query = query.or(
        `members.member_code.ilike.%${clean}%,books.title.ilike.%${clean}%,notes.ilike.%${clean}%`
      );
  }

  const { data, error, count } = await query;
  if (error) {
    log.error('reservations.fetch_failed', {
      detail: (error as { message?: unknown })?.message ?? String(error),
    });
    return jsonError('FETCH_FAILED', 'Gagal mengambil reservasi.', 500, {
      requestId: log.requestId,
    });
  }
  const total = count ?? 0;
  return NextResponse.json(
    {
      data,
      pagination: { page, limit: perPage, total, totalPages: Math.ceil(total / perPage) },
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function POST(req: Request) {
  const log = createLogger(requestIdFromHeaders(req.headers));
  const s = await getSession();
  if ('errorResponse' in s) return s.errorResponse;
  const { supabase, userId, memberId, isStaff } = s.session;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError('INVALID_JSON', 'Body JSON tidak valid.', 400);
  }

  const book_id = (body.book_id ?? body.bookId ?? body.book) as string;
  if (!isUuid(book_id)) return jsonError('VALIDATION', 'book_id harus UUID valid.', 422);

  // Tentukan member pemilik reservasi.
  const targetMember = isStaff && isUuid(body.member_id) ? (body.member_id as string) : memberId;
  if (!targetMember || !isUuid(targetMember)) {
    return jsonError('VALIDATION', 'Akun belum terdaftar sebagai anggota (members kosong).', 422);
  }

  const { data: book } = await supabase
    .from('books')
    .select('id,is_active')
    .eq('id', book_id)
    .single();
  if (!book) return jsonError('NOT_FOUND', 'Buku tidak ditemukan.', 404);
  if ((book as { is_active?: boolean }).is_active === false)
    return jsonError('GONE', 'Buku sudah tidak aktif, tidak bisa direservasi.', 410);

  const { data: member } = await supabase
    .from('members')
    .select('id,status')
    .eq('id', targetMember)
    .single();
  if (!member) return jsonError('NOT_FOUND', 'Anggota tidak ditemukan.', 404);
  if ((member as { status: string }).status !== 'active') {
    return jsonError('VALIDATION', 'Anggota tidak aktif.', 422);
  }

  // Isu #56: gate kelayakan sama dengan POST /loans — anggota berdenda,
  // terlambat, atau sudah di batas pinjaman aktif tidak boleh menahan buku.
  const eligibility = await checkMemberLoanEligibility(supabase, targetMember);
  if (!eligibility.eligible) {
    if (eligibility.status === 500)
      log.error('reservations.eligibility_check_failed', {
        member_id: targetMember,
      });
    return jsonError(eligibility.code, eligibility.message, eligibility.status, {
      requestId: log.requestId,
    });
  }

  const expiresRaw = body.expires_at as string | undefined;
  let expires_at: string | null = null;
  if (expiresRaw) {
    const d = new Date(expiresRaw);
    if (Number.isNaN(d.getTime())) return jsonError('VALIDATION', 'expires_at tidak valid.', 422);
    if (d.getTime() <= Date.now())
      return jsonError('VALIDATION', 'expires_at harus di masa depan.', 422);
    expires_at = d.toISOString();
  }

  const notesRaw = body.notes;
  let notes: string | null = null;
  if (notesRaw !== undefined && notesRaw !== null) {
    if (typeof notesRaw !== 'string')
      return jsonError('VALIDATION', 'notes harus string atau null.', 422);
    if (notesRaw.length > 500) return jsonError('VALIDATION', 'notes maksimal 500 karakter.', 422);
    notes = notesRaw;
  }

  const { data, error } = await supabase
    .from('reservations')
    .insert({
      book_id,
      member_id: targetMember,
      status: 'pending',
      expires_at,
      notes,
    })
    .select()
    .single();

  if (error) {
    if ((error as { code?: string }).code === '23505') {
      log.warn('reservations.conflict', {
        detail: (error as { message?: unknown })?.message ?? String(error),
      });
      return jsonError('CONFLICT', 'Reservasi pending untuk buku ini sudah ada.', 409, {
        requestId: log.requestId,
      });
    }
    log.error('reservations.save_failed', {
      detail: (error as { message?: unknown })?.message ?? String(error),
    });
    return jsonError('SAVE_FAILED', 'Gagal membuat reservasi.', 500, { requestId: log.requestId });
  }

  await writeLog(supabase, userId, 'reservations.create', (data as { id: string }).id, {
    book_id,
    member_id: targetMember,
  });
  return NextResponse.json({ data, revalidated: revalidateReservations() }, { status: 201 });
}
