/**
 * src/lib/sli.ts — registry SLI (Service Level Indicator) in-memory, edge-safe.
 *
 * Isu #69 ("SLI nol"): sebelumnya /api/metrics hanya memuat uptime+heap —
 * nol ketersediaan, nol error-rate, nol latensi. Modul ini menjadi sumber
 * tunggal angka RED (rate/errors/duration) untuk aplikasi:
 *
 * - SETIAP handler API mencatat satu sample {route, status, durationMs,
 *   supabaseMs?} lewat recordApiSample(); /api/readyz memakai
 *   recordReadyzProbe() agar ketersediaan probe ikut terukur.
 * - Sample disimpan di ring-buffer terbatas per route + window 5 menit,
 *   jadi memori tidak tumbuh tanpa batas pada isolate berumur panjang.
 * - sliSnapshot() menghitung availability, error-rate, p50/p95/p99,
 *   burn-rate error-budget, dan status SLO per route.
 * - renderSliPrometheus() membentuk teks exposition Prometheus; bentuk JSON
 *   yang sama dipakai /api/metrics?format=json sebagai "dashboard SLI".
 *
 * Edge-safe: hanya Map/Array/Date/JSON — bukan API Node-only → aman untuk
 * Cloudflare Workers via OpenNext. State per-isolate (sama seperti
 * src/lib/rate-limit.ts); agregasi multi-isolate/admisi lintas-PoP tetap
 * pekerjaan scraper (Prometheus / Cloudflare Analytics), bukan modul ini.
 */

import { requestIdFromHeaders } from './logger';

/** Target SLO inti (rekomendasi fix #69): availability 99.9%, p95<300ms, p99<500ms. */
export type SliTarget = {
  /** Ketersediaan minimum (0..1) — 0.999 = 99.9%. */
  availability: number;
  /** Latensi p95 maksimum (ms). */
  p95Ms: number;
  /** Latensi p99 maksimum (ms). */
  p99Ms: number;
  /** Latensi dependensi Supabase p95 maksimum (ms). */
  supabaseP95Ms: number;
};

export const DEFAULT_SLI_TARGETS: SliTarget = {
  availability: 0.999,
  p95Ms: 300,
  p99Ms: 500,
  supabaseP95Ms: 800,
};

/** Window agregasi/monitor (5 menit). Sample lebih tua dibuang dari snapshot. */
export const SLI_WINDOW_MS = 5 * 60 * 1000;
/** Batas memori: 2000 sample per route, 100 route — di atas itu sample terlama dibuang. */
export const SLI_MAX_SAMPLES_PER_ROUTE = 2000;
export const SLI_MAX_ROUTES = 100;

/** Route key probe kesiapan — diisi recordReadyzProbe(). */
export const READYZ_ROUTE = '/api/readyz';

export type SliSample = {
  ts: number;
  route: string;
  status: number;
  /** Durasi end-to-end handler (ms). */
  durationMs: number;
  /** Durasi panggilan Supabase di dalam handler (ms), bila handler mengukurnya. */
  supabaseMs?: number;
};

type Bucket = {
  samples: SliSample[];
  /** Counter monotonik sepanjang umur isolate (tidak di-window-kan). */
  requests: number;
  errors: number;
};

const store = new Map<string, Bucket>();

/** Reset semua sample — hanya untuk test (vitest). */
export function resetSli(): void {
  store.clear();
}

/**
 * Bungkus handler route: catat satu sample SLI {route, status, durationMs}
 * TANPA mengubah bentuk respons, dan pastikan `x-request-id` ikut pada
 * respons agar kegagalan bisa dikorelasikan dengan log aplikasi (isu #69).
 *
 * Pola opsional: route yang sengaja di-instrumentasi memakainya, sisanya
 * tetap bebas impor. Contoh:
 *
 *   export async function POST(req: Request) {
 *     return withSli('/api/loans', req, () => handlePost(req));
 *   }
 */
