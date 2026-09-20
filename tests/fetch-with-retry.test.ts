import { describe, expect, it, vi } from 'vitest';

// Resilience: fetchWithRetry — timeout + auto-retry + Retry-After + circuit breaker.
// RED: src/lib/fetch-with-retry.ts belum ada — suite ini harus FAIL dulu (Green menyusul).

import {
  fetchWithRetry,
  clearBreaker,
  openBreakerCount,
  DEFAULT_MAX_RETRIES,
  DEFAULT_TIMEOUT_MS,
} from '@/lib/fetch-with-retry';

function okResponse(status = 200, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    json: async () => ({}),
  } as unknown as Response;
}

describe('fetchWithRetry resilience', () => {
  it('default timeout 8-10s dan max retries 2-3', () => {
    expect(DEFAULT_TIMEOUT_MS).toBeGreaterThanOrEqual(8000);
    expect(DEFAULT_TIMEOUT_MS).toBeLessThanOrEqual(10000);
    expect(DEFAULT_MAX_RETRIES).toBeGreaterThanOrEqual(2);
    expect(DEFAULT_MAX_RETRIES).toBeLessThanOrEqual(3);
  });

  it('retry transient 500 lalu sukses', async () => {
    clearBreaker('t-retry');
    const sleep = vi.fn(async () => {});
    let n = 0;
    const fetchFn = vi.fn(async () => (++n === 1 ? okResponse(500) : okResponse(200)));
    const res = await fetchWithRetry('https://x.test/a', {}, { key: 't-retry', fetchFn, sleep });
    expect(res.status).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('tidak retry 4xx non-429', async () => {
    clearBreaker('t-4xx');
    const sleep = vi.fn(async () => {});
    const fetchFn = vi.fn(async () => okResponse(422));
    const res = await fetchWithRetry('https://x.test/b', {}, { key: 't-4xx', fetchFn, sleep });
    expect(res.status).toBe(422);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('hormati Retry-After detik pada 429', async () => {
    clearBreaker('t-ra');
    const sleep = vi.fn(async () => {});
    let n = 0;
    const fetchFn = vi.fn(async () =>
      ++n === 1 ? okResponse(429, { 'retry-after': '2' }) : okResponse(200)
    );
    await fetchWithRetry('https://x.test/c', {}, { key: 't-ra', fetchFn, sleep });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    const waited = Number((sleep.mock.calls[0] as unknown[] | undefined)?.[0] ?? 0);
    expect(waited).toBeGreaterThanOrEqual(2000);
  });

  it('backoff eksponensial + jitter antar retry', async () => {
    clearBreaker('t-bo');
    const sleep = vi.fn(async () => {});
    const fetchFn = vi.fn(async () => okResponse(503));
    await expect(
      fetchWithRetry('https://x.test/d', {}, { key: 't-bo', fetchFn, sleep, maxRetries: 2 })
    ).rejects.toThrow();
    expect(fetchFn).toHaveBeenCalledTimes(3);
    const delays = sleep.mock.calls.map((c) => Number((c as unknown[])[0] ?? 0));
    const [d1, d2] = delays;
    expect(d2!).toBeGreaterThan(d1!);
  });

  it('timeout via AbortSignal (fetchFn menerima signal aborted)', async () => {
    clearBreaker('t-to');
    const sleep = vi.fn(async () => {});
    const fetchFn = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<never>((_, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Timeout', 'TimeoutError'))
          );
        })
    );
    await expect(
      fetchWithRetry('https://x.test/e', {}, { key: 't-to', fetchFn, sleep, timeoutMs: 50 })
    ).rejects.toThrow(/timeout|abort/i);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('circuit breaker: fail-fast tanpa panggil fetch saat terbuka', async () => {
    clearBreaker('t-cb');
    const sleep = vi.fn(async () => {});
    const fetchFn = vi.fn(async () => okResponse(500));
    const opts = {
      key: 't-cb',
      fetchFn,
      sleep,
      breakerThreshold: 2,
      breakerCooldownMs: 60_000,
    } as const;
    await expect(fetchWithRetry('https://x.test/f', {}, opts)).rejects.toThrow();
    fetchFn.mockClear();
    // Sirkuit terbuka -> fail-fast, fetch TIDAK dipanggil.
    await expect(fetchWithRetry('https://x.test/f', {}, opts)).rejects.toThrow(/circuit/i);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('circuit breaker: pulih setelah cooldown', async () => {
    clearBreaker('t-cb2');
    const sleep = vi.fn(async () => {});
    const fetchFn = vi.fn(async () => okResponse(500));
    const opts = {
      key: 't-cb2',
      fetchFn,
      sleep,
      breakerThreshold: 1,
      breakerCooldownMs: 10,
    } as const;
    await expect(fetchWithRetry('https://x.test/g', {}, opts)).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 20));
    fetchFn.mockClear();
    fetchFn.mockResolvedValueOnce(okResponse(200));
    const res = await fetchWithRetry('https://x.test/g', {}, { ...opts, maxRetries: 0 });
    expect(res.status).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('openBreakerCount: naik saat sirkuit terbuka, turun setelah clear', async () => {
    clearBreaker('t-metric');
    const before = openBreakerCount();
    const sleep = vi.fn(async () => {});
    const fetchFn = vi.fn(async () => okResponse(500));
    await expect(
      fetchWithRetry(
        'https://x.test/h',
        {},
        { key: 't-metric', fetchFn, sleep, breakerThreshold: 1 }
      )
    ).rejects.toThrow();
    expect(openBreakerCount()).toBe(before + 1);
    clearBreaker('t-metric');
    expect(openBreakerCount()).toBe(before);
  });
});
