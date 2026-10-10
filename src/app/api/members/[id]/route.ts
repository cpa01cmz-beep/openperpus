import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireStaff, jsonError } from '@/lib/supabase/auth';
import { isUuid } from '@/lib/api-utils';
import { createLogger, requestIdFromHeaders } from '@/lib/logger';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/members/[id] — pustakawan+
 * PUT /api/members/[id] — pustakawan+ (partial update: status/address/phone)
 * DELETE /api/members/[id] — admin (tolak bila ada loan borrowed/overdue)
 *
 * Satu transport ID (issue #54): id hanya via path REST, bukan ?id=.
 * Kolom mengikuti migrasi 0001; nama/email ada di profiles.full_name.
 */

const STATUSES = ['active', 'suspended', 'expired', 'pending'] as const;

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const log = createLogger(requestIdFromHeaders(_req.headers));

  const guard = await requireStaff();
  if ('errorResponse' in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase } = guard as { supabase: ReturnType<typeof createClient> };
  // #54: id path WAJIB UUID — tolak 400 lebih awal, bukan string sembaran ke query.
  if (!isUuid(id)) return jsonError('VALIDATION', 'ID anggota tidak valid (harus UUID).', 400);
  const { data, error } = await supabase
    .from('members')
    .select('*, profiles(id,full_name)')
    .eq('id', id)
    .single();
  if (error || !data) {
    log.warn('members.id.not_found', { detail: error?.message ?? 'not-found' });
    return jsonError('NOT_FOUND', 'Anggota tidak ditemukan.', 404, { requestId: log.requestId });
  }
  return NextResponse.json({ data }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const log = createLogger(requestIdFromHeaders(req.headers));
  const guard = await requireStaff(['admin', 'librarian']);
  if ('errorResponse' in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase } = guard as { supabase: ReturnType<typeof createClient> };
  // #54: id path WAJIB UUID — tolak 400 lebih awal, bukan string sembaran ke query.
  if (!isUuid(id)) return jsonError('VALIDATION', 'ID anggota tidak valid (harus UUID).', 400);
  if (!isUuid(id)) return jsonError('VALIDATION', 'ID anggota tidak valid (harus UUID).', 400);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError('INVALID_JSON', 'Body JSON tidak valid.', 400);
  }

  const payload: Record<string, unknown> = {};
  if (body.phone !== undefined || body.telepon !== undefined)
    payload.phone = (body.phone ?? body.telepon) as string | null;
  if (body.address !== undefined || body.alamat !== undefined)
    payload.address = (body.address ?? body.alamat) as string | null;
  if (body.status !== undefined) {
    if (!(STATUSES as readonly string[]).includes(body.status as string)) {
      return jsonError('VALIDATION', 'status harus: active|suspended|expired|pending.', 422);
    }
    payload.status = body.status;
  }
  if (body.member_code !== undefined) payload.member_code = body.member_code;

  const { data, error } = await supabase
    .from('members')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) {
    log.error('members.id.save_failed', { detail: error.message });
    return jsonError('SAVE_FAILED', 'Gagal mengupdate anggota.', 500, {
      requestId: log.requestId,
    });
  }
  return NextResponse.json({ data });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const log = createLogger(requestIdFromHeaders(_req.headers));
  const guard = await requireStaff(['admin']);
  if ('errorResponse' in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase } = guard as { supabase: ReturnType<typeof createClient> };
  // #54: id path WAJIB UUID — tolak 400 lebih awal, bukan string sembaran ke query.
  if (!isUuid(id)) return jsonError('VALIDATION', 'ID anggota tidak valid (harus UUID).', 400);
  if (!isUuid(id)) return jsonError('VALIDATION', 'ID anggota tidak valid (harus UUID).', 400);

  const { count } = await supabase
    .from('loans')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', id)
    .in('status', ['borrowed', 'overdue']);
  if ((count ?? 0) > 0) return jsonError('CONFLICT', 'Anggota masih punya pinjaman berjalan.', 409);

  const { error } = await supabase.from('members').delete().eq('id', id);
  if (error) {
    log.error('members.id.delete_failed', { detail: error.message });
    return jsonError('DELETE_FAILED', 'Gagal menghapus anggota.', 500, {
      requestId: log.requestId,
    });
  }
  return NextResponse.json({ message: 'Anggota dihapus.' });
}