export async function withSli<T extends Response>(
  route: string,
  req: { headers: Headers },
  handler: () => Promise<T>
): Promise<T> {
  const requestId = requestIdFromHeaders(req.headers);
  const started = Date.now();
  try {
    const res = await handler();
    recordApiSample(route, res.status, Date.now() - started);
    res.headers.set('x-request-id', requestId);
    return res;
  } catch (error) {
    // Handler melempar (bug) tetap terlihat sebagai 5xx di SLI.
    recordApiSample(route, 500, Date.now() - started);
    throw error;
  }
}

function bucketOf(route: string): Bucket {
  let b = store.get(route);
  if (!b) {
    // Batasi jumlah route: buang route pertama yang masuk (insertion order).
    if (store.size >= SLI_MAX_ROUTES) {
      const oldest = store.keys().next();
      if (!oldest.done) store.delete(oldest.value);
    }
    b = { samples: [], requests: 0, errors: 0 };
    store.set(route, b);
  }
  return b;
}

function push(route: string, sample: SliSample): void {
  const b = bucketOf(route);
  b.samples.push(sample);
  b.requests += 1;
  if (sample.status >= 500) b.errors += 1;
  // Ring buffer: buang sample terlama bila melewati batas.
  if (b.samples.length > SLI_MAX_SAMPLES_PER_ROUTE) {
    b.samples.splice(0, b.samples.length - SLI_MAX_SAMPLES_PER_ROUTE);
  }
}

/**
 * Catat satu request API. `status` 5xx dihitung sebagai error; 4xx dihitung
 * sebagai trafik normal (kesalahan klien), konsisten dengan definisi
 * availability berbasis 5xx-rate.
 */
export function recordApiSample(
  route: string,
  status: number,
  durationMs: number,
  supabaseMs?: number
): void {
  const safeStatus = Number.isFinite(status) ? Math.trunc(status) : 0;
  const safeDuration = Number.isFinite(durationMs) ? Math.max(0, Math.round(durationMs)) : 0;
  push(route, {
    ts: Date.now(),
    route,
    status: safeStatus,
    durationMs: safeDuration,
    ...(supabaseMs !== undefined && Number.isFinite(supabaseMs)
      ? { supabaseMs: Math.max(0, Math.round(supabaseMs)) }
      : {}),
  });
}

/**
 * Catat hasil probe kesiapan (/api/readyz): ok -> 200, gagal -> 503.
 * Dipisah agar dashboard bisa menampilkan availability probe terakhir.
 */
export function recordReadyzProbe(ok: boolean, durationMs: number, supabaseMs?: number): void {
  recordApiSample(READYZ_ROUTE, ok ? 200 : 503, durationMs, supabaseMs);
}

/** Percentile nearest-rank pada salinan array (tidak mengubah input). */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const clamped = Math.min(1, Math.max(0, p));
  const rank = Math.ceil(clamped * sorted.length);
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[index] ?? 0;
}

function latencyOf(samples: readonly SliSample[]): SliLatency {
  const values = samples.map((s) => s.durationMs);
  return {
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
    max: values.length > 0 ? Math.max(...values) : 0,
  };
}

export type SliRouteWindow = {
  /** Jumlah request dalam window. */
  requests: number;
  /** Jumlah response 5xx dalam window. */
  errors: number;
  /** errors / requests (0 bila belum ada trafik). */
  errorRate: number;
  /** 1 - errorRate. */
  availability: number;
};

export type SliLatency = { p50: number; p95: number; p99: number; max: number };

export type SliSloStatus = {
  availabilityMet: boolean;
  p95Met: boolean;
  p99Met: boolean;
  supabaseMet: boolean;
  met: boolean;
};

export type SliRouteSnapshot = {
  route: string;
  /** Agregat window (dasar SLO + burn-rate). */
  window: SliRouteWindow;
  /** Counter monotonik sepanjang umur isolate. */
  lifetime: SliRouteWindow;
  latency: SliLatency;
  supabase: { count: number; p95Ms: number } | null;
  /** errorRate teramati / error-rate yang diizinkan target (>=1 = budget habis). */
  burnRate: number;
  slo: SliSloStatus;
};

