import { NextResponse } from 'next/server';

/**
 * GET /api/health — liveness probe (no DB, no auth).
 * Contract: 200 { status: "ok", uptime: number, checks: Record<string,string> }.
 *
 * Sentry activation note (stub only — do NOT add @sentry/* without approval):
 * When Sentry is approved, wrap this handler with `withSentry` / `wrapRouteHandlerWithSentry`
 * and add a `sentry` entry to `checks` (e.g. checks.sentry = "enabled" when
 * SENTRY_DSN is set, else "disabled"). Keep this route dependency-free so
 * Docker HEALTHCHECK and Cloudflare Workers stay fast even with Sentry off.
 */

const BOOT_TIME = Date.now();

export async function GET(): Promise<NextResponse> {
  const uptime = process.uptime();
  return NextResponse.json(
    {
      status: 'ok',
      uptime,
      bootTime: new Date(BOOT_TIME).toISOString(),
      checks: {
        app: 'ok',
        // sentry: disabled (stub — enable via withSentry after approval, see note above)
        sentry: 'disabled',
      },
    },
    { status: 200 }
  );
}
