import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

vi.mock('next/cache', () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase),
}));

import { resetMockDb, installMockSupabase, setProfileRole } from './helpers/supabase-mock';
import { getOperationalHours, getSocials, formatOperationalHour } from '@/lib/settings';
import { requestIdFromHeaders } from '@/lib/logger';
import { jsonErrorMsg } from '@/lib/http-error';
import { taggedQuery, REVALIDATE_DEFAULT } from '@/lib/fetch-cache';
import { getSessionUser } from '@/lib/auth';
import { createWriteLog } from '@/lib/api-utils';
import { buildWaDunningUrl, buildCopyPayload } from '@/lib/wa-dunning';
import { sanitizeContentPayload, validateContentFields } from '@/lib/validation';
import { bookSchema } from '@/lib/validation/book';
import {
  normalizeOperationalHour,
  normalizeOperationalHours,
  FALLBACK_SETTINGS,
} from '@/lib/types';
import { stockState, ratingNumber, coerceRating, normalizeBooks } from '@/lib/domain-format';
import { getSiteUrl } from '@/lib/site';
import { coverSrc } from '@/lib/cover';
import imageLoader from '@/lib/imageLoader';
import { createClient as createBrowserClientFn } from '@/lib/supabase/client';
import { createPublicClient } from '@/lib/supabase/public';
import * as supaBarrel from '@/lib/supabase/index';
import * as contentBarrel from '@/lib/content-validation';
import * as validationIndex from '@/lib/validation/index';
import {
  fetchWithRetry,
  clearBreaker,
  isCircuitOpen,
  recordCircuitSuccess,
  recordCircuitFailure,
  withTimeout,
  getBreakerStats,
} from '@/lib/fetch-with-retry';

beforeEach(() => {
  resetMockDb();
  installMockSupabase();
  clearBreaker();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function okResponse(status = 200, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    json: async () => ({}),
  } as unknown as Response;
}

describe('settings helpers', () => {
  it('getOperationalHours normalizes fallback rows', () => {
    const hours = getOperationalHours(FALLBACK_SETTINGS);
    expect(Array.isArray(hours)).toBe(true);
    expect(hours.length).toBeGreaterThan(0);
    expect(hours[0]?.day).toBeTruthy();
  });

  it('getSocials returns object or {} for null', () => {
    expect(getSocials({ ...FALLBACK_SETTINGS, socials: { facebook: 'https://fb.com/x' } })).toEqual(
      {
        facebook: 'https://fb.com/x',
      }
    );
    expect(getSocials({ ...FALLBACK_SETTINGS, socials: null })).toEqual({});
  });

  it('formatOperationalHour renders range or bare day', () => {
    expect(formatOperationalHour({ day: 'Senin', open: '08:00', close: '16:00' })).toBe(
      'Senin: 08:00–16:00'
    );
    expect(formatOperationalHour({ day: 'Libur', open: null, close: null })).toBe('Libur');
    expect(formatOperationalHour({ day: null, open: '09:00', close: null })).toBe('-: 09:00–');
  });
});

describe('logger fallback requestId', () => {
  it('requestIdFromHeaders falls back when randomUUID unavailable', () => {
    const orig = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', {
      value: {
        ...orig,
        randomUUID: () => {
          throw new Error('no uuid');
        },
      },
      configurable: true,
    });
    try {
      const id = requestIdFromHeaders(new Headers());
      expect(id).toMatch(/^[0-9]+-[0-9]+$/);
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: orig, configurable: true });
    }
  });
});

describe('http-error legacy alias', () => {
  it('jsonErrorMsg delegates to BAD_REQUEST envelope', async () => {
    const res = jsonErrorMsg('Masalah input', 422, { field: 'title' });
    expect(res.status).toBe(422);
    const body = (await res.json()) as {
      error: { code: string; message: string };
      details: unknown;
    };
    expect(body.error.code).toBe('BAD_REQUEST');
    expect(body.error.message).toBe('Masalah input');
    expect(body.details).toEqual({ field: 'title' });
  });
});

describe('fetch-cache taggedQuery', () => {
  it('taggedQuery wires cachedFetch with tag', async () => {
    const run = taggedQuery('my-tag', 120);
    const out = await run(async () => 42, ['k1']);
    expect(out).toBe(42);
    expect(REVALIDATE_DEFAULT).toBe(60);
  });
});

