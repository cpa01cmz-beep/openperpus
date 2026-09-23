import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireStaff, jsonError, addDaysISO, parsePaging } from '@/lib/supabase/auth';
import { returnLoan, extendLoan } from '@/lib/loans-return';
import { sanitizeIlike } from '@/lib/search';
import { createLogger, requestIdFromHeaders } from '@/lib/logger';

/**
 * Sirkulasi — kolom mengikuti migrasi 0001 (loans):
 * book_id, member_id, borrowed_at, due_at, returned_at,
 * status: borrowed|returned|overdue|lost, fine_amount, notes.
 *
 * GET /api/loans?status=&member_id=&overdue=1&page=&per_page=
 * POST /api/loans { member_id, book_id, borrowed_at?, due_at?, notes? }
 *   -> due auto +14 hari, stok_available -1 (guard >0)
 * PUT /api/loans?id= { action:"return", returned_at?, notes? }
 *   -> denda otomatis Rp1000/hari + stok +1 + row fines bila denda >0
 * PUT /api/loans?id= { action:"extend", days? } -> due_at += N hari (1..90).
 * STATE-MACHINE (transisi legal, ilegal -> 409/422):
 *   return: borrowed|overdue -> returned|lost (sudah returned/lost -> 409).
 *   extend: borrowed|overdue -> due_at baru (sudah returned/lost -> 409).
 *   completed/cancelled/expired bukan status loan — ditolak 422.
 * DELETE /api/loans?id= (admin, hanya yang sudah returned/lost)
 */

function isUuid(v: unknown): boolean {
  return (
    typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  );
}

async function writeLog(
  supabase: ReturnType<typeof createClient>,
  userId: string | undefined,
  action: string,
  entityId: string,
  metadata: Record<string, unknown> = {}
) {
  try {
    await supabase.from('activity_logs').insert({
      user_id: userId ?? null,
      action,
      entity_type: 'loans',
      entity_id: entityId,
      metadata,
    });
  } catch {
    /* best-effort */
  }
}

export async function GET(req: Request) {
  const log = createLogger(requestIdFromHeaders(req.headers));
  const guard = await requireStaff();
  if ('errorResponse' in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase } = guard as { supabase: ReturnType<typeof createClient> };

  const { sp, page, perPage, q, from, to } = parsePaging(req.url, 10);
  const status = (sp.get('status') ?? '').trim();
  const memberId = (sp.get('member_id') ?? '').trim();
  const overdue = sp.get('overdue');

  let query = supabase
    .from('loans')
    .select(
      '*, members(id,member_code), books(id,title,slug), ' +
        "CASE WHEN status IN ('borrowed','overdue') AND due_at < NOW() THEN true ELSE false END AS is_overdue, " +
        "CASE WHEN status IN ('borrowed','overdue') AND due_at < NOW() " +
        'THEN GREATEST(EXTRACT(DAY FROM (NOW() - due_at))::int, 0) * 1000 ELSE 0 END AS fine_preview',
      { count: 'exact' }
    )
    .order('borrowed_at', { ascending: false })
    .range(from, to);

  if (status) query = query.eq('status', status);
  if (memberId) query = query.eq('member_id', memberId);
  if (overdue === '1')
    query = query.in('status', ['borrowed', 'overdue']).lt('due_at', new Date().toISOString());
  if (q) {
    const clean = sanitizeIlike(q);
    if (clean) query = query.ilike('notes', `%${clean}%`);
  }

  const { data, error, count } = await query;
  if (error) {
    log.error('loans.fetch_failed', { detail: error.message });
    return jsonError('FETCH_FAILED', 'Gagal mengambil peminjaman.', 500, {
      requestId: log.requestId,
    });
  }

  const total = count ?? 0;
  return NextResponse.json({
    data: data ?? [],
    meta: { page, per_page: perPage, total },
    pagination: { page, limit: perPage, total, totalPages: Math.ceil(total / perPage) },
  });
}

