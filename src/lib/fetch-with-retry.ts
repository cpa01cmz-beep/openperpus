/**
 * fetchWithRetry — timeout + auto-retry + Retry-After + circuit breaker.
 *
 * Satu helper untuk semua fetch client-side ke API sendiri / Supabase:
 * - timeout per-attempt via AbortSignal.timeout (default 9s)
 * - retry hanya untuk transient (408/429/5xx + network error), max 2x
 * - backoff eksponensial + jitter, hormati header Retry-After
 * - circuit breaker per key: fail-fast saat dependensi down, pulih setelah cooldown
 */

export const DEFAULT_TIMEOUT_MS = 9000;
export const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_BASE_DELAY_MS = 400;
const DEFAULT_BREAKER_THRESHOLD = 5;
const DEFAULT_BREAKER_COOLDOWN_MS = 30_000;
const MAX_BREAKER_ENTRIES = 1000;
const BREAKER_TTL_MS = 5 * 60 * 1000; // 5 minutes for inactive breakers

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;
export type SleepFn = (ms: number) => Promise<void>;

export type FetchRetryOptions = {
  /** Kunci sirkuit per dependensi (mis. 'supabase-rpc', 'api-loans'). */
  key?: string;
  fetchFn?: FetchFn;
  sleep?: SleepFn;
  timeoutMs?: number;
  maxRetries?: number;
  baseDelayMs?: number;
  breakerThreshold?: number;
  breakerCooldownMs?: number;
};

type BreakerState = { failures: number; openedAt: number | null; lastAccessed: number };

const breakers = new Map<string, BreakerState>();

/** Reset sirkuit (dipakai test + pemulihan manual). Tanpa arg: reset semua. */
export function clearBreaker(key?: string): void {
  if (key === undefined) breakers.clear();
  else breakers.delete(key);
}

/** Metrik observabilitas: jumlah sirkuit terbuka saat ini (untuk /api/health checks). */
export function openBreakerCount(): number {
  return [...breakers.values()].filter((s) => s.openedAt !== null).length;
}

/** Statistik circuit breaker untuk monitoring. */
export function getBreakerStats(): { total: number; open: number; closed: number } {
  const total = breakers.size;
  const open = [...breakers.values()].filter((s) => s.openedAt !== null).length;
  return { total, open, closed: total - open };
}

/** Hapus entry lama jika melebihi batas atau TTL. */
function pruneIfNeeded(): void {
  const now = Date.now();
  // Hapus entry yang sudah expired (lastAccessed > TTL)
  for (const [key, state] of breakers) {
    if (now - state.lastAccessed > BREAKER_TTL_MS) {
      breakers.delete(key);
    }
  }
  // Jika masih melebihi max, hapus yang paling lama diakses
  if (breakers.size > MAX_BREAKER_ENTRIES) {
    const entries = [...breakers.entries()].sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
    const toDelete = entries.slice(0, entries.length - MAX_BREAKER_ENTRIES);
    for (const [key] of toDelete) {
      breakers.delete(key);
    }
  }
}

/** Guard sirkuit untuk path non-fetch (mis. Supabase RPC): true bila fail-fast. */
export function isCircuitOpen(key: string, cooldownMs = DEFAULT_BREAKER_COOLDOWN_MS): boolean {
  pruneIfNeeded();
  const s = breakers.get(key);
  if (!s || s.openedAt === null) return false;
  s.lastAccessed = Date.now();
  if (Date.now() - s.openedAt < cooldownMs) return true;
  s.openedAt = null;
  s.failures = 0;
  return false;
}

export function recordCircuitSuccess(key: string): void {
  pruneIfNeeded();
  const s = breakerOf(key);
  s.failures = 0;
  s.openedAt = null;
}

export function recordCircuitFailure(key: string, threshold = DEFAULT_BREAKER_THRESHOLD): void {
  pruneIfNeeded();
  const s = breakerOf(key);
  s.failures += 1;
  if (s.failures >= threshold) s.openedAt = Date.now();
}