describe('session user mapping', () => {
  it('getSessionUser returns normalized role + rawRole', async () => {
    setProfileRole('librarian');
    const out = await getSessionUser();
    expect(out.user).not.toBeNull();
    expect(out.rawRole).toBe('librarian');
    expect(out.role).toBe('pustakawan');
    expect(out.profile?.role).toBe('librarian');
  });
});

describe('api-utils audit factory', () => {
  it('createWriteLog writes best-effort without throwing on failure', async () => {
    const writeEntityLog = createWriteLog('loans');
    await expect(
      writeEntityLog(
        (globalThis as unknown as { __mockSupabase: Record<string, unknown> })
          .__mockSupabase as never,
        'u1',
        'loans.audit',
        'L-9',
        { x: 1 }
      )
    ).resolves.toBeUndefined();
  });
});

describe('wa dunning helpers', () => {
  it('buildWaDunningUrl encodes text', () => {
    expect(buildWaDunningUrl('Halo ada denda')).toBe(
      `https://wa.me/?text=${encodeURIComponent('Halo ada denda')}`
    );
  });

  it('buildCopyPayload includes all keys', () => {
    const payload = buildCopyPayload({
      loanId: 'L1',
      memberCode: 'AG-1',
      title: 'Buku',
      dueAt: '2026-10-01',
      lateDays: 3,
      fine: 3000,
    });
    expect(payload).toContain('ID loan: L1');
    expect(payload).toContain('member_code: AG-1');
    expect(payload).toContain('telat 3 hari');
    expect(payload).toContain('denda: Rp3.000');
  });
});

describe('validation extras', () => {
  it('sanitizeContentPayload strips script from settings html fields', () => {
    const payload = sanitizeContentPayload('settings', {
      vision: '<b>visi</b><script>alert(1)</script>',
      about: 123,
    });
    expect(String(payload.vision)).toContain('<b>visi</b>');
    expect(String(payload.vision)).not.toContain('script');
    expect(payload.about).toBe(123);
  });

  it('validateContentFields ignores unknown fields', () => {
    expect(validateContentFields('testimonials', { unknown_field: 'x' })).toBeNull();
    expect(validateContentFields('testimonials', { name: 'y'.repeat(201) })).toContain('200');
  });

  it('bookSchema safeParse accepts valid book', () => {
    const res = bookSchema.safeParse({ title: 'Judul Valid', author: 'Penulis' });
    expect(res.success).toBe(true);
  });
});

describe('types + domain helpers', () => {
  it('normalizeOperationalHour handles junk', () => {
    expect(normalizeOperationalHour(null)).toBeNull();
    expect(normalizeOperationalHour('bukan-objek')).toBeNull();
    expect(normalizeOperationalHour({ day: '  Senin ', open: '', close: '' })).toEqual({
      day: 'Senin',
      open: null,
      close: null,
    });
    expect(normalizeOperationalHours([null, { hari: 'Selasa', buka: '08:00' }])).toHaveLength(1);
    expect(normalizeOperationalHours('x')).toEqual([]);
  });

  it('stock/rating coercions cover branches', () => {
    expect(stockState({ stock_available: 0, stock_total: 5 }).tone).toBe('rose');
    expect(stockState({ stock_available: 9, stock_total: 9 }).tone).toBe('emerald');
    expect(ratingNumber('4.2')).toBe(4.2);
    expect(ratingNumber('bukan')).toBe(0);
    expect(ratingNumber(99)).toBe(5);
    expect(coerceRating('')).toBeNull();
    expect(coerceRating(99)).toBeNull();
    expect(coerceRating(2.5)).toBe(2.5);
    expect(normalizeBooks([{ rating_avg: '4.5' }])).toEqual([{ rating_avg: 4.5 }]);
  });
});

describe('site/cover/imageLoader', () => {
  it('getSiteUrl prefers explicit, then vercel, then localhost', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://situs.test///');
    expect(getSiteUrl()).toBe('https://situs.test');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    vi.stubEnv('VERCEL_URL', 'proj.vercel.app');
    expect(getSiteUrl()).toBe('https://proj.vercel.app');
    vi.stubEnv('VERCEL_URL', '');
    expect(getSiteUrl()).toBe('http://localhost:3000');
  });

  it('coverSrc passthrough for non-storage and width fallback', () => {
    expect(coverSrc(null)).toBeNull();
    expect(coverSrc(undefined)).toBeNull();
    expect(coverSrc('/local/cover.png', 960)).toBe('/local/cover.png');
    expect(coverSrc('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png');
    const storage = coverSrc('https://demo.supabase.co/storage/v1/object/public/covers/a.png', 999);
    expect(String(storage)).toContain('/storage/v1/render/image/public/');
    expect(String(storage)).toContain('width=400');
    expect(String(storage)).toContain('quality=75');
  });

  it('imageLoader passes through non-storage URLs', () => {
    expect(imageLoader({ src: '/og-default.jpg', width: 1280 })).toBe('/og-default.jpg');
    expect(imageLoader({ src: 'data:image/png;base64,x', width: 64 })).toBe(
      'data:image/png;base64,x'
    );
  });
});

