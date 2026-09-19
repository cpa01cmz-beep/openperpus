/**
 * Edge-safe in-memory sliding-window rate limiter.
 * Aman untuk Cloudflare Workers via OpenNext (tanpa API Node-only,
 * tanpa dependency eksternal). Satu Map per isolate/worker.
 *
 * Catatan: batas ini per-instance. Untuk proteksi DDoS terdistribusi,
 * aktifkan Cloudflare Rate Limiting Rules di dashboard sebagai lapisan luar.
 */

type Bucket = { hits: number[] };

const store = new Map<string, Bucket>();

// Batasi ukuran Map agar tidak bocor memori pada long-lived isolate.
const MAX_BUCKETS = 5000;

function pruneIfNeeded(): void {
  if (store.size <= MAX_BUCKETS) return;
  // Hapus bucket terlama lebih dulu (insertion order).
  const overflow = store.size - MAX_BUCKETS;
  let removed = 0;
  for (const key of store.keys()) {
    store.delete(key);
    if (++removed >= overflow) break;
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAfterMs: number;
}

/**
 * Sliding-window check: max `limit` hits per `windowMs` untuk `key`.
 * Edge-safe: hanya Map + Date.now().
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now()
): RateLimitResult {
  pruneIfNeeded();
  let bucket = store.get(key);
  if (!bucket) {
    bucket = { hits: [] };
    store.set(key, bucket);
  }
  const cutoff = now - windowMs;
  // Buang hit di luar window (array kecil: <= limit+1 elemen).
  while (bucket.hits.length > 0 && (bucket.hits[0] as number) <= cutoff) {
    bucket.hits.shift();
  }
  if (bucket.hits.length >= limit) {
    const oldest = bucket.hits[0] as number;
    return { allowed: false, remaining: 0, resetAfterMs: oldest + windowMs - now };
  }
  bucket.hits.push(now);
  return { allowed: true, remaining: limit - bucket.hits.length, resetAfterMs: windowMs };
}

/** Kebijakan rate-limit untuk write API. */
export const WRITE_API_LIMIT = 60; // request
export const WRITE_API_WINDOW_MS = 60_000; // per menit

/** Reset store — hanya untuk test (vitest). */
export function __resetRateLimitStore(): void {
  store.clear();
}
