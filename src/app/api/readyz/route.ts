import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withTimeout } from '@/lib/fetch-with-retry';
import { recordReadyzProbe } from '@/lib/sli';
import { requestIdFromHeaders } from '@/lib/logger';

/**
 * GET /api/readyz — readiness probe (Supabase ping, auth optional).
 * Contract: 200 { ready: true, checks: { supabase: "ok", latencyMs: number } }
 *            503 { ready: false, checks: { supabase: "error", detail?: string } }
 *            401 { ready: false, checks: { supabase: "error", detail: "unauthorized" } }
 *             (hanya bila READYZ_TOKEN di-set)
 * Deploy stays Cloudflare Workers; this route is also the compose/Docker gate.
 *
 * Isu #69 — probe dulu menggantung selamanya bila Supabase lambat ("hang DB =
 * hang probe") dan tanpa Cache-Control. Sekarang:
 * - ping dibatasi READYZ_TIMEOUT_MS (default 3000) -> 503 detail 'timeout';
 * - Cache-Control: no-store agar LB/orchestrator tidak menyimpan jawaban;
 * - opsional READYZ_TOKEN: bila di-set probe butuh `Authorization: Bearer`;
 * - setiap probe dicatat ke registry SLI (availability + latensi Supabase)
 *   sehingga /api/metrics?format=json memuat baris readyz yang nyata;
 * - x-request-id di-respons supaya kegagalan bisa dikorelasikan dengan log.
 */

const DEFAULT_READYZ_TIMEOUT_MS = 3000;

/** Batas waktu ping (ms). Baca per-request agar override env terpakai. */
export function readyTimeoutMs(): number {
  const raw = Number(process.env.READYZ_TIMEOUT_MS);
  return Number.isFinite(raw) && raw >= 250 ? Math.trunc(raw) : DEFAULT_READYZ_TIMEOUT_MS;
}

/** Deteksi TimeoutError lintas runtime (DOMException/Error biasa). */
function isTimeoutError(e: unknown): boolean {
  return (e as { name?: string } | null)?.name === 'TimeoutError';
}

export async function GET(req?: Request): Promise<NextResponse> {
  const started = Date.now();
  const timeoutMs = readyTimeoutMs();
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'x-request-id': req ? requestIdFromHeaders(req.headers) : 'probe',
  });

  // Opsional: READYZ_TOKEN (default mati — probe publik tetap bebas auth).
  const expected = process.env.READYZ_TOKEN;
  if (expected) {
    const provided = (req?.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (provided !== expected) {
      recordReadyzProbe(false, Date.now() - started);
      return NextResponse.json(
        { ready: false, checks: { supabase: 'error', detail: 'unauthorized' } },
        { status: 401, headers }
      );
    }
  }

  const finish = (ok: boolean, body: Record<string, unknown>, status: number) => {
    const durationMs = Date.now() - started;
    recordReadyzProbe(ok, durationMs, ok ? durationMs : undefined);
    return NextResponse.json(body, { status, headers });
  };

  try {
    const supabase = createClient();
    const ping = Promise.resolve(supabase.from('books').select('id').limit(1));
    // Timeout mutlak: Supabase menggantung -> 503 cepat, bukan probe nyangkut.
    const { error } = await withTimeout(ping, timeoutMs);
    if (error) {
      return finish(
        false,
        { ready: false, checks: { supabase: 'error', detail: 'ping failed' } },
        503
      );
    }
    const latencyMs = Date.now() - started;
    return finish(true, { ready: true, checks: { supabase: 'ok', latencyMs } }, 200);
  } catch (e) {
    return finish(
      false,
      {
        ready: false,
        checks: {
          supabase: 'error',
          detail: isTimeoutError(e) ? 'timeout' : 'unreachable',
          timeoutMs,
        },
      },
      503
    );
  }
}