describe('supabase browser + public clients', () => {
  it('createPublicClient throws without env, then memoizes with env', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    expect(() => createPublicClient()).toThrow(/belum diset/);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://demo.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'sb_publishable_demo');
    const a = createPublicClient();
    const b = createPublicClient();
    expect(a).toBe(b);
    expect(supaBarrel.createPublicClient).toBe(createPublicClient);
    expect(typeof supaBarrel.createClient).toBe('function');
    expect(typeof supaBarrel.createServerClient).toBe('function');
    expect(typeof supaBarrel.requireStaff).toBe('function');
    expect(typeof supaBarrel.updateSession).toBe('function');
  });

  it('createBrowserClient memoizes per module', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://demo.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'sb_publishable_demo');
    const a = createBrowserClientFn();
    const b = createBrowserClientFn();
    expect(a).toBe(b);
  });
});

describe('barrel re-exports are live', () => {
  it('content-validation + validation/index expose canonical APIs', () => {
    expect(contentBarrel.CONTENT_LIMITS).toBeDefined();
    expect(typeof contentBarrel.sanitizeHtmlContent).toBe('function');
    expect(typeof validationIndex.validateBook).toBe('function');
    expect(typeof validationIndex.isUuid).toBe('function');
    expect(typeof validationIndex.validateMember).toBe('function');
    expect(typeof validationIndex.validateLoan).toBe('function');
    expect(typeof validationIndex.validateFine).toBe('function');
    expect(typeof validationIndex.sanitizeContentPayload).toBe('function');
  });
});

describe('fetch-with-retry uncovered branches', () => {
  it('withTimeout resolves fast promise and rejects slow one', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 500)).resolves.toBe('ok');
    await expect(withTimeout(new Promise((r) => setTimeout(r, 2000)), 50)).rejects.toMatchObject({
      name: 'TimeoutError',
    });
  });

  it('circuit helpers: failure threshold opens, success closes, stats shape', () => {
    clearBreaker('cb1');
    expect(isCircuitOpen('cb1')).toBe(false);
    recordCircuitFailure('cb1', 1);
    expect(isCircuitOpen('cb1', 60_000)).toBe(true);
    recordCircuitSuccess('cb1');
    expect(isCircuitOpen('cb1', 60_000)).toBe(false);
    const stats = getBreakerStats();
    expect(stats).toHaveProperty('total');
    expect(stats).toHaveProperty('open');
    expect(stats).toHaveProperty('closed');
    expect(typeof stats.total).toBe('number');
  });

  it('fetchWithRetry network error retries then throws last', async () => {
    clearBreaker('net1');
    const sleep = vi.fn(async () => {});
    let calls = 0;
    const fetchFn = vi.fn(async () => {
      calls += 1;
      throw new Error('jaringan putus');
    });
    await expect(
      fetchWithRetry('https://x.test/net', {}, { key: 'net1', fetchFn, sleep, maxRetries: 2 })
    ).rejects.toThrow('jaringan putus');
    expect(calls).toBe(3);
  });

  it('fetchWithRetry abort errors are rethrown without retry', async () => {
    clearBreaker('ab1');
    const sleep = vi.fn(async () => {});
    const abortErr = new DOMException('aborted', 'AbortError');
    const fetchFn = vi.fn(async () => {
      throw abortErr;
    });
    await expect(
      fetchWithRetry('https://x.test/ab', {}, { key: 'ab1', fetchFn, sleep })
    ).rejects.toThrow('aborted');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('success resets breaker counters', async () => {
    clearBreaker('ok1');
    recordCircuitFailure('ok1', 10);
    const sleep = vi.fn(async () => {});
    const fetchFn = vi.fn(async () => okResponse(200));
    const res = await fetchWithRetry('https://x.test/ok', {}, { key: 'ok1', fetchFn, sleep });
    expect(res.status).toBe(200);
    expect(isCircuitOpen('ok1', 60_000)).toBe(false);
  });
});
