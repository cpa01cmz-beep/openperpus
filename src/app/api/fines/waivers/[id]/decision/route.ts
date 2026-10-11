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

/**
 * POST /api/fines/waivers/[id]/decision { approve: boolean, note? } — admin.
 * Langkah 2 pembebasan denda dua tahap (#72): keputusan approve/reject.
 * Segregation of duties: approver WAJIB admin dan BERBEDA dari pengaju
 * (self-approval ditolak 403 — dijaga juga CHECK constraint di DB).
 */

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const log = createLogger(requestIdFromHeaders(req.headers));
  // Hanya admin yang memutuskan — librarian hanya bisa MENGajukan (route waive).
  const guard = await requireStaff(['admin']);
  if ('errorResponse' in guard && guard.errorResponse) return guard.errorResponse;
  const { supabase, user } = guard as {
    supabase: ReturnType<typeof import('@/lib/supabase/server').createClient>;
    user: { id: string };
  };
  // #54: id path WAJIB UUID — tolak 400 lebih awal.
  if (!isUuid(id)) return jsonError('VALIDATION', 'ID pengajuan tidak valid (harus UUID).', 400);

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError('INVALID_JSON', 'Body JSON tidak valid.', 400);
  }

  if (typeof body.approve !== 'boolean') {
    return jsonError('VALIDATION', 'approve wajib boolean (true=setujui, false=tolak).', 422);
  }
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (note.length > 500) {
    return jsonError('VALIDATION', 'Catatan keputusan maksimal 500 karakter.', 422);
  }

  const rpc = (supabase as unknown as { rpc?: RpcLike }).rpc;
  if (typeof rpc === 'function') {
    try {
      const { data, error } = await rpc('decide_fine_waiver', {
        p_waiver_id: id,
        p_approve: body.approve,
        p_note: note || null,
        p_user_id: user.id,
      });
      const rc = (error as { code?: string; message?: string } | null) ?? null;
      if (!rpcMissing(rc, 'decide_fine_waiver') && !error && data) {
        return NextResponse.json({ data });
      }
      if (!rpcMissing(rc, 'decide_fine_waiver') && rc) {
        if (rc.code === '25001') return jsonError('CONFLICT', rc.message || 'Konflik status.', 409);
        if (rc.code === '02000')
          return jsonError('NOT_FOUND', 'Pengajuan pembebasan tidak ditemukan.', 404);
        if (rc.code === '42501') return jsonError('FORBIDDEN', rc.message || 'Tidak berhak.', 403);
        return jsonError('SAVE_FAILED', 'Gagal memutuskan pembebasan.', 500, {
          requestId: log.requestId,
        });
      }
    } catch {
      // jatuh ke fallback di bawah
    }
  }

  // Fallback (RPC belum terdeploy): update langsung, guard yang sama.
  const { data: waiver, error: waiveErr } = await supabase
    .from('fine_waivers')
    .select('*')
    .eq('id', id)
    .single();
  if (waiveErr || !waiver) {
    return jsonError('NOT_FOUND', 'Pengajuan pembebasan tidak ditemukan.', 404);
  }
  const w = waiver as {
    fine_id: string;
    status: string;
    reason: string;
    requested_by: string;
  };
  if (w.status !== 'requested') {
    return jsonError('CONFLICT', 'Pengajuan pembebasan sudah diputuskan.', 409);
  }
  // Segregation of duties: pengaju tidak boleh menyetujui pengajunya sendiri.
  if (w.requested_by === user.id) {
    return jsonError(
      'FORBIDDEN',
      'Pembebasan tidak boleh disetujui pengajunya sendiri — minta admin lain.',
      403
    );
  }

  if (body.approve) {
    const { data: fineRow } = await supabase
      .from('fines')
      .select('id, notes')
      .eq('id', w.fine_id)
      .single();
    const baseNotes =
      typeof (fineRow as { notes?: string | null } | null)?.notes === 'string'
        ? (fineRow as { notes: string }).notes
        : '';
    const { data: updatedFine, error: fineErr } = await supabase
      .from('fines')
      .update({
        status: 'waived',
        notes: ((baseNotes ? baseNotes + ' | ' : '') + `Dibebaskan (waive): ${w.reason}`).slice(
          0,
          2000
        ),
      })
      .eq('id', w.fine_id)
      .in('status', ['unpaid', 'partial'])
      .select()
      .single();
    if (fineErr || !updatedFine) {
      return jsonError('CONFLICT', 'Denda sudah berubah status, muat ulang dulu.', 409);
    }
  }

  const { data, error } = await supabase
    .from('fine_waivers')
    .update({
      status: body.approve ? 'approved' : 'rejected',
      approved_by: user.id,
      decision_note: note || null,
      decided_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();
  if (error || !data) {
    log.error('fines.waive.decision_failed', { detail: error?.message ?? 'update failed' });
    return jsonError('SAVE_FAILED', 'Gagal memutuskan pembebasan.', 500, {
      requestId: log.requestId,
    });
  }

  try {
    await supabase.from('activity_logs').insert({
      user_id: user.id,
      action: body.approve ? 'fines.waive_approve' : 'fines.waive_reject',
      entity_type: 'fines',
      entity_id: w.fine_id,
      metadata: {
        waiver_id: id,
        reason: w.reason,
        requested_by: w.requested_by,
        approved_by: user.id,
        approved: body.approve,
        note: note || null,
      },
    });
  } catch {
    /* best-effort */
  }

  return NextResponse.json({ data });
}
