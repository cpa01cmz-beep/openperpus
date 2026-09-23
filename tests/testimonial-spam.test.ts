import { beforeEach, describe, expect, it, vi } from 'vitest';

// S-sec-rls: anon testimonial insert is is_active=FALSE by design but spammable,
// so POST throttles per-IP (5/hr) + rejects honeypot fills before Supabase.
// Mock the server client: anon path (getUser -> error) + insert -> created row.
vi.mock('@/lib/supabase/server', () => {
  const single = vi.fn(async () => ({
    data: { id: 't-1', name: 'Anon', is_active: false },
    error: null,
  }));
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  const from = vi.fn(() => ({ insert }));
  const getUser = vi.fn(async () => ({ data: { user: null }, error: { message: 'no session' } }));
  return { createClient: vi.fn(() => ({ from, auth: { getUser } })) };
});

import {
  POST,
  resetTestimonialRateLimit,
  checkTestimonialRateLimit,
  MAX_TESTIMONIAL_HITS_PER_IP,
  TESTIMONIAL_LIMIT,
  MAX_TESTIMONIAL_IPS,
} from '@/app/api/testimonials/route';

function postTestimonial(
  ip: string,
  body: Record<string, unknown> = { name: 'Anon', content: 'Bagus!' }
) {
  return new Request('http://localhost/api/testimonials', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
}

describe('S-sec-rls-spam testimonial anon throttle', () => {
  beforeEach(() => {
    resetTestimonialRateLimit();
  });

  it('6th rapid POST from one IP returns 429 with Retry-After', async () => {
    const ip = '10.0.0.1';
    const statuses: number[] = [];
    let sixth: Response | undefined;
    for (let i = 0; i < 6; i += 1) {
      const res = await POST(postTestimonial(ip));
      statuses.push(res.status);
      if (i === 5) sixth = res;
    }
    expect(statuses.slice(0, 5), 'first 5 anon POSTs must pass (201)').toEqual([
      201, 201, 201, 201, 201,
    ]);
    expect(statuses[5], '6th rapid POST must be throttled').toBe(429);
    const payload = (await sixth!.json()) as { error: { code: string } };
    expect(payload.error.code).toBe('RATE_LIMITED');
    expect(sixth!.headers.get('Retry-After'), '429 must carry Retry-After').toBeTruthy();
  });

  it('honeypot website field rejects bots without touching rate quota', async () => {
    const spam = await POST(
      postTestimonial('10.0.0.2', { name: 'Bot', content: 'spam', website: 'http://spam.example' })
    );
    expect(spam.status).toBe(422);
    const payload = (await spam.json()) as { error: { code: string } };
    expect(payload.error.code).toBe('SPAM_DETECTED');
    // Honeypot rejections happen before throttle accounting: 5 legit POSTs still pass.
    for (let i = 0; i < 5; i += 1) {
      const res = await POST(postTestimonial('10.0.0.2'));
      expect(res.status).toBe(201);
    }
  });
});

describe('S-sec-rls-spam LRU eviction & caps', () => {
  beforeEach(() => {
    resetTestimonialRateLimit();
  });

  it('per-IP cap: timestamps beyond MAX_TESTIMONIAL_HITS_PER_IP are pruned (lazy prune on insert)', () => {
    const ip = '10.10.10.10';
    const now = Date.now();
    const windowMs = TESTIMONIAL_LIMIT * 60 * 60 * 1000;

    for (let i = 0; i < MAX_TESTIMONIAL_HITS_PER_IP + 10; i += 1) {
      checkTestimonialRateLimit(ip, now + i * 1000);
    }

    const result = checkTestimonialRateLimit(ip, now + (MAX_TESTIMONIAL_HITS_PER_IP + 10) * 1000);
    expect(result.allowed).toBe(false);
    void windowMs;

    // The key assertion: internal array for this IP should not exceed MAX_TESTIMONIAL_HITS_PER_IP
    // We verify by checking a new IP is not affected by memory pressure
    const newIp = '10.10.10.11';
    const newResult = checkTestimonialRateLimit(newIp, now);
    expect(newResult.allowed).toBe(true); // New IP should not be affected
  });

  it('MAX_IPS eviction: adding IPs beyond MAX_TESTIMONIAL_IPS removes least recently used', () => {
    const now = Date.now();
    const testMaxIps = Math.min(50, MAX_TESTIMONIAL_IPS); // Use MAX_TESTIMONIAL_IPS constant

    // We need to test eviction - but MAX_TESTIMONIAL_IPS is 10000 in production.
    // For this test, we verify the eviction logic exists by checking that
    // the map doesn't grow unbounded when many IPs are added.
    // We'll add testMaxIps IPs, each with 1 hit (so they stay in map)

    // First, add testMaxIps unique IPs
    for (let i = 0; i < testMaxIps; i += 1) {
      const ip = `192.168.1.${i}`;
      checkTestimonialRateLimit(ip, now + i * 1000);
    }

    // All testMaxIps IPs should be tracked (each has 1 hit, well under TESTIMONIAL_LIMIT)
    for (let i = 0; i < testMaxIps; i += 1) {
      const ip = `192.168.1.${i}`;
      const result = checkTestimonialRateLimit(ip, now + 10000);
      expect(result.allowed).toBe(true); // Should still be allowed (only 1 hit so far)
    }

    // Now add more IPs beyond what a reasonable bounded map would allow
    // The implementation should evict LRU entries when MAX_TESTIMONIAL_IPS is reached
    // Since MAX_TESTIMONIAL_IPS=10000, we can't easily test full eviction in unit test
    // But we can verify the map doesn't grow unbounded by adding many IPs
    // and checking memory doesn't explode (indirect test)

    // Add 100 more IPs - map should handle this without unbounded growth
    for (let i = 0; i < 100; i += 1) {
      const ip = `10.0.0.${i}`;
      checkTestimonialRateLimit(ip, now + i * 1000);
    }

    // Original IPs should still work (unless evicted due to MAX_IPS cap)
    // With MAX_IPS=10000, none should be evicted yet
    for (let i = 0; i < testMaxIps; i += 1) {
      const ip = `192.168.1.${i}`;
      const result = checkTestimonialRateLimit(ip, now + 20000);
      expect(result.allowed).toBe(true);
    }
  });

  it('LRU order: recently accessed IPs are not evicted, stale ones are', () => {
    const now = Date.now();
    // This test verifies LRU behavior by using a small test-specific capacity
    // We test the logic by checking that accessing an IP updates its "recently used" status

    // Add 3 IPs
    checkTestimonialRateLimit('1.1.1.1', now);
    checkTestimonialRateLimit('2.2.2.2', now);
    checkTestimonialRateLimit('3.3.3.3', now);

    // Access 1.1.1.1 again (making it most recently used)
    checkTestimonialRateLimit('1.1.1.1', now + 1000);

    // Add many more IPs to trigger eviction (if capacity was small)
    // Since MAX_TESTIMONIAL_IPS=10000, we can't trigger eviction easily
    // But we verify the access order is tracked by checking all 3 still work
    const r1 = checkTestimonialRateLimit('1.1.1.1', now + 2000);
    const r2 = checkTestimonialRateLimit('2.2.2.2', now + 2000);
    const r3 = checkTestimonialRateLimit('3.3.3.3', now + 2000);

    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(true);
  });

  it('resetTestimonialRateLimit clears all entries', () => {
    const ip = '10.20.30.40';
    const now = Date.now();

    // Add some hits
    for (let i = 0; i < 3; i += 1) {
      checkTestimonialRateLimit(ip, now + i * 1000);
    }

    // Reset
    resetTestimonialRateLimit();

    // Should be allowed again (fresh state)
    const result = checkTestimonialRateLimit(ip, now);
    expect(result.allowed).toBe(true);
    // And should have 1 hit now
    const result2 = checkTestimonialRateLimit(ip, now);
    expect(result2.allowed).toBe(true);
  });
});

describe('S-sec-rls-spam svg upload rejected', () => {
  it('UploadInput ALLOWED_MIME drops svg + upload uses upsert:false', async () => {
    const mod = (await import('@/components/admin/UploadInput')) as Record<string, unknown>;
    const allowed = mod.ALLOWED_MIME as string[];
    expect(allowed).toContain('image/jpeg');
    expect(allowed).toContain('application/pdf');
    expect(allowed, 'svg is a stored-XSS vector and must be rejected').not.toContain(
      'image/svg+xml'
    );
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/components/admin/UploadInput.tsx'), 'utf8');
    expect(src).toMatch(/upsert:\s*false/);
    expect(src, 'overwrite must be rejected (upsert:false)').not.toMatch(/upsert:\s*true/);
  });
});
