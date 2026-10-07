import { describe, expect, it, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { buildContentSecurityPolicy, middleware, config } from '@/middleware';

function req(path: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`);
}

function scriptSrc(csp: string): string {
  const directives = csp
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean);
  const directive =
    directives.find((d) => d.startsWith('script-src ')) ??
    directives.find((d) => d.startsWith('default-src '));
  expect(directive, 'CSP must define script-src or default-src').toBeTruthy();
  return directive!;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('buildContentSecurityPolicy (prod)', () => {
  it('script-src forbids unsafe-inline and unsafe-eval when a nonce is present', () => {
    const csp = buildContentSecurityPolicy('TESTNONCE123');
    const src = scriptSrc(csp);
    expect(src).toContain("'nonce-TESTNONCE123'");
    expect(src).not.toContain("'unsafe-inline'");
    expect(src).not.toContain("'unsafe-eval'");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
  });

  it('keeps style-src unsafe-inline (AC is script-src only) and all hardening directives', () => {
    const csp = buildContentSecurityPolicy('TESTNONCE123');
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    for (const directive of [
      "default-src 'self'",
      "img-src 'self' data: https: blob:",
      "font-src 'self' data: https://*.supabase.co",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      'upgrade-insecure-requests',
    ]) {
      expect(csp, `missing directive: ${directive}`).toContain(directive);
    }
    expect(csp).toContain('https://*.supabase.co');
  });

  it('is looser only in development (NODE_ENV gate)', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const dev = buildContentSecurityPolicy('TESTNONCE123');
    expect(dev).toContain("'unsafe-inline'");
    vi.unstubAllEnvs();
    const prod = buildContentSecurityPolicy('TESTNONCE123');
    expect(scriptSrc(prod)).not.toContain("'unsafe-inline'");
  });
});

describe('middleware CSP attachment', () => {
  it('public HTML path: one CSP response header, script-src nonce without unsafe-inline', async () => {
    const res = await middleware(req('/katalog'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-security-policy')).toBeTruthy();
    const csp = res.headers.get('content-security-policy')!;
    const src = scriptSrc(csp);
    expect(src).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
    expect(src).not.toContain("'unsafe-inline'");
    expect(src).not.toContain("'unsafe-eval'");
  });

  it('forwards CSP on the request so Next 14.2 render can read the nonce', async () => {
    const res = await middleware(req('/'));
    const forwarded = res.headers.get('x-middleware-request-content-security-policy');
    expect(forwarded).toBeTruthy();
    expect(scriptSrc(forwarded!)).toMatch(/'nonce-/);
    expect(res.headers.get('x-middleware-request-x-nonce')).toBeTruthy();
    expect(res.headers.get('x-middleware-override-headers')).toContain('content-security-policy');
  });

  it('generates a fresh nonce per request', async () => {
    const a = (await middleware(req('/a'))).headers.get(
      'x-middleware-request-content-security-policy'
    );
    const b = (await middleware(req('/b'))).headers.get(
      'x-middleware-request-content-security-policy'
    );
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a).not.toBe(b);
  });

  it('/api/docs keeps working via hash-based CSP without unsafe-inline', async () => {
    const res = await middleware(req('/api/docs'));
    expect(res.status).toBe(200);
    const csp = res.headers.get('content-security-policy')!;
    expect(csp).toBeTruthy();
    expect(scriptSrc(csp)).not.toContain("'unsafe-inline'");
    expect(csp).toContain('https://cdn.jsdelivr.net');
    expect(csp).toContain("'sha256-");
    expect(csp).toContain('https://fonts.scalar.com');
  });

  it('JSON API responses stay CSP-free (unchanged behavior)', async () => {
    const res = await middleware(req('/api/books'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-security-policy')).toBeNull();
  });

  it('matcher still covers /admin, /login, /api and excludes static assets', () => {
    expect(config.matcher).toEqual(['/((?!_next/static|_next/image|favicon.ico).*)']);
  });
});
