import { describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    from: () => ({
      select: () => ({
        limit: async () => ({ data: [{ id: 'ping' }], error: null }),
      }),
    }),
  })),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { GET as HEALTH_GET } from '@/app/api/health/route';
import { GET as READY_GET } from '@/app/api/readyz/route';
import { GET as DOCS_GET } from '@/app/api/docs/route';

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('ops observability — health/readyz/docs/docker (RED first)', () => {
  it('health GET returns 200 { status, uptime, checks }', async () => {
    const res = await HEALTH_GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as unknown as {
      status: string;
      uptime: number;
      checks: Record<string, string>;
    };
    expect(json.status).toBe('ok');
    expect(typeof json.uptime).toBe('number');
    expect(json.uptime).toBeGreaterThanOrEqual(0);
    expect(json.checks).toBeTruthy();
  });

  it('readyz GET pings Supabase and returns readiness JSON', async () => {
    const res = await READY_GET();
    expect([200, 503]).toContain(res.status);
    const json = (await res.json()) as {
      ready: boolean;
      checks: Record<string, unknown>;
    };
    expect(typeof json.ready).toBe('boolean');
    expect(json.checks).toBeTruthy();
    // Mocked Supabase ping succeeds → ready true with 200.
    expect(json.ready).toBe(true);
    expect(res.status).toBe(200);
  });

  it('docs GET serves Scalar/Swagger UI html referencing openapi', async () => {
    const res = await DOCS_GET();
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html.toLowerCase()).toMatch(/scalar|swagger/);
    expect(html).toMatch(/openapi/i);
  });

  it('openapi.yaml covers baseline route count parity (26 existing + health/readyz/docs)', () => {
    const baseline = JSON.parse(read('.omo/baseline/routes.json')) as {
      count: number;
      routes: string[];
    };
    expect(baseline.count).toBe(26);
    const yaml = read('openapi.yaml');
    const pathLines = yaml.split('\n').filter((l) => l.match(/^  \/api\//));
    expect(pathLines.length).toBeGreaterThanOrEqual(baseline.count);
    for (const p of ['/api/health', '/api/readyz', '/api/docs', '/api/books']) {
      expect(yaml, `openapi.yaml missing path ${p}`).toContain(p);
    }
    // Parity eksak: 30 route files (26 baseline + health/readyz/docs + register).
    expect(pathLines.length).toBe(30);
  });

  it('Dockerfile multistage with HEALTHCHECK curl /api/health', () => {
    const docker = read('Dockerfile');
    expect(docker).toMatch(/FROM .* AS /i);
    expect(docker).toMatch(/HEALTHCHECK/);
    expect(docker).toMatch(/curl.*\/api\/health/);
  });

  it('docker-compose.yml has app + postgres 15 (local preview only)', () => {
    const compose = read('docker-compose.yml');
    expect(compose).toMatch(/postgres:\s*15/);
    expect(compose.toLowerCase()).toContain('app');
  });

  it('Sentry activation kept as comment stub (no dependency)', () => {
    const healthSrc = read('src/app/api/health/route.ts');
    expect(healthSrc).toMatch(/Sentry/i);
    const pkg = read('package.json');
    expect(pkg).not.toMatch(/@sentry/);
  });

  it('new route files exist (no modification of existing sources)', () => {
    for (const f of [
      'src/app/api/health/route.ts',
      'src/app/api/readyz/route.ts',
      'src/app/api/docs/route.ts',
      'openapi.yaml',
      'Dockerfile',
      'docker-compose.yml',
    ]) {
      expect(existsSync(join(process.cwd(), f)), `missing new file ${f}`).toBe(true);
    }
  });
});
