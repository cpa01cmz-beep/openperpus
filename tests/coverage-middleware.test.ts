import { describe, expect, it, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const session = vi.hoisted(() => ({
  user: null as { id: string } | null,
  throw: false,
  updateCalls: 0,
}));
const profile = vi.hoisted(() => ({
  role: null as string | null,
  throwQuery: false,
}));

vi.mock('@/lib/supabase/middleware', async () => {
  const { NextResponse } = await import('next/server');
  return {
    updateSession: vi.fn(async () => {
      session.updateCalls += 1;
      if (session.throw) throw new Error('session refresh gagal');
      return { response: NextResponse.next(), user: session.user };
    }),
  };
});

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: session.user }, error: null }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => {
            if (profile.throwQuery) throw new Error('query gagal');
            return { data: profile.role === null ? null : { role: profile.role }, error: null };
          },
        }),
      }),
    }),
  }),
}));

import { middleware, config } from '@/middleware';
import { __resetRateLimitStore, WRITE_API_LIMIT } from '@/lib/rate-limit';

function req(path: string, init: RequestInit & { method?: string } = {}): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, init);
}

beforeEach(() => {
  session.user = null;
  session.throw = false;
  session.updateCalls = 0;
  profile.role = null;
  profile.throwQuery = false;
  __resetRateLimitStore();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('middleware matcher config', () => {
  it('covers /admin, /login, /api', () => {
    expect(config.matcher).toEqual(['/admin/:path*', '/login', '/api/:path*']);
  });
});

describe('middleware pass-through paths', () => {
  it('GET public path returns next without session refresh', async () => {
    const res = await middleware(req('/beranda', { method: 'GET' }));
    expect(res.status).toBe(200);
    expect(session.updateCalls).toBe(0);
  });

  it('GET /api allows read without CSRF/rate-limit', async () => {
    const res = await middleware(req('/api/books', { method: 'GET' }));
    expect(res.status).toBe(200);
  });

  it('POST /api without origin (server-to-server) is allowed', async () => {
    const res = await middleware(req('/api/loans', { method: 'POST' }));
    expect(res.status).toBe(200);
  });

  it('POST /api with same-origin origin passes', async () => {
    const res = await middleware(
      req('/api/loans', { method: 'POST', headers: { origin: 'http://localhost:3000' } })
    );
    expect(res.status).toBe(200);
  });
});

describe('middleware CSRF guard', () => {
  it('POST /api cross-site origin -> 403 CSRF_MISMATCH', async () => {
    const res = await middleware(
      req('/api/loans', { method: 'POST', headers: { origin: 'https://evil.example' } })
    );
    expect(res.status).toBe(403);
    const j = (await res.json()) as { error?: { code?: string } };
    expect(j.error?.code).toBe('CSRF_MISMATCH');
  });

  it('referer mismatch also rejected', async () => {
    const res = await middleware(
      req('/api/loans', { method: 'PUT', headers: { referer: 'https://evil.example/x' } })
    );
    expect(res.status).toBe(403);
  });
});

describe('middleware write rate limit', () => {
  it('61st write on same key -> 429 with Retry-After', async () => {
    const headers = { 'cf-connecting-ip': '203.0.113.7' };
    let last: Response | null = null;
    for (let i = 0; i <= WRITE_API_LIMIT; i++) {
      last = await middleware(req('/api/categories', { method: 'POST', headers }));
      if (last.status === 429) break;
    }
    expect(last).not.toBeNull();
    expect(last!.status).toBe(429);
    expect(last!.headers.get('Retry-After')).toBeTruthy();
    expect(last!.headers.get('X-RateLimit-Limit')).toBe(String(WRITE_API_LIMIT));
    const j = (await last!.json()) as { error?: { code?: string } };
    expect(j.error?.code).toBe('RATE_LIMITED');
  });

  it('different ip gets its own bucket', async () => {
    const headers = { 'cf-connecting-ip': '198.51.100.9' };
    const res = await middleware(req('/api/categories', { method: 'POST', headers }));
    expect(res.status).toBe(200);
  });
});

describe('middleware session + role gate on /admin', () => {
  it('logged out -> redirect /login?next=', async () => {
    const res = await middleware(req('/admin/peminjaman'));
    expect([307, 308]).toContain(res.status);
    expect(res.headers.get('location')).toContain('/login?next=%2Fadmin%2Fpeminjaman');
  });

  it('session refresh failure still redirects (fail-closed)', async () => {
    session.throw = true;
    const res = await middleware(req('/admin'));
    expect([307, 308]).toContain(res.status);
    expect(res.headers.get('location')).toContain('/login');
  });

  it('non-staff role -> redirect home', async () => {
    session.user = { id: 'u1' };
    profile.role = 'member';
    const res = await middleware(req('/admin'));
    expect([307, 308]).toContain(res.status);
    expect(res.headers.get('location')).toBe('http://localhost:3000/');
  });

  it('staff role -> passes through with session response', async () => {
    session.user = { id: 'u1' };
    profile.role = 'librarian';
    const res = await middleware(req('/admin'));
    expect(res.status).toBe(200);
  });

  it('profile query failure -> fail-closed redirect home', async () => {
    session.user = { id: 'u1' };
    profile.throwQuery = true;
    const res = await middleware(req('/admin/anggota'));
    expect([307, 308]).toContain(res.status);
    expect(res.headers.get('location')).toBe('http://localhost:3000/');
  });

  it('login path refreshes session without role gate', async () => {
    const res = await middleware(req('/login'));
    expect(res.status).toBe(200);
    expect(session.updateCalls).toBe(1);
  });
});
