import { NextResponse } from 'next/server';
import { createLogger, requestIdFromHeaders } from '@/lib/logger';
import { recordApiSample, renderSliPrometheus, sliAlerts, sliSnapshot } from '@/lib/sli';
import { getBreakerStats } from '@/lib/fetch-with-retry';

export async function GET(req: Request) {
  const logger = createLogger(requestIdFromHeaders(req.headers));
  const route = '/api/metrics';

  // METRICS_TOKEN auth gate
  const metricsToken = process.env.METRICS_TOKEN;
  if (metricsToken) {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      recordApiSample(route, 401, 0);
      logger.warn('metrics_unauthorized', { reason: 'missing_or_invalid_auth_header' });
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Invalid or missing Authorization header' } },
        { status: 401 }
      );
    }
    const providedToken = authHeader.slice('Bearer '.length);
    if (providedToken !== metricsToken) {
      recordApiSample(route, 401, 0);
      logger.warn('metrics_unauthorized', { reason: 'invalid_token' });
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Invalid or missing Authorization header' } },
        { status: 401 }
      );
    }
  }

  // Isu #69: "Dashboard SLI tersedia". Default tetap teks Prometheus (scrape
  // Prometheus/Cloudflare); ?format=json mengembalikan dashboard yang sama
  // dalam JSON (availability, 5xx-rate, p50/p95/p99, readyz, burn-rate).
  const wantJson = new URL(req.url).searchParams.get('format') === 'json';

  try {
    const started = Date.now();
    const mem = process.memoryUsage();
    const uptime = process.uptime();

    // Snapshot SLI dari registry bersama (diisi handler API lain).
    const sli = sliSnapshot(Date.now(), undefined, getBreakerStats());
    const alerts = sliAlerts(sli);

    recordApiSample(route, 200, Date.now() - started);
    logger.debug('metrics_served', { uptime, heapUsed: mem.heapUsed, alerts: alerts.length });

    const headers = {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'x-request-id': logger.requestId ?? 'unknown',
    };

    if (wantJson) {
      return NextResponse.json(
        {
          generatedAt: sli.generatedAt,
          windowMs: sli.windowMs,
          slo: sli.targets,
          process: {
            uptimeSeconds: uptime,
            heapUsedBytes: mem.heapUsed,
            heapTotalBytes: mem.heapTotal,
            rssBytes: mem.rss,
            externalBytes: mem.external,
          },
          readyz: sli.readyz,
          totals: sli.totals,
          routes: sli.routes,
          breakers: sli.breakers,
          alerts,
        },
        { status: 200, headers }
      );
    }

    const metrics = [
      `# HELP process_uptime_seconds Process uptime in seconds`,
      `# TYPE process_uptime_seconds gauge`,
      `process_uptime_seconds ${uptime.toFixed(3)}`,
      ``,
      `# HELP process_heap_used_bytes Heap used in bytes`,
      `# TYPE process_heap_used_bytes gauge`,
      `process_heap_used_bytes ${mem.heapUsed}`,
      ``,
      `# HELP process_heap_total_bytes Heap total in bytes`,
      `# TYPE process_heap_total_bytes gauge`,
      `process_heap_total_bytes ${mem.heapTotal}`,
      ``,
      `# HELP process_rss_bytes RSS in bytes`,
      `# TYPE process_rss_bytes gauge`,
      `process_rss_bytes ${mem.rss}`,
      ``,
      `# HELP process_external_bytes External memory in bytes`,
      `# TYPE process_external_bytes gauge`,
      `process_external_bytes ${mem.external}`,
      ``,
      `# HELP build_info Build information`,
      `# TYPE build_info gauge`,
      `build_info{version="${process.env.npm_package_version || '0.1.0'}",node_version="${process.version}"} 1`,
      ``,
      // Isu #69: keluarga metrik RED (rate/error/duration) + readyz + burn-rate.
      renderSliPrometheus(sli),
    ].join('\n');

    return new NextResponse(metrics, {
      status: 200,
      headers: {
        ...headers,
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
      },
    });
  } catch (error) {
    recordApiSample(route, 500, 0);
    logger.error('metrics_error', { error: (error as Error).message });
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Failed to generate metrics' } },
      { status: 500 }
    );
  }
}