export async function POST(req: Request) {
  const log = createLogger(requestIdFromHeaders(req.headers));
  const guard = await requireStaff(['admin', 'librarian']);
  if ('errorResponse' in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase, user } = guard as {
    supabase: ReturnType<typeof createClient>;
    user: { id: string };
  };

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError('INVALID_JSON', 'Body JSON tidak valid.', 400);
  }

  const member_id = body.member_id as string;
  const book_id = body.book_id as string;
  if (!isUuid(member_id)) return jsonError('VALIDATION', 'member_id harus UUID valid.', 422);
  if (!isUuid(book_id)) return jsonError('VALIDATION', 'book_id harus UUID valid.', 422);

  // NOTES-CAP: trim + batasi 500 karakter agar kolom notes konsisten.
  const notesRaw = typeof body.notes === 'string' ? body.notes.trim() : null;
  if (notesRaw !== null && notesRaw.length > 500) {
    return jsonError('VALIDATION', 'notes maksimal 500 karakter.', 422);
  }
  const notes = notesRaw && notesRaw.length > 0 ? notesRaw : null;

  const borrowedAt = body.borrowed_at ? new Date(body.borrowed_at as string) : new Date();
  if (Number.isNaN(borrowedAt.getTime()))
    return jsonError('VALIDATION', 'borrowed_at tidak valid.', 422);
  const dueAt = body.due_at
    ? new Date(body.due_at as string)
    : new Date(addDaysISO(14, borrowedAt));
  if (Number.isNaN(dueAt.getTime())) return jsonError('VALIDATION', 'due_at tidak valid.', 422);
  if (dueAt <= borrowedAt) return jsonError('VALIDATION', 'due_at harus sesudah borrowed_at.', 422);

  // Guard 1: anggota harus active (migrasi: active|suspended|expired|pending)
  const { data: member } = await supabase
    .from('members')
    .select('id,status')
    .eq('id', member_id)
    .single();
  if (!member) return jsonError('NOT_FOUND', 'Anggota tidak ditemukan.', 404);
  if ((member as { status: string }).status !== 'active') {
    return jsonError('VALIDATION', 'Anggota tidak aktif (suspended/expired/pending).', 422);
  }

  // IDEMPOTENCY (pre-check murah; otoritatif di checkout_loan 0015 -> 25001/409):
  // satu pasangan (buku, anggota) hanya 1 loan aktif. Retry aman.
  const { data: activeLoan } = await supabase
    .from('loans')
    .select('id')
    .eq('book_id', book_id)
    .eq('member_id', member_id)
    .in('status', ['borrowed', 'overdue'])
    .limit(1);
  if (activeLoan && (activeLoan as unknown[]).length > 0) {
    return jsonError('CONFLICT', 'Anggota sudah meminjam buku ini (loan aktif).', 409);
  }

  // T-S4: atomic checkout via checkout_loan RPC (row lock + decrement + insert
  // in one transaction). Falls back to the guarded update when the function
  // is not deployed yet (42883 / PGRST202).
  const { data: rpcLoan, error: rpcError } = await supabase.rpc('checkout_loan', {
    p_book_id: book_id,
    p_member_id: member_id,
    p_borrowed_at: borrowedAt.toISOString(),
    p_due_at: dueAt.toISOString(),
    p_notes: notes,
  });
  if (!rpcError) {
    try {
      await writeLog(supabase, user?.id, 'loans.create', (rpcLoan as { id: string }).id, {
        member_id,
        book_id,
      });
    } catch {
      /* best-effort */
    }
    return NextResponse.json({ data: rpcLoan }, { status: 201 });
  }
  const rpcCode = (rpcError as { code?: string }).code ?? '';
  const rpcMsg = rpcError.message ?? '';
  const rpcMissing =
    rpcCode === '42883' ||
    rpcCode === 'PGRST202' ||
    /could not find.*checkout_loan|function.*checkout_loan.*does not exist/i.test(rpcMsg);
  if (!rpcMissing) {
    // S-REL: exact Postgres/SQLSTATE match (not fragile message contains).
    // checkout_loan raises: 25000 stok habis, 02000 buku hilang,
    // 22000 due invalid, 42501 forbidden, 25001 loan aktif ganda. Legacy message regex kept
    // as fallback when code is absent.
    if (rpcCode === '25001' || /sudah meminjam buku ini|loan aktif/i.test(rpcMsg))
      return jsonError('CONFLICT', 'Anggota sudah meminjam buku ini (loan aktif).', 409);
    if (rpcCode === '25000' || /Stok buku habis/i.test(rpcMsg))
      return jsonError('CONFLICT', 'Stok buku habis.', 409);
    if (rpcCode === '02000' || /Buku tidak ditemukan/i.test(rpcMsg))
      return jsonError('NOT_FOUND', 'Buku tidak ditemukan.', 404);
    if (rpcCode === '22000' || /due_at harus sesudah/i.test(rpcMsg))
      return jsonError('VALIDATION', 'due_at harus sesudah borrowed_at.', 422);
    if (rpcCode === '42501')
      return jsonError('FORBIDDEN', 'Tidak berhak meminjam untuk anggota ini.', 403);
    log.error('loans.save_failed', { detail: rpcMsg });
    return jsonError('SAVE_FAILED', 'Gagal mencatat peminjaman.', 500, {
      requestId: log.requestId,
    });
  }

  // Fallback (fungsi belum terdeploy): guarded read-then-write lama.
  // CONCURRENCY-GUARD: pola read-then-write racy bila 2 checkout berebut
  // 1 stok (keduanya membaca avail=1 sebelum menulis). Mitigasi berlapis:
  // (1) conditional write .gt("stock_available", 0) agar decrement hanya
  // berlaku bila stok>0 pada saat tulis; (2) verifikasi pasca-decrement
  // via .select() — bila 0 baris terpengaruh, stok sudah direbut peminjam
  // lain → 409 tanpa insert loan (tanpa ini, update 0-baris tetap sukses
  // diam-diam lalu insert → oversell). Jalur utama tetap atomik via RPC
  // checkout_loan (SELECT ... FOR UPDATE) di atas.
  // Guard 2: stok tersedia
  const { data: book } = await supabase
    .from('books')
    .select('id,stock_available')
    .eq('id', book_id)
    .single();
  if (!book) return jsonError('NOT_FOUND', 'Buku tidak ditemukan.', 404);
  const avail = (book as { stock_available: number }).stock_available ?? 0;
  if (avail <= 0) return jsonError('CONFLICT', 'Stok buku habis.', 409);

  // Kurangi stok (hanya bila masih >0 — cegah race/negatif).
  // Verifikasi pasca-decrement: 0 baris = direbut konkuren → 409, tanpa insert.
  const { data: stockRows, error: stockErr } = await supabase
    .from('books')
    .update({ stock_available: avail - 1 })
    .eq('id', book_id)
    .gt('stock_available', 0)
    .select('id');
  if (stockErr) {
    log.error('loans.save_failed', { detail: stockErr.message });
    return jsonError('SAVE_FAILED', 'Gagal mengurangi stok.', 500, { requestId: log.requestId });
  }
  if (!stockRows || stockRows.length === 0) return jsonError('CONFLICT', 'Stok buku habis.', 409);

  const { data, error } = await supabase
    .from('loans')
    .insert({
      member_id,
      book_id,
      borrowed_at: borrowedAt.toISOString(),
      due_at: dueAt.toISOString(),
      status: 'borrowed',
      fine_amount: 0,
      notes,
    })
    .select()
    .single();

  if (error) {
    await supabase.from('books').update({ stock_available: avail }).eq('id', book_id); // rollback
    log.error('loans.save_failed', { detail: error.message });
    return jsonError('SAVE_FAILED', 'Gagal mencatat peminjaman.', 500, {
      requestId: log.requestId,
    });
  }
  try {
    await writeLog(supabase, user?.id, 'loans.create', (data as { id: string }).id, {
      member_id,
      book_id,
    });
  } catch {
    /* best-effort */
  }
  return NextResponse.json({ data }, { status: 201 });
}

