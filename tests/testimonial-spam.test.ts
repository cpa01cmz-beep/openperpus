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

import { POST, resetTestimonialRateLimit } from '@/app/api/testimonials/route';

function postTestimonial(ip: string, body: Record<string, unknown> = { name: 'Anon', content: 'Bagus!' }) {
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
    expect(statuses.slice(0, 5), 'first 5 anon POSTs must pass (201)').toEqual([201, 201, 201, 201, 201]);
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

describe('S-sec-rls-spam svg upload rejected', () => {
  it('UploadInput ALLOWED_MIME drops svg + upload uses upsert:false', async () => {
    const mod = (await import('@/components/admin/UploadInput')) as Record<string, unknown>;
    const allowed = mod.ALLOWED_MIME as string[];
    expect(allowed).toContain('image/jpeg');
    expect(allowed).toContain('application/pdf');
    expect(allowed, 'svg is a stored-XSS vector and must be rejected').not.toContain('image/svg+xml');
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/components/admin/UploadInput.tsx'), 'utf8');
    expect(src).toMatch(/upsert:\s*false/);
    expect(src, 'overwrite must be rejected (upsert:false)').not.toMatch(/upsert:\s*true/);
  });
});
