import { NextResponse } from 'next/server';
import { jsonError, requireStaff } from '@/lib/supabase/auth';
import { isUuid } from '@/lib/api-utils';
import { createLogger, requestIdFromHeaders } from '@/lib/logger';

type Ctx = { params: Promise<{ id: string }> };

type RpcLike = (
  fn: string,
  args?: Record<string, unknown>
) => Promise<{ data: unknown; error: unknown }>;

/** Deteksi "fungsi RPC belum terdeploy" (42883 undefined_function / PGRST202). */
function rpcMissing(err: { code?: string; message?: string } | null, fn: string): boolean {
  if (!err) return false;
  if (err.code === '42883' || err.code === 'PGRST202') return true;
  return new RegExp(`could not find.*${fn}|function.*${fn}.*does not exist`, 'i').test(
    err.message ?? ''
  );
}

/** SQLSTATE RPC -> envelope {code,message} konsisten (sama seperti pay route). */
function rpcErrorToHttp(
  rc: { code?: string; message?: string } | null,
  notFoundMsg: string
): NextResponse | null {
  if (!rc) return null;
  if (rc.code === '25001') return jsonError('CONFLICT', rc.message || 'Konflik status.', 409);
  if (rc.code === '02000') return jsonError('NOT_FOUND', notFoundMsg, 404);
  if (rc.code === '22000') return jsonError('VALIDATION', rc.message || 'Input tidak valid.', 422);
  if (rc.code === '42501') return jsonError('FORBIDDEN', rc.message || 'Tidak berhak.', 403);
  return null;
}

/**
 * POST /api/fines/[id]/waive { reason } — staff (admin/librarian).
 * Langkah 1 pembebasan denda dua tahap (#72): pengajuan + approval admin lain.
 * Alasan WAJIB (minimal 10 karakter) dan tercatat di fine_waivers; keputusan
 * (approve/reject) lewat POST /api/fines/waivers/[id]/decision.
 */

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const log = createLogger(requestIdFromHeaders(req.headers));
  const guard = await requireStaff(['admin', 'librarian']);
  if ('errorResponse' in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase, user } = guard as {
    supabase: ReturnType<typeof import('@/lib/supabase/server').createClient>;
    user: { id: string };
  };
  // #54: id path WAJIB UUID — tolak 400 lebih awal.
  if (!isUuid(id)) return jsonError('VALIDATION', 'ID denda tidak valid (harus UUID).', 400);

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError('INVALID_JSON', 'Body JSON tidak valid.', 400);
  }

  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (reason.length < 10) {
    return jsonError('VALIDATION', 'Alasan pembebasan wajib diisi minimal 10 karakter.', 422);
  }
  if (reason.length > 2000) {
    return jsonError('VALIDATION', 'Alasan maksimal 2000 karakter.', 422);
  }

  const rpc = (supabase as unknown as { rpc?: RpcLike }).rpc;
  if (typeof rpc === 'function') {
    try {
      const { data, error } = await rpc('request_fine_waiver', {
        p_fine_id: id,
        p_reason: reason,
        p_user_id: user.id,
      });
      const rc = (error as { code?: string; message?: string } | null) ?? null;
      if (!rpcMissing(rc, 'request_fine_waiver') && !error && data) {
        return NextResponse.json({ data }, { status: 201 });
      }
      if (!rpcMissing(rc, 'request_fine_waiver') && rc) {
        return (
          rpcErrorToHttp(rc, 'Denda tidak ditemukan.') ??
          jsonError('SAVE_FAILED', 'Gagal mengajukan pembebasan.', 500, {
            requestId: log.requestId,
          })
        );
      }
    } catch {
      // jatuh ke fallback di bawah
    }
  }

  // Fallback (RPC belum terdeploy): tulis langsung fine_waivers + audit.
  const { data: fine } = await supabase.from('fines').select('id, status').eq('id', id).single();
  if (!fine) return jsonError('NOT_FOUND', 'Denda tidak ditemukan.', 404);
  if (
    (fine as { status: string }).status !== 'unpaid' &&
    (fine as { status: string }).status !== 'partial'
  ) {
    return jsonError('CONFLICT', 'Denda sudah lunas/dibebaskan.', 409);
  }

  const { data: existing } = await supabase
    .from('fine_waivers')
    .select('id')
    .eq('fine_id', id)
    .eq('status', 'requested')
    .maybeSingle();
  if (existing) {
    return jsonError('CONFLICT', 'Sudah ada pengajuan pembebasan yang menunggu approval.', 409);
  }

  const { data, error } = await supabase
    .from('fine_waivers')
    .insert({ fine_id: id, reason, requested_by: user.id })
    .select()
    .single();
  if (error || !data) {
    log.error('fines.waive.save_failed', { detail: error?.message ?? 'insert failed' });
    return jsonError('SAVE_FAILED', 'Gagal mengajukan pembebasan.', 500, {
      requestId: log.requestId,
    });
  }

  try {
    await supabase.from('activity_logs').insert({
      user_id: user.id,
      action: 'fines.waive_request',
      entity_type: 'fines',
      entity_id: id,
      metadata: { reason, requested_by: user.id },
    });
  } catch {
    /* best-effort */
  }

  return NextResponse.json({ data }, { status: 201 });
}