export type SliReadyzSnapshot = {
  route: string;
  window: SliRouteWindow;
  latency: SliLatency;
  lastStatus: number | null;
  lastOkAt: string | null;
  probes: number;
  availabilityMet: boolean;
  latencyMet: boolean;
};

export type SliSnapshot = {
  generatedAt: string;
  windowMs: number;
  targets: SliTarget;
  readyz: SliReadyzSnapshot;
  routes: SliRouteSnapshot[];
  totals: SliRouteWindow & { lifetime: SliRouteWindow };
  breakers: { total: number; open: number; closed: number };
};

function rateSnap(requests: number, errors: number): SliRouteWindow {
  const errorRate = requests > 0 ? errors / requests : 0;
  return {
    requests,
    errors,
    errorRate: Number(errorRate.toFixed(6)),
    availability: Number((1 - errorRate).toFixed(6)),
  };
}

function sloOf(win: SliRouteWindow, latency: SliLatency, supabaseMs: number | null, t: SliTarget) {
  const availabilityMet = win.requests === 0 || win.availability >= t.availability;
  const p95Met = win.requests === 0 || latency.p95 <= t.p95Ms;
  const p99Met = win.requests === 0 || latency.p99 <= t.p99Ms;
  const supabaseMet = supabaseMs === null || win.requests === 0 || supabaseMs <= t.supabaseP95Ms;
  return {
    availabilityMet,
    p95Met,
    p99Met,
    supabaseMet,
    met: availabilityMet && p95Met && p99Met && supabaseMet,
  };
}

/** Ambil snapshot agregat SLI (read-only — tidak memodifikasi registry). */
export function sliSnapshot(
  now: number = Date.now(),
  targets: SliTarget = DEFAULT_SLI_TARGETS,
  breakerStats: { total: number; open: number; closed: number } = {
    total: 0,
    open: 0,
    closed: 0,
  }
): SliSnapshot {
  const cutoff = now - SLI_WINDOW_MS;
  const routes: SliRouteSnapshot[] = [];
  let requests = 0;
  let errors = 0;
  let lifetimeRequests = 0;
  let lifetimeErrors = 0;

  for (const [route, bucket] of store) {
    const inWindow = bucket.samples.filter((s) => s.ts >= cutoff);
    const win = rateSnap(inWindow.length, inWindow.filter((s) => s.status >= 500).length);
    const life = rateSnap(bucket.requests, bucket.errors);
    const latency = latencyOf(inWindow);
    const supabaseValues = inWindow
      .map((s) => s.supabaseMs)
      .filter((v): v is number => typeof v === 'number');
    const supabase =
      supabaseValues.length > 0
        ? { count: supabaseValues.length, p95Ms: percentile(supabaseValues, 0.95) }
        : null;
    const supabaseMs = supabase ? supabase.p95Ms : null;
    const allowedErrorRate = Math.max(1e-9, 1 - targets.availability);
    const burnRate = Number((win.errorRate / allowedErrorRate).toFixed(3));
    routes.push({
      route,
      window: win,
      lifetime: life,
      latency,
      supabase,
      burnRate,
      slo: sloOf(win, latency, supabaseMs, targets),
    });
    requests += win.requests;
    errors += win.errors;
    lifetimeRequests += life.requests;
    lifetimeErrors += life.errors;
  }

  routes.sort((a, b) => b.window.requests - a.window.requests || a.route.localeCompare(b.route));

  const readyzRoute = routes.find((r) => r.route === READYZ_ROUTE);
  const readyzBucket = store.get(READYZ_ROUTE);
  const lastReadyz =
    readyzBucket && readyzBucket.samples.length > 0
      ? readyzBucket.samples[readyzBucket.samples.length - 1]
      : undefined;
  // Probe sukses TERAKHIR (bukan hanya yang terakhir) — supaya satu kegagalan
  // tidak menghapus kapan terakhir sistem benar-benar siap.
  let lastOkAt: string | null = null;
  if (readyzBucket) {
    for (let i = readyzBucket.samples.length - 1; i >= 0; i--) {
      const s = readyzBucket.samples[i]!;
      if (s.status === 200) {
        lastOkAt = new Date(s.ts).toISOString();
        break;
      }
    }
  }

  return {
    generatedAt: new Date(now).toISOString(),
    windowMs: SLI_WINDOW_MS,
    targets,
    readyz: {
      route: READYZ_ROUTE,
      window: readyzRoute?.window ?? rateSnap(0, 0),
      latency: readyzRoute?.latency ?? { p50: 0, p95: 0, p99: 0, max: 0 },
      lastStatus: lastReadyz ? lastReadyz.status : null,
      lastOkAt,
      probes: readyzRoute?.lifetime.requests ?? 0,
      availabilityMet: readyzRoute ? readyzRoute.slo.availabilityMet : true,
      latencyMet: readyzRoute ? readyzRoute.latency.p95 <= targets.supabaseP95Ms : true,
    },
    routes,
    totals: {
      ...rateSnap(requests, errors),
      lifetime: rateSnap(lifetimeRequests, lifetimeErrors),
    },
    breakers: breakerStats,
  };
}

