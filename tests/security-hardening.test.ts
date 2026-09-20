/**
 * tests/security-hardening.test.ts — RED-first bypass coverage for security hardening.
 * Covers: sanitizer bypass vectors, pasted-URL allowlist, CSRF origin check,
 * CSP/cache headers, testimonial length caps + avatar guard.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { sanitizeHtmlContent } from '@/lib/content-validation';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('sanitizer bypass vectors (RED)', () => {
  it('menolak href javascript: tanpa quotes', () => {
    const out = sanitizeHtmlContent('<a href=javascript:alert(1)>klik</a>');
    expect(out).not.toContain('javascript:');
  });

  it('menghapus atribut srcdoc (iframe bloat/bypass)', () => {
    const out = sanitizeHtmlContent('<iframe srcdoc="<script>alert(1)</script>"></iframe>');
    expect(out).not.toContain('srcdoc');
    expect(out).not.toContain('alert(1)');
  });

  it('menolak xlink:href javascript:', () => {
    const out = sanitizeHtmlContent('<svg><use xlink:href="javascript:alert(1)"/></svg>');
    expect(out).not.toContain('javascript:');
    expect(out).not.toContain('xlink:href');
  });

  it('menolak formaction javascript:', () => {
    const out = sanitizeHtmlContent(
      '<form><button formaction="javascript:alert(1)">go</button></form>'
    );
    expect(out).not.toContain('javascript:');
    expect(out).not.toContain('formaction');
  });

  it('menghapus style expression / javascript: URL', () => {
    const out = sanitizeHtmlContent(
      '<div style="background:url(javascript:alert(1));x:expression(alert(1))">t</div>'
    );
    expect(out).not.toContain('javascript:');
    expect(out).not.toContain('expression(');
  });

  it('menetralkan svg/math dengan event handler', () => {
    const out = sanitizeHtmlContent(
      '<svg onload="alert(1)"><g>hi</g></svg><math href="javascript:alert(1)"><mi>x</mi></math>'
    );
    expect(out).not.toContain('onload');
    expect(out).not.toContain('javascript:');
  });
});

describe('upload URL allowlist (RED)', () => {
  it('UploadInput memvalidasi URL tempel (https+Supabase/relatif, tolak javascript:/data:/blob:)', () => {
    const code = src('src/components/admin/UploadInput.tsx');
    expect(code).toMatch(/javascript:/);
    // Must reference a shared allowlist validator + reject dangerous schemes.
    expect(code).toMatch(/isAllowedImageUrl|isSafeImageUrl|AllowedImageUrl/);
    expect(code).toMatch(/blob:/);
  });

  it('server testimonials menolak avatar_url javascript:/data:', () => {
    const code = src('src/app/api/testimonials/route.ts');
    expect(code).toMatch(/isAllowedImageUrl|isSafeImageUrl|avatar.*VALIDATION|VALIDATION.*avatar/s);
  });
});

describe('CSRF origin check (RED)', () => {
  it('middleware memeriksa Origin/Referer vs Host untuk write /api/*', () => {
    const code = src('src/middleware.ts');
    expect(code).toMatch(/origin/i);
    expect(code).toMatch(/referer/i);
    expect(code).toMatch(/403|CSRF/);
  });
});

describe('CSP + cache headers (RED)', () => {
  it('CSP tanpa unsafe-eval + object-src none + upgrade-insecure-requests', () => {
    const code = src('next.config.mjs');
    expect(code).not.toMatch(/unsafe-eval/);
    expect(code).toMatch(/object-src 'none'/);
    expect(code).toMatch(/upgrade-insecure-requests/);
  });

  it('Cache-Control immutable untuk /_next/static/* dan /og-default.jpg', () => {
    const code = src('next.config.mjs');
    expect(code).toMatch(/_next\/static/);
    expect(code).toMatch(/og-default\.jpg/);
    expect(code).toMatch(/immutable/);
  });
});

describe('testimonial length caps + honeypot (RED)', () => {
  it('POST menolak name/content melebihi batas (422 VALIDATION)', async () => {
    vi.resetModules();
    vi.doMock('@/lib/supabase/server', () => {
      const single = vi.fn(async () => ({ data: { id: 't-1' }, error: null }));
      const select = vi.fn(() => ({ single }));
      const insert = vi.fn(() => ({ select }));
      const from = vi.fn(() => ({ insert }));
      const getUser = vi.fn(async () => ({
        data: { user: null },
        error: { message: 'no session' },
      }));
      return { createClient: vi.fn(() => ({ from, auth: { getUser } })) };
    });
    const { POST, resetTestimonialRateLimit } = await import('@/app/api/testimonials/route');
    resetTestimonialRateLimit();
    const longName = 'n'.repeat(500);
    const req = new Request('http://localhost/api/testimonials', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '9.9.9.9' },
      body: JSON.stringify({ name: longName, content: 'ok' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
    const payload = (await res.json()) as { error: { code: string } };
    expect(payload.error.code).toBe('VALIDATION');
    vi.resetModules();
  });

  it('POST menolak avatar_url blob:/javascript: (422)', async () => {
    vi.resetModules();
    vi.doMock('@/lib/supabase/server', () => {
      const single = vi.fn(async () => ({ data: { id: 't-1' }, error: null }));
      const select = vi.fn(() => ({ single }));
      const insert = vi.fn(() => ({ select }));
      const from = vi.fn(() => ({ insert }));
      const getUser = vi.fn(async () => ({
        data: { user: null },
        error: { message: 'no session' },
      }));
      return { createClient: vi.fn(() => ({ from, auth: { getUser } })) };
    });
    const { POST, resetTestimonialRateLimit } = await import('@/app/api/testimonials/route');
    resetTestimonialRateLimit();
    const req = new Request('http://localhost/api/testimonials', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '9.9.9.10' },
      body: JSON.stringify({ name: 'Anon', content: 'Bagus', avatar_url: 'javascript:alert(1)' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
    vi.resetModules();
  });

  it('route mempertahankan honeypot + throttle + catatan persistensi moderasi', () => {
    const code = src('src/app/api/testimonials/route.ts');
    expect(code).toMatch(/website/);
    expect(code).toMatch(/SPAM_DETECTED/);
    expect(code).toMatch(/checkTestimonialRateLimit/);
    expect(code).toMatch(/is_active.*false|moderasi/i);
  });
});

describe('imageLoader preconnect note (RED)', () => {
  it('imageLoader mendokumentasikan snippet preconnect/dns-prefetch untuk layout owner', () => {
    const code = src('src/lib/imageLoader.ts');
    expect(code).toMatch(/preconnect/);
    expect(code).toMatch(/dns-prefetch/);
  });
});

describe('env hygiene note (RED)', () => {
  it('.env.example mendokumentasikan .env.local gitignored tanpa nilai secret', () => {
    const code = src('.env.example');
    expect(code).toMatch(/\.env\.local/);
    expect(code).toMatch(/gitignore|jangan.*commit|do not commit/i);
    expect(code).not.toMatch(/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.eyJzdWIiOiIxMjM0NTY3ODkw/);
  });
});

// Keep unused import referenced for lint cleanliness.
void beforeEach;
