import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/readyz — readiness probe (Supabase ping, no auth).
 * Contract: 200 { ready: true, checks: { supabase: "ok", latencyMs: number } }
 *            503 { ready: false, checks: { supabase: "error", detail?: string } }
 * Deploy stays Cloudflare Workers; this route is also the compose/Docker gate.
 */

export async function GET(): Promise<NextResponse> {
  const started = Date.now();
  try {
    const supabase = createClient();
    const { error } = await supabase.from('books').select('id').limit(1);
    if (error) {
      return NextResponse.json(
        {
          ready: false,
          checks: { supabase: 'error', detail: 'ping failed' },
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      {
        ready: true,
        checks: { supabase: 'ok', latencyMs: Date.now() - started },
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      {
        ready: false,
        checks: { supabase: 'error', detail: 'unreachable' },
      },
      { status: 503 }
    );
  }
}