export type SliAlert = {
  kind: 'availability' | 'burn_rate' | 'latency_p95' | 'latency_p99' | 'supabase' | 'readyz';
  route?: string;
  /** Pesan manusiawi (Bahasa Indonesia) untuk runbook. */
  message: string;
  observed: number;
  threshold: number;
};

/**
 * Daftar pelanggaran SLO (kosong = sehat). Dipakai /api/metrics?format=json
 * sebagai dasar alert burn-rate di runbook.
 */
export function sliAlerts(snapshot: SliSnapshot): SliAlert[] {
  const t = snapshot.targets;
  const alerts: SliAlert[] = [];

  if (!snapshot.readyz.availabilityMet) {
    alerts.push({
      kind: 'readyz',
      route: READYZ_ROUTE,
      message: 'Probe kesiapan gagal — ketersediaan di bawah target.',
      observed: snapshot.readyz.window.availability,
      threshold: t.availability,
    });
  }
  if (!snapshot.readyz.latencyMet) {
    alerts.push({
      kind: 'latency_p95',
      route: READYZ_ROUTE,
      message: 'Latensi probe kesiapan di atas budget Supabase.',
      observed: snapshot.readyz.latency.p95,
      threshold: t.supabaseP95Ms,
    });
  }

  for (const r of snapshot.routes) {
    if (!r.slo.availabilityMet) {
      alerts.push({
        kind: 'availability',
        route: r.route,
        message: 'Ketersediaan di bawah target (error 5xx terlalu tinggi).',
        observed: r.window.availability,
        threshold: t.availability,
      });
    }
    if (r.burnRate >= 1) {
      alerts.push({
        kind: 'burn_rate',
        route: r.route,
        message: 'Error budget habis — burn rate >= 1 pada window ini.',
        observed: r.burnRate,
        threshold: 1,
      });
    }
    if (!r.slo.p95Met) {
      alerts.push({
        kind: 'latency_p95',
        route: r.route,
        message: 'Latensi p95 di atas target.',
        observed: r.latency.p95,
        threshold: t.p95Ms,
      });
    }
    if (!r.slo.p99Met) {
      alerts.push({
        kind: 'latency_p99',
        route: r.route,
        message: 'Latensi p99 di atas target.',
        observed: r.latency.p99,
        threshold: t.p99Ms,
      });
    }
    if (!r.slo.supabaseMet && r.supabase) {
      alerts.push({
        kind: 'supabase',
        route: r.route,
        message: 'Latensi Supabase di atas budget.',
        observed: r.supabase.p95Ms,
        threshold: t.supabaseP95Ms,
      });
    }
  }
  return alerts;
}

