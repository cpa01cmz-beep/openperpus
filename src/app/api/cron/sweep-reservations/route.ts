import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { jsonError } from '@/lib/supabase/auth';
import { withTimeout } from '@/lib/fetch-with-retry';
import { createLogger, requestIdFromHeaders, type Logger } from '@/lib/logger';
import { isCronAuthorized } from '@/lib/cron-sweep';

/**
 * GET /api/cron/sweep-reservations — Vercel Cron harian (isu #76).
 * Menandai reservasi pending/ready yang lewat expires_at → expired via RPC
 * sweep_expired_reservations() (migrasi 0028). Guard: header
 * `Authorization: Bearer <CRON_SECRET>` (Vercel mengirim otomatis bila env
 * CRON_SECRET diset di dashboard). Secret tak cocok → 401; secret/service
 * key belum dikonfigurasi → 500 fail-closed (jangan sweep tanpa auth).
 */

function revalidateReservations(log: Logger): void {
  try {
    revalidateTag('reservations', 'max');
  } catch (err) {
    log.warn('cron.sweep.revalidate_tag_failed', { detail: String(err) });
  }
  try {
    revalidatePath('/admin/reservasi');
  } catch (err) {
    log.warn('cron.sweep.revalidate_path_failed', { detail: String(err) });
  }
}

export async function GET(req: Request) {
  const log = createLogger(requestIdFromHeaders(req.headers));
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    log.error('cron.sweep.not_configured');
    return jsonError('CRON_NOT_CONFIGURED', 'CRON_SECRET belum dikonfigurasi.', 500, {
      requestId: log.requestId,
    });
  }
  if (!isCronAuthorized(req.headers.get('authorization'), secret)) {
    log.warn('cron.sweep.unauthorized');
    return jsonError('UNAUTHORIZED', 'Cron secret tidak valid.', 401, {
      requestId: log.requestId,
    });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    log.error('cron.sweep.no_service_client');
    return jsonError('CRON_NOT_CONFIGURED', 'Kredensial service Supabase belum dikonfigurasi.', 500, {
      requestId: log.requestId,
    });
  }
  const supabase = createServiceClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Isu #69 readyTimeoutMs baca per-request: sweep ikut pola yang sama —
  // RPC service-role dibatasi timeout eksplisit agar cron tak menggantung.
  const rawTimeout = Number(process.env.SWEEP_TIMEOUT_MS);
  const sweepTimeoutMs =
    Number.isFinite(rawTimeout) && rawTimeout >= 250 ? Math.trunc(rawTimeout) : 9000;
  let rpc: { data: unknown; error: { message: string } | null };
  try {
    rpc = await withTimeout(supabase.rpc('sweep_expired_reservations'), sweepTimeoutMs);
  } catch (e) {
    const timedOut = (e as { name?: string } | null)?.name === 'TimeoutError';
    log.error('cron.sweep.failed', {
      detail: timedOut ? `timeout after ${sweepTimeoutMs}ms` : String(e),
    });
    return jsonError('SWEEP_FAILED', 'Gagal sweep reservasi kedaluwarsa.', 500, {
      requestId: log.requestId,
    });
  }
  const { data, error } = rpc;
  if (error) {
    log.error('cron.sweep.failed', { detail: error.message });
    return jsonError('SWEEP_FAILED', 'Gagal sweep reservasi kedaluwarsa.', 500, {
      requestId: log.requestId,
    });
  }
  const swept = typeof data === 'number' ? data : 0;
  log.info('cron.sweep.done', { swept });
  revalidateReservations(log);
  return NextResponse.json({ data: { swept } }, { headers: { 'Cache-Control': 'no-store' } });
}
