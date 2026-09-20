import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { jsonError } from '@/lib/supabase/auth';
import { createLogger, requestIdFromHeaders } from '@/lib/logger';

type Ctx = { params: { id: string } };

/**
 * GET /api/fines/[id] — pemilik (member_id miliknya) / pustakawan+
 * Denda dibayar via POST /api/fines/[id]/pay (pustakawan+).
 */

export async function GET(_req: Request, { params }: Ctx) {
  const log = createLogger(requestIdFromHeaders(_req.headers));
  const supabase = createClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) return jsonError('UNAUTHORIZED', 'Silakan login.', 401);

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  const role = (profile as { role: string } | null)?.role ?? 'member';
  const isStaff = role === 'admin' || role === 'librarian';

  const { data, error } = await supabase
    .from('fines')
    .select('*, loans(id,book_id,due_at,status), members(id,member_code)')
    .eq('id', params.id)
    .single();
  if (error || !data) {
    log.warn('fines.id.not_found', { detail: error?.message ?? 'not-found' });
    return jsonError('NOT_FOUND', 'Denda tidak ditemukan.', 404, { requestId: log.requestId });
  }

  if (!isStaff) {
    const { data: member } = await supabase
      .from('members')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    const ownId = (member as { id: string } | null)?.id ?? null;
    if ((data as { member_id: string }).member_id !== ownId) {
      return jsonError('FORBIDDEN', 'Bukan denda milik Anda.', 403);
    }
  }

  return NextResponse.json({ data }, { headers: { 'Cache-Control': 'no-store' } });
}