/** Escape nilai label Prometheus (", \, newline). */
function labelValue(raw: string): string {
  return raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

/**
 * Render teks exposition Prometheus dari snapshot. Disebut /api/metrics
 * (default text/plain) sehingga angka yang sama bisa di-scrape Prometheus
 * dan dijadikan alert burn-rate tanpa endpoint kedua.
 */
export function renderSliPrometheus(snapshot: SliSnapshot): string {
  const lines: string[] = [];
  const push = (s: string) => lines.push(s);

  push('# HELP sli_availability Ratio permintaan non-5xx dalam window SLI.');
  push('# TYPE sli_availability gauge');
  for (const r of snapshot.routes) {
    push(`sli_availability{route="${labelValue(r.route)}"} ${r.window.availability}`);
  }
  push('');

  push('# HELP sli_requests_total Permintaan dalam window SLI.');
  push('# TYPE sli_requests_total gauge');
  for (const r of snapshot.routes) {
    push(`sli_requests_total{route="${labelValue(r.route)}"} ${r.window.requests}`);
  }
  push('');

  push('# HELP sli_errors_5xx_total Response 5xx dalam window SLI.');
  push('# TYPE sli_errors_5xx_total gauge');
  for (const r of snapshot.routes) {
    push(`sli_errors_5xx_total{route="${labelValue(r.route)}"} ${r.window.errors}`);
  }
  push('');

  push('# HELP sli_request_duration_seconds Latensi handler per kuartil.');
  push('# TYPE sli_request_duration_seconds gauge');
  for (const r of snapshot.routes) {
    const route = labelValue(r.route);
    push(
      `sli_request_duration_seconds{route="${route}",quantile="0.5"} ${(r.latency.p50 / 1000).toFixed(6)}`
    );
    push(
      `sli_request_duration_seconds{route="${route}",quantile="0.95"} ${(r.latency.p95 / 1000).toFixed(6)}`
    );
    push(
      `sli_request_duration_seconds{route="${route}",quantile="0.99"} ${(r.latency.p99 / 1000).toFixed(6)}`
    );
  }
  push('');

  push('# HELP sli_supabase_duration_seconds Latensi Supabase p95 (handler yang mengukurnya).');
  push('# TYPE sli_supabase_duration_seconds gauge');
  for (const r of snapshot.routes) {
    if (!r.supabase) continue;
    push(
      `sli_supabase_duration_seconds{route="${labelValue(r.route)}"} ${(
        r.supabase.p95Ms / 1000
      ).toFixed(6)}`
    );
  }
  push('');

  push('# HELP sli_error_budget_burn_rate Rasio error teramati terhadap budget target.');
  push('# TYPE sli_error_budget_burn_rate gauge');
  for (const r of snapshot.routes) {
    push(`sli_error_budget_burn_rate{route="${labelValue(r.route)}"} ${r.burnRate}`);
  }
  push('');

  push('# HELP sli_slo_met 1 bila seluruh SLO route terpenuhi dalam window.');
  push('# TYPE sli_slo_met gauge');
  for (const r of snapshot.routes) {
    push(`sli_slo_met{route="${labelValue(r.route)}"} ${r.slo.met ? 1 : 0}`);
  }
  push('');

  push('# HELP sli_readyz_up 1 bila probe kesiapan terakhir sukses.');
  push('# TYPE sli_readyz_up gauge');
  push(`sli_readyz_up{route="${READYZ_ROUTE}"} ${snapshot.readyz.lastStatus === 200 ? 1 : 0}`);
  push('');

  push('# HELP sli_breakers_open Jumlah circuit breaker yang sedang terbuka.');
  push('# TYPE sli_breakers_open gauge');
  push(`sli_breakers_open ${snapshot.breakers.open}`);

  return lines.join('\n');
}
