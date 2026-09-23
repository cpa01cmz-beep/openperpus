import { NextResponse } from 'next/server';
import { createLogger, requestIdFromHeaders } from '@/lib/logger';

export async function GET(req: Request) {
  const logger = createLogger(requestIdFromHeaders(req.headers));

  try {
    const mem = process.memoryUsage();
    const uptime = process.uptime();

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
    ].join('\n');

    logger.debug('metrics_served', { uptime, heapUsed: mem.heapUsed });

    return new NextResponse(metrics, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    logger.error('metrics_error', { error: (error as Error).message });
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: 'Failed to generate metrics' } },
      { status: 500 }
    );
  }
}
