import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { jsonError } from '@/lib/supabase/auth';
import { createLogger, requestIdFromHeaders } from '@/lib/logger';
import { isCronAuthorized } from '@/lib/cron-sweep';

/**
 * GET /api/cron/sweep-reservations — Vercel Cron harian (isu #76).
 * Menandai reservasi pending/ready yang lewat expires_at → expired via RPC
 * sweep_expired_reservations() (migrasi 0026). Guard: header
 * `Authorization: Bearer <CRON_SECRET>` (Vercel mengirim otomatis bila env
 * CRON_SECRET diset di dashboard). Secret tak cocok → 401; secret/service
 * key belum dikonfigurasi → 500 fail-closed (jangan sweep tanpa auth).
 */

function revalidateReservations(): void {
  try {
    revalidateTag('reservations', 'max');
  } catch {
    /* abaikan */
  }
  try {
    revalidatePath('/admin/reservasi');
  } catch {
    /* abaikan */
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
    return jsonError('UNAUTHORIZED', 'Cron secret tidak valid.', 401);
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

  const { data, error } = await supabase.rpc('sweep_expired_reservations');
  if (error) {
    log.error('cron.sweep.failed', { detail: error.message });
    return jsonError('SWEEP_FAILED', 'Gagal sweep reservasi kedaluwarsa.', 500, {
      requestId: log.requestId,
    });
  }
  const swept = typeof data === 'number' ? data : 0;
  log.info('cron.sweep.done', { swept });
  revalidateReservations();
  return NextResponse.json({ data: { swept } }, { headers: { 'Cache-Control': 'no-store' } });
}
