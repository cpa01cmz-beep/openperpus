import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireStaff, jsonError } from '@/lib/supabase/auth';
import { returnLoan, extendLoan } from '@/lib/loans-return';
import { createLogger, requestIdFromHeaders } from '@/lib/logger';

type Ctx = { params: { id: string } };

/**
 * GET /api/loans/[id] — pustakawan+ (atau pemilik? kontrak: anggota otomatis miliknya).
 *   Di sini: staf penuh; anggota boleh bila loan miliknya.
 * PUT /api/loans/[id] {action:"return", returned_at?, notes?} — pustakawan+ (alias route koleksi ?id=)
 * DELETE /api/loans/[id] — admin (hanya returned/lost)
 */

function revalidateLoans(): string[] {
  const done: string[] = [];
  try {
    revalidateTag('loans');
    done.push('loans');
  } catch {
    /* abaikan */
  }
  try {
    revalidateTag('books');
    done.push('books');
  } catch {
    /* abaikan */
  }
  try {
    revalidatePath('/admin/peminjaman');
    done.push('/admin/peminjaman');
  } catch {
    /* abaikan */
  }
  return done;
}

export async function GET(_req: Request, { params }: Ctx) {
  const log = createLogger(requestIdFromHeaders(_req.headers));
  const supabase = createClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) return jsonError('UNAUTHORIZED', 'Silakan login.', 401);

  const { data: loan, error } = await supabase
    .from('loans')
    .select('*, members(id,member_code,user_id), books(id,title,slug)')
    .eq('id', params.id)
    .single();
  if (error || !loan) {
    log.warn('loans.id.not_found', { detail: error?.message ?? 'not-found' });
    return jsonError('NOT_FOUND', 'Peminjaman tidak ditemukan.', 404, { requestId: log.requestId });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  const role = (profile as { role: string } | null)?.role ?? 'member';
  const isStaff = role === 'admin' || role === 'librarian';
  if (!isStaff) {
    const owner = (loan as { members: { user_id: string } | null }).members?.user_id;
    if (owner !== user.id) return jsonError('FORBIDDEN', 'Bukan pinjaman milik Anda.', 403);
  }

  return NextResponse.json({ data: loan }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT(req: Request, { params }: Ctx) {
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
  if (body.action === 'extend') {
    const res = await extendLoan({
      supabase,
      id: params.id,
      userId: user?.id ?? null,
      days: body.days as number | undefined,
    });
    if (res.status !== 200) return res;
    const j = (await res.json()) as { data: unknown };
    return NextResponse.json({ data: j.data, revalidated: revalidateLoans() });
  }
  if (body.action !== 'return') return jsonError('VALIDATION', "Kirim { action: 'return' }.", 422);

  const res = await returnLoan({
    supabase,
    id: params.id,
    userId: user?.id ?? null,
    returnedAt: body.returned_at as string | undefined,
    notes: typeof body.notes === 'string' ? body.notes : undefined,
  });
  if (res.status !== 200) return res;
  const j = (await res.json()) as { data: unknown };
  return NextResponse.json({ data: j.data, revalidated: revalidateLoans() });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const log = createLogger(requestIdFromHeaders(_req.headers));
  const guard = await requireStaff(['admin']);
  if ('errorResponse' in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase, user } = guard as {
    supabase: ReturnType<typeof createClient>;
    user: { id: string };
  };

  const { data: loan } = await supabase.from('loans').select('status').eq('id', params.id).single();
  if (!loan) return jsonError('NOT_FOUND', 'Peminjaman tidak ditemukan.', 404);
  if (
    (loan as { status: string }).status === 'borrowed' ||
    (loan as { status: string }).status === 'overdue'
  ) {
    return jsonError('CONFLICT', 'Tidak bisa hapus peminjaman berjalan. Kembalikan dulu.', 409);
  }

  const { error } = await supabase.from('loans').delete().eq('id', params.id);
  if (error) {
    log.error('loans.id.delete_failed', { detail: error.message });
    return jsonError('DELETE_FAILED', 'Gagal menghapus peminjaman.', 500, {
      requestId: log.requestId,
    });
  }

  try {
    await supabase.from('activity_logs').insert({
      user_id: user?.id ?? null,
      action: 'loans.delete',
      entity_type: 'loans',
      entity_id: params.id,
      metadata: {},
    });
  } catch {
    /* best-effort */
  }

  return NextResponse.json({ message: 'Peminjaman dihapus.', revalidated: revalidateLoans() });
}