/** Timeout untuk promise non-fetch (mis. Supabase RPC) via Promise.race. */
export function withTimeout<T>(promise: Promise<T>, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    t = setTimeout(() => reject(new DOMException('Timeout', 'TimeoutError')), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t!));
}

function breakerOf(key: string): BreakerState {
  let s = breakers.get(key);
  if (!s) {
    s = { failures: 0, openedAt: null, lastAccessed: Date.now() };
    breakers.set(key, s);
  } else {
    s.lastAccessed = Date.now();
  }
  return s;
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

function isAbortLike(e: unknown): boolean {
  if (e instanceof DOMException) return e.name === 'TimeoutError' || e.name === 'AbortError';
  if (e instanceof Error) return e.name === 'TimeoutError' || e.name === 'AbortError';
  return false;
}

function retryAfterMs(res: Response): number | null {
  try {
    const raw = res.headers?.get('retry-after');
    if (!raw) return null;
    const secs = Number(raw.trim());
    if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, 30_000);
    const t = Date.parse(raw.trim());
    if (!Number.isNaN(t)) return Math.max(0, Math.min(t - Date.now(), 30_000));
  } catch {
    // abaikan header rusak — fallback ke backoff
  }
  return null;
}

const defaultSleep: SleepFn = (ms) => new Promise((r) => setTimeout(r, ms));

function timeoutSignal(timeoutMs: number, caller?: AbortSignal | null): AbortSignal {
  const t = AbortSignal.timeout(timeoutMs);
  if (caller) {
    if (typeof AbortSignal.any === 'function') return AbortSignal.any([caller, t]);
    if (caller.aborted) return caller;
  }
  return t;
}

export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  opts: FetchRetryOptions = {}
): Promise<Response> {
  pruneIfNeeded();
  const key = opts.key ?? 'default';
  const fetchFn: FetchFn = opts.fetchFn ?? ((u, i) => (globalThis.fetch as FetchFn)(u, i));
  const sleep = opts.sleep ?? defaultSleep;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const threshold = opts.breakerThreshold ?? DEFAULT_BREAKER_THRESHOLD;
  const cooldownMs = opts.breakerCooldownMs ?? DEFAULT_BREAKER_COOLDOWN_MS;

  const breaker = breakerOf(key);
  if (breaker.openedAt !== null && Date.now() - breaker.openedAt < cooldownMs) {
    throw new Error(`Circuit open for ${key} — fail-fast, coba lagi nanti.`);
  }
  // Cooldown lewat: half-open — izinkan satu percobaan, reset bila sukses.
  if (breaker.openedAt !== null) {
    breaker.openedAt = null;
    breaker.failures = 0;
  }

  let lastError: unknown = null;
  let failedAttempts = 0;
  const attempts = Math.max(0, maxRetries) + 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    let res: Response;
    try {
      res = await fetchFn(url, {
        ...init,
        signal: timeoutSignal(timeoutMs, init?.signal ?? null),
      });
    } catch (e) {
      // Abort/timeout caller + timeout sendiri: JANGAN retry (test: 1 call).
      if (isAbortLike(e)) throw e;
      lastError = e;
      failedAttempts += 1;
      if (attempt < attempts - 1) {
        await sleep(baseDelayMs * 2 ** attempt + Math.floor(Math.random() * 100));
        continue;
      }
      break;
    }
    if (res.ok || !isRetryableStatus(res.status)) {
      if (res.ok) {
        breaker.failures = 0;
        breaker.openedAt = null;
      }
      return res;
    }
    lastError = new Error(`Request failed with status ${res.status}`);
    failedAttempts += 1;
    if (attempt < attempts - 1) {
      const ra = retryAfterMs(res);
      const delay =
        ra !== null
          ? ra + Math.floor(Math.random() * 100)
          : baseDelayMs * 2 ** attempt + Math.floor(Math.random() * 100);
      await sleep(delay);
    }
  }

  breaker.failures += failedAttempts;
  if (breaker.failures >= threshold) breaker.openedAt = Date.now();
  throw lastError instanceof Error ? lastError : new Error('Request failed');
}