export async function PUT(req: Request) {
  const guard = await requireStaff(['admin', 'librarian']);
  if ('errorResponse' in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase, user } = guard as {
    supabase: ReturnType<typeof createClient>;
    user: { id: string };
  };

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return jsonError('VALIDATION', 'Parameter ?id= wajib.', 400);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError('INVALID_JSON', 'Body JSON tidak valid.', 400);
  }
  if (body.action === 'extend') {
    // S-roi7 single-source: delegasi ke extendLoan (guard 409 + due_at shift + audit).
    return extendLoan({
      supabase,
      id,
      userId: user?.id ?? null,
      days: body.days as number | undefined,
    });
  }
  if (body.action !== 'return') return jsonError('VALIDATION', "Kirim { action: 'return' }.", 422);

  // S-roi3 single-source: delegasi ke returnLoan (pemilik 409 + calcFine + clamp + fines + audit).
  return returnLoan({
    supabase,
    id,
    userId: user?.id ?? null,
    returnedAt: body.returned_at as string | undefined,
    notes: typeof body.notes === 'string' ? body.notes : undefined,
  });
}

export async function DELETE(req: Request) {
  const log = createLogger(requestIdFromHeaders(req.headers));
  const guard = await requireStaff(['admin']);
  if ('errorResponse' in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase, user } = guard as {
    supabase: ReturnType<typeof createClient>;
    user: { id: string };
  };

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return jsonError('VALIDATION', 'Parameter ?id= wajib.', 400);

  const { data: loan } = await supabase.from('loans').select('status').eq('id', id).single();
  if (!loan) return jsonError('NOT_FOUND', 'Peminjaman tidak ditemukan.', 404);
  if (
    (loan as { status: string }).status === 'borrowed' ||
    (loan as { status: string }).status === 'overdue'
  ) {
    return jsonError('CONFLICT', 'Tidak bisa hapus peminjaman berjalan. Kembalikan dulu.', 409);
  }

  const { error } = await supabase.from('loans').delete().eq('id', id);
  if (error) {
    log.error('loans.delete_failed', { detail: error.message });
    return jsonError('DELETE_FAILED', 'Gagal menghapus peminjaman.', 500, {
      requestId: log.requestId,
    });
  }
  try {
    await writeLog(supabase, user?.id, 'loans.delete', id);
  } catch {}
  return NextResponse.json({ message: 'Peminjaman dihapus.' });
}
