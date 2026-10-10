import { NextResponse } from 'next/server';
import { jsonError } from '@/lib/supabase/auth';
import { isUuid } from '@/lib/api-utils';
import { getSession } from '@/lib/session';
import { createLogger, requestIdFromHeaders } from '@/lib/logger';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/fines/[id] — pemilik (member_id miliknya) / pustakawan+
 * Denda dibayar via POST /api/fines/[id]/pay (pustakawan+).
 */

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const log = createLogger(requestIdFromHeaders(_req.headers));
  const s = await getSession();
  if ('errorResponse' in s) return s.errorResponse;
  const { supabase, isStaff, memberId } = s.session;
  // #54: id path WAJIB UUID — tolak 400 lebih awal, bukan string sembaran ke query.
  if (!isUuid(id)) return jsonError('VALIDATION', 'ID denda tidak valid (harus UUID).', 400);

  const { data, error } = await supabase
    .from('fines')
    .select('*, loans(id,book_id,due_at,status), members(id,member_code)')
    .eq('id', id)
    .single();
  if (error || !data) {
    log.warn('fines.id.not_found', { detail: error?.message ?? 'not-found' });
    return jsonError('NOT_FOUND', 'Denda tidak ditemukan.', 404, { requestId: log.requestId });
  }

  if (!isStaff && (data as { member_id: string }).member_id !== memberId) {
    return jsonError('FORBIDDEN', 'Bukan denda milik Anda.', 403);
  }

  return NextResponse.json({ data }, { headers: { 'Cache-Control': 'no-store' } });
}
