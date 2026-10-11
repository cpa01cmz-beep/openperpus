import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Isu #69 — reliability: SLI layer, readyz timeout/no-store, metrics dashboard,
// observability no-longer-no-op, requestId traceability, client fetch timeout.
//
// Pola mengikuti suite kontrak repo lain: mock server client + read-source guards.
// Catatan: suite ini TIDAK menjalankan integration/Playwright (gated by CI).

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

import {
  DEFAULT_SLI_TARGETS,
  READYZ_ROUTE,
  SLI_MAX_SAMPLES_PER_ROUTE,
  SLI_WINDOW_MS,
  percentile,
  recordApiSample,
  recordReadyzProbe,
  renderSliPrometheus,
  resetSli,
  sliAlerts,
  sliSnapshot,
  withSli,
} from '@/lib/sli';
import { GET as READYZ_GET } from '@/app/api/readyz/route';
import { GET as METRICS_GET } from '@/app/api/metrics/route';
import { captureException, initSentry, isSentryEnabled } from '@/lib/observability';
import { writeLog } from '@/lib/api-utils';

type MockSupabase = Record<string, unknown>;

function setMockClient(client: MockSupabase): void {
  (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase = client;
}

/** Client Supabase tiruan yang thenable-nya langsung menyelesaikan `result`. */
function pingClient(result: Record<string, unknown>) {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.limit = () => chain;
  chain.then = (onFulfilled?: (v: unknown) => unknown) => Promise.resolve(result).then(onFulfilled);
  return { from: () => chain };
}

/** Client tiruan yang ping-nya TIDAK PERNAH selesai (simulasi hang). */
function neverSettlingChain() {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.limit = () => chain;
  chain.then = () =>
    new Promise<never>(() => {
      /* sengaja tidak pernah settle: mensimulasikan Supabase menggantung */
    });
  return chain;
}

function throwingClient() {
  return {
    from: () => {
      throw new Error('mock db down: books');
    },
  };
}

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

beforeEach(() => {
  resetSli();
  setMockClient(pingClient({ data: [{ id: 'b1' }], error: null }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('sli registry (isu #69)', () => {
  it('percentile nearest-rank + clamp + empty', () => {
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2);
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95)).toBe(10);
    expect(percentile([7], 0.99)).toBe(7);
    expect(percentile([], 0.5)).toBe(0);
    // Di luar rentang di-clamp ke 0..1, bukan NaN.
    expect(percentile([1, 2, 3], 1.5)).toBe(3);
    expect(percentile([1, 2, 3], -1)).toBe(1);
  });

  it('snapshot menghitung availability, error-rate, p95/p99, dan SLO', () => {
    const now = Date.now();
    for (let i = 0; i < 10; i++) recordApiSample('/api/books', 200, 100);
    for (let i = 0; i < 2; i++) recordApiSample('/api/books', 503, 900);

    const snap = sliSnapshot(now);
    const books = snap.routes.find((r) => r.route === '/api/books');
    expect(books).toBeDefined();
    expect(books!.window.requests).toBe(12);
    expect(books!.window.errors).toBe(2);
    expect(books!.window.errorRate).toBeCloseTo(2 / 12, 5);
    expect(books!.window.availability).toBeCloseTo(10 / 12, 5);
    expect(books!.latency.p50).toBe(100);
    expect(books!.latency.p95).toBe(900);
    expect(books!.lifetime.requests).toBe(12);
    // SLO default: availability 99.9% / p95 300ms / p99 500ms.
    expect(books!.slo.availabilityMet).toBe(false);
    expect(books!.slo.p95Met).toBe(false);
    expect(books!.slo.met).toBe(false);
    expect(DEFAULT_SLI_TARGETS.availability).toBe(0.999);
    expect(snap.totals.requests).toBe(12);
    expect(snap.totals.errors).toBe(2);
  });

  it('burn-rate naik saat error-rate mendekati budget target', () => {
    const now = Date.now();
    recordApiSample('/api/loans', 200, 10);
    const healthy = sliSnapshot(now).routes[0]!;
    expect(healthy.burnRate).toBe(0);

    resetSli();
    recordApiSample('/api/loans', 500, 10);
    const burning = sliSnapshot(now).routes[0]!;
    // 1 error dari 1 request = error-rate 1.0 -> burn 1000x budget (1 - 0.999).
    expect(burning.burnRate).toBeGreaterThanOrEqual(1);
  });

  it('window dibatasi SLI_WINDOW_MS, lifetime counter monotonik', () => {
    const now = Date.now();
    recordApiSample('/api/members', 200, 20);
    const inWindow = sliSnapshot(now);
    expect(inWindow.routes[0]!.window.requests).toBe(1);

    const afterWindow = sliSnapshot(now + SLI_WINDOW_MS + 1);
    expect(afterWindow.routes[0]!.window.requests).toBe(0);
    expect(afterWindow.routes[0]!.lifetime.requests).toBe(1);
  });

  it('ring buffer dibatasi SLI_MAX_SAMPLES_PER_ROUTE per route', () => {
    const extra = 5;
    for (let i = 0; i < SLI_MAX_SAMPLES_PER_ROUTE + extra; i++) {
      recordApiSample('/api/books', 200, i);
    }
    const snap = sliSnapshot();
    const books = snap.routes[0]!;
    expect(books.lifetime.requests).toBe(SLI_MAX_SAMPLES_PER_ROUTE + extra);
    // Latensi max berasal dari sample TERBARU (yang terlama dibuang), jadi
    // bukan nilai pertama (0) lagi.
    expect(books.latency.max).toBe(SLI_MAX_SAMPLES_PER_ROUTE + extra - 1);
  });

  it('readyz tercatat sebagai route khusus dengan status terakhir', () => {
    const now = Date.now();
    recordReadyzProbe(true, 42, 42);
    recordReadyzProbe(false, 900, 900);
    const snap = sliSnapshot(now);
    expect(snap.readyz.route).toBe(READYZ_ROUTE);
    expect(snap.readyz.probes).toBe(2);
    expect(snap.readyz.lastStatus).toBe(503);
    expect(snap.readyz.lastOkAt).not.toBeNull();
    expect(snap.readyz.availabilityMet).toBe(false);
    const route = snap.routes.find((r) => r.route === READYZ_ROUTE);
    expect(route).toBeDefined();
    expect(route!.supabase?.p95Ms).toBe(900);
  });

  it('sliAlerts memuat pelanggaran availability, burn-rate, dan latensi', () => {
    const now = Date.now();
    for (let i = 0; i < 5; i++) recordApiSample('/api/books', 500, 800);
    const alerts = sliAlerts(sliSnapshot(now));
    const kinds = alerts.map((a) => a.kind);
    expect(kinds).toContain('availability');
    expect(kinds).toContain('burn_rate');
    expect(kinds).toContain('latency_p95');
    expect(kinds).toContain('latency_p99');
    const book = alerts.find((a) => a.route === '/api/books' && a.kind === 'availability');
    expect(book!.threshold).toBe(DEFAULT_SLI_TARGETS.availability);
    expect(typeof book!.message).toBe('string');
  });

  it('sliAlerts kosong untuk trafik sehat', () => {
    const now = Date.now();
    for (let i = 0; i < 20; i++) recordApiSample('/api/books', 200, 50);
    expect(sliAlerts(sliSnapshot(now))).toEqual([]);
  });

  it('renderSliPrometheus memaparkan availability/latency/readyz/breakers', () => {
    const now = Date.now();
    recordApiSample('/api/books', 200, 250);
    recordReadyzProbe(true, 120, 120);
    const text = renderSliPrometheus(
      sliSnapshot(now, DEFAULT_SLI_TARGETS, { total: 2, open: 1, closed: 1 })
    );
    expect(text).toContain('# TYPE sli_availability gauge');
    expect(text).toContain('sli_availability{route="/api/books"} 1');
    expect(text).toContain('sli_requests_total{route="/api/books"} 1');
    expect(text).toContain('sli_request_duration_seconds{route="/api/books",quantile="0.95"} 0.25');
    expect(text).toContain('sli_readyz_up');
    expect(text).toContain('sli_breakers_open 1');
  });

  it('withSli mencatat sample + menambahkan x-request-id pada respons', async () => {
    const rid = '11111111-2222-4333-8444-555555555555';
    const res = await withSli(
      '/api/fines/{id}/pay',
      { headers: new Headers({ 'x-request-id': rid }) },
      async () => new Response('ok', { status: 201 })
    );
    expect(res.status).toBe(201);
    expect(res.headers.get('x-request-id')).toBe(rid);
    const snap = sliSnapshot();
    const route = snap.routes.find((r) => r.route === '/api/fines/{id}/pay');
    expect(route!.window.requests).toBe(1);
    expect(route!.window.errors).toBe(0);
  });

  it('withSli mencatat 5xx bila handler melempar, lalu meneruskan error', async () => {
    await expect(
      withSli('/api/books', { headers: new Headers() }, async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
    const snap = sliSnapshot();
    expect(snap.routes[0]!.window.errors).toBe(1);
    expect(snap.routes[0]!.window.availability).toBe(0);
  });

  it('withSli membuat request-id sendiri bila header tidak dikirim', async () => {
    const res = await withSli(
      '/api/health',
      { headers: new Headers() },
      async () => new Response('ok')
    );
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });
});

describe('readyz — timeout + no-store + token + SLI (isu #69)', () => {
  it('ping sukses -> 200 + Cache-Control no-store + x-request-id', async () => {
    const res = await READYZ_GET(new Request('http://localhost/api/readyz'));
    expect(res.status).toBe(200);
    const j = (await res.json()) as { ready: boolean; checks: { supabase: string } };
    expect(j.ready).toBe(true);
    expect(j.checks.supabase).toBe('ok');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });

  it('ping error -> 503 detail "ping failed" (kontrak lama utuh)', async () => {
    setMockClient(pingClient({ data: null, error: { message: 'down' } }));
    const res = await READYZ_GET(new Request('http://localhost/api/readyz'));
    expect(res.status).toBe(503);
    const j = (await res.json()) as { ready: boolean; checks: { detail?: string } };
    expect(j.ready).toBe(false);
    expect(j.checks.detail).toBe('ping failed');
  });

  it('ping melempar -> 503 detail "unreachable" (kontrak lama utuh)', async () => {
    setMockClient(throwingClient());
    const res = await READYZ_GET(new Request('http://localhost/api/readyz'));
    expect(res.status).toBe(503);
    const j = (await res.json()) as { checks: { detail?: string } };
    expect(j.checks.detail).toBe('unreachable');
  });

  it('ping menggantung -> 503 detail "timeout" dalam batas waktu', async () => {
    vi.stubEnv('READYZ_TIMEOUT_MS', '250');
    setMockClient({ from: () => neverSettlingChain() });

    const res = await READYZ_GET(new Request('http://localhost/api/readyz'));
    expect(res.status).toBe(503);
    const j = (await res.json()) as {
      ready: boolean;
      checks: { detail?: string; timeoutMs?: number };
    };
    expect(j.ready).toBe(false);
    expect(j.checks.detail).toBe('timeout');
    expect(j.checks.timeoutMs).toBe(250);
    // Kegagalan probe ikut tercatat agar dashboard SLI jujur.
    expect(sliSnapshot().readyz.lastStatus).toBe(503);
  });

  it('READYZ_TOKEN: 401 tanpa bearer, 200 dengan bearer yang benar', async () => {
    vi.stubEnv('READYZ_TOKEN', 'rahasia-probe');
    const noAuth = await READYZ_GET(new Request('http://localhost/api/readyz'));
    expect(noAuth.status).toBe(401);
    const wrong = await READYZ_GET(
      new Request('http://localhost/api/readyz', {
        headers: { Authorization: 'Bearer salah' },
      })
    );
    expect(wrong.status).toBe(401);
    const ok = await READYZ_GET(
      new Request('http://localhost/api/readyz', {
        headers: { Authorization: 'Bearer rahasia-probe' },
      })
    );
    expect(ok.status).toBe(200);
  });

  it('handler tetap bisa dipanggil tanpa argumen (probe internal / compose)', async () => {
    const res = await READYZ_GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('x-request-id')).toBe('probe');
  });
});

describe('metrics — dashboard SLI (isu #69)', () => {
  it('default tetap teks Prometheus + memuat keluarga metrik SLI', async () => {
    recordReadyzProbe(true, 100, 100);
    recordApiSample('/api/books', 200, 120);
    const res = await METRICS_GET(new Request('http://localhost/api/metrics'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/plain');
    const body = await res.text();
    expect(body).toContain('process_uptime_seconds');
    expect(body).toContain('build_info');
    expect(body).toContain('sli_availability');
    expect(body).toContain('sli_request_duration_seconds');
    expect(body).toContain('sli_readyz_up');
  });

  it('?format=json mengembalikan dashboard SLI (5xx-rate, p95, readyz)', async () => {
    await READYZ_GET(new Request('http://localhost/api/readyz'));
    recordApiSample('/api/books', 500, 900);
    const res = await METRICS_GET(new Request('http://localhost/api/metrics?format=json'));
    expect(res.status).toBe(200);
    const j = (await res.json()) as {
      slo: { availability: number; p95Ms: number };
      readyz: { lastStatus: number | null; availabilityMet: boolean };
      totals: { requests: number; errors: number };
      routes: { route: string; window: { errors: number }; latency: { p95: number } }[];
      alerts: { kind: string; route?: string }[];
      breakers: { open: number };
      process: { uptimeSeconds: number };
      windowMs: number;
    };
    expect(j.windowMs).toBe(SLI_WINDOW_MS);
    expect(j.slo.availability).toBe(DEFAULT_SLI_TARGETS.availability);
    expect(j.process.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(j.readyz.lastStatus).toBe(200);
    expect(j.readyz.availabilityMet).toBe(true);
    const books = j.routes.find((r) => r.route === '/api/books')!;
    expect(books.window.errors).toBe(1);
    expect(books.latency.p95).toBe(900);
    expect(j.alerts.some((a) => a.route === '/api/books')).toBe(true);
    expect(j.breakers.open).toBeGreaterThanOrEqual(0);
  });

  it('METRICS_TOKEN tetap menjaga 401 (kontrak lama utuh)', async () => {
    vi.stubEnv('METRICS_TOKEN', 'sekret');
    const noAuth = await METRICS_GET(new Request('http://localhost/api/metrics?format=json'));
    expect(noAuth.status).toBe(401);
    const ok = await METRICS_GET(
      new Request('http://localhost/api/metrics?format=json', {
        headers: { Authorization: 'Bearer sekret' },
      })
    );
    expect(ok.status).toBe(200);
  });
});

describe('observability — tidak lagi no-op tanpa DSN (isu #69)', () => {
  it('captureException tetap menulis JSON terstruktur tanpa SENTRY_DSN', async () => {
    vi.stubEnv('SENTRY_DSN', '');
    initSentry();
    expect(isSentryEnabled()).toBe(false);

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    captureException(new Error('db unreachable'), { requestId: 'rid-69' });
    expect(errSpy).toHaveBeenCalledTimes(1);
    const line = String(errSpy.mock.calls[0]![0]);
    const parsed = JSON.parse(line) as {
      level: string;
      msg: string;
      error: string;
      requestId: string;
      stack?: string;
    };
    expect(parsed.level).toBe('error');
    expect(parsed.msg).toBe('captureException');
    expect(parsed.error).toBe('db unreachable');
    expect(parsed.requestId).toBe('rid-69');
    expect(parsed.stack).toContain('Error: db unreachable');
    errSpy.mockRestore();
  });

  it('initSentry mencatat state enabled/disabled tanpa melempar', () => {
    const infoSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.stubEnv('SENTRY_DSN', '');
    expect(() => initSentry()).not.toThrow();
    expect(isSentryEnabled()).toBe(false);

    vi.stubEnv('SENTRY_DSN', 'https://public@o0.ingest.sentry.io/0');
    initSentry();
    expect(isSentryEnabled()).toBe(true);
    // Host saja yang dicatat — kredensial DSN tidak bocor ke log.
    const lines = infoSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(lines).toContain('sentry_enabled');
    expect(lines).not.toContain('public@o0.ingest.sentry.io');
    infoSpy.mockRestore();
  });
});

describe('audit requestId + viewer log (isu #69)', () => {
  it('writeLog menaruh requestId di metadata tanpa menimpa metadata pemanggil', async () => {
    const seen: Record<string, unknown>[] = [];
    const fake = {
      from: () => ({
        insert: async (row: Record<string, unknown>) => {
          seen.push(row);
          return { error: null };
        },
      }),
    };
    type WriteLogClient = Parameters<typeof writeLog>[0];

    await writeLog(fake as unknown as WriteLogClient, {
      userId: 'u-1',
      action: 'fines.pay',
      entityType: 'fines',
      entityId: 'f-1',
      metadata: { amount: 5000 },
      requestId: 'rid-abc',
    });
    expect(seen[0]!['metadata']).toEqual({ requestId: 'rid-abc', amount: 5000 });

    await writeLog(fake as unknown as WriteLogClient, {
      userId: 'u-1',
      action: 'fines.pay',
      entityType: 'fines',
      entityId: 'f-1',
      metadata: { amount: 5000 },
    });
    expect(seen[1]!['metadata']).toEqual({ amount: 5000 });
  });

  it('viewer log menyediakan filter request-id dan kolom Trace', () => {
    const page = read('src/app/admin/logs/page.tsx');
    expect(page).toContain('metadata->>requestId');
    expect(page).toContain('name="rid"');
    expect(page).toContain('id="log-rid"');
    // Kontrak audit lama tetap utuh.
    expect(page).toContain('metadata');
    expect(page).toContain('htmlFor');
    expect(page).toContain('id="log-action"');
    expect(page).toContain('reservations.completed');

    const table = read('src/components/admin/LogsTable.tsx');
    expect(table).toContain('requestId');
    expect(table).toContain('<details');
  });

  it('route pembayaran menyimpan requestId pada baris audit + SLI key', () => {
    const src = read('src/app/api/fines/[id]/pay/route.ts');
    expect(src).toContain('requestId: log.requestId');
    expect(src).toContain('withSli');
    expect(src).toContain("'/api/fines/{id}/pay'");
  });
});

describe('kontrak sumber — ketahanan klien (isu #69)', () => {
  it('readyz memakai batas waktu + no-store + pencatatan SLI', () => {
    const src = read('src/app/api/readyz/route.ts');
    expect(src).toContain('withTimeout');
    expect(src).toContain('Cache-Control');
    expect(src).toContain('recordReadyzProbe');
    expect(src).toContain('READYZ_TIMEOUT_MS');
    // Bentuk kontrak yang diassert tests/openapi-conformance.test.ts.
    expect(src).toContain('ready: true');
    expect(src).toContain('checks:');
    expect(src).toContain('ready: false');
  });

  it('api-client membungkus fetch dengan AbortController + pesan timeout', () => {
    const src = read('src/lib/api-client.ts');
    expect(src).toContain('AbortController');
    expect(src).toContain('clearTimeout');
    expect(src).toContain('TIMEOUT_MESSAGE');
  });

  it('form admin/publik memakai clientFetch, bukan fetch telanjang', () => {
    const files = [
      'src/components/admin/LoanForm.tsx',
      'src/components/admin/BookForm.tsx',
      'src/components/admin/SettingsForm.tsx',
      'src/components/admin/ThemeSwitcher.tsx',
      'src/components/public/ReserveButton.tsx',
    ];
    for (const f of files) {
      const src = read(f);
      expect(src, `${f} harus memakai clientFetch`).toContain('clientFetch');
      // Tidak ada lagi fetch() telanjang di file ini.
      expect(src, `${f} masih punya fetch telanjang`).not.toMatch(/[^.\w]fetch\(\s*['"`]/);
    }
  });
});
