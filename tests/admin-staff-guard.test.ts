import { describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Issue #25 — Centralize staff authorization checks.
// Gherkin: signed-in user WITHOUT staff role → every admin-only endpoint 403.
// Guard kanonis: requireStaff() di src/lib/supabase/auth.ts
// (fail-closed: anon 401, non-staf 403, profil error 403 — mirror is_staff()).

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import {
  GET as articlesGET,
  POST as articlesPOST,
  PUT as articlesPUT,
  DELETE as articlesDELETE,
} from '@/app/api/articles/route';
import {
  GET as bannersGET,
  POST as bannersPOST,
  PUT as bannersPUT,
  DELETE as bannersDELETE,
} from '@/app/api/banners/route';
import { POST as booksPOST, PUT as booksPUT, DELETE as booksDELETE } from '@/app/api/books/route';
import {
  GET as bookByIdGET,
  PUT as bookByIdPUT,
  DELETE as bookByIdDELETE,
} from '@/app/api/books/[id]/route';
import {
  GET as categoriesGET,
  POST as categoriesPOST,
  PUT as categoriesPUT,
  DELETE as categoriesDELETE,
} from '@/app/api/categories/route';
import {
  PUT as categoryByIdPUT,
  DELETE as categoryByIdDELETE,
} from '@/app/api/categories/[id]/route';
import {
  GET as faqsGET,
  POST as faqsPOST,
  PUT as faqsPUT,
  DELETE as faqsDELETE,
} from '@/app/api/faqs/route';
import { PUT as faqByIdPUT, DELETE as faqByIdDELETE } from '@/app/api/faqs/[id]/route';
import { POST as finesPOST } from '@/app/api/fines/route';
import {
  GET as loansGET,
  POST as loansPOST,
  PUT as loansPUT,
  DELETE as loansDELETE,
} from '@/app/api/loans/route';
import { PUT as loanByIdPUT, DELETE as loanByIdDELETE } from '@/app/api/loans/[id]/route';
import { POST as loanReturnPOST } from '@/app/api/loans/[id]/return/route';
import {
  GET as membersGET,
  POST as membersPOST,
  PUT as membersPUT,
  DELETE as membersDELETE,
} from '@/app/api/members/route';
import {
  GET as menusGET,
  POST as menusPOST,
  PUT as menusPUT,
  DELETE as menusDELETE,
} from '@/app/api/menus/route';
import { PUT as menuByIdPUT, DELETE as menuByIdDELETE } from '@/app/api/menus/[id]/route';
import {
  GET as pagesGET,
  POST as pagesPOST,
  PUT as pagesPUT,
  DELETE as pagesDELETE,
} from '@/app/api/pages/route';
import { PUT as pageByIdPUT, DELETE as pageByIdDELETE } from '@/app/api/pages/[id]/route';
import {
  GET as racksGET,
  POST as racksPOST,
  PUT as racksPUT,
  DELETE as racksDELETE,
} from '@/app/api/racks/route';
import { PUT as rackByIdPUT, DELETE as rackByIdDELETE } from '@/app/api/racks/[id]/route';
import { PUT as settingsPUT } from '@/app/api/settings/route';
import {
  GET as testimonialsGET,
  PUT as testimonialsPUT,
  DELETE as testimonialsDELETE,
} from '@/app/api/testimonials/route';
import {
  POST as servicesPOST,
  PUT as servicesPUT,
  DELETE as servicesDELETE,
} from '@/app/api/services/route';
import { PUT as serviceByIdPUT, DELETE as serviceByIdDELETE } from '@/app/api/services/[id]/route';
import {
  PUT as testimonialByIdPUT,
  DELETE as testimonialByIdDELETE,
} from '@/app/api/testimonials/[id]/route';

type Case = { name: string; run: () => Promise<Response> };

const ID = '11111111-1111-4111-8111-111111111111';
const CTX = { params: { id: ID } };
// Wave2 services/[id] memakai Next16 async params (Promise) — CTX lama
// (objek biasa) tak lolos tsc untuk handler ini.
const SVC_CTX = { params: Promise.resolve({ id: ID }) };
const req = (url = 'http://localhost/api/x'): Request => new Request(url);

// Generic Supabase query-chain mock: builder methods return the chain,
// single()/maybeSingle() resolve the row, awaiting the chain resolves the result.
function queryChain(data: unknown): object {
  const build = (): object =>
    new Proxy<Record<string | symbol, unknown>>(
      {},
      {
        get(_t, prop) {
          if (prop === 'then')
            return (resolve: (v: unknown) => void) =>
              resolve({ data, error: null, count: Array.isArray(data) ? data.length : 0 });
          if (prop === 'single' || prop === 'maybeSingle')
            return async () => ({ data, error: null });
          if (typeof prop !== 'string') return undefined;
          return () => build();
        },
      }
    );
  return build();
}

function setSession(user: { id: string } | null, role: string | null): void {
  const profiles = {
    select: () => ({
      eq: () => ({
        single: async () =>
          role === null
            ? { data: null, error: { message: 'no profile' } }
            : { data: { role }, error: null },
        maybeSingle: async () => ({ data: role === null ? null : { role }, error: null }),
      }),
    }),
  };
  (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase = {
    auth: {
      getUser: async () => ({
        data: { user },
        error: user ? null : { message: 'no session' },
      }),
    },
    from: (table: string) => (table === 'profiles' ? profiles : queryChain([])),
  };
}

const adminOnly: Case[] = [
  { name: 'POST /api/articles', run: () => articlesPOST(req()) },
  { name: 'PUT /api/articles', run: () => articlesPUT(req()) },
  { name: 'DELETE /api/articles', run: () => articlesDELETE(req()) },
  { name: 'GET /api/banners', run: () => bannersGET(req()) },
  { name: 'POST /api/banners', run: () => bannersPOST(req()) },
  { name: 'PUT /api/banners', run: () => bannersPUT(req()) },
  { name: 'DELETE /api/banners', run: () => bannersDELETE(req()) },
  { name: 'POST /api/books', run: () => booksPOST(req()) },
  { name: 'PUT /api/books', run: () => booksPUT(req()) },
  { name: 'DELETE /api/books', run: () => booksDELETE(req()) },
  { name: 'POST /api/categories', run: () => categoriesPOST(req()) },
  { name: 'PUT /api/categories', run: () => categoriesPUT(req()) },
  { name: 'DELETE /api/categories', run: () => categoriesDELETE(req()) },
  { name: 'POST /api/faqs', run: () => faqsPOST(req()) },
  { name: 'PUT /api/faqs', run: () => faqsPUT(req()) },
  { name: 'DELETE /api/faqs', run: () => faqsDELETE(req()) },
  { name: 'POST /api/fines', run: () => finesPOST(req()) },
  { name: 'GET /api/loans', run: () => loansGET(req()) },
  { name: 'POST /api/loans', run: () => loansPOST(req()) },
  { name: 'PUT /api/loans', run: () => loansPUT(req()) },
  { name: 'DELETE /api/loans', run: () => loansDELETE(req()) },
  { name: 'GET /api/members', run: () => membersGET(req()) },
  { name: 'POST /api/members', run: () => membersPOST(req()) },
  { name: 'PUT /api/members', run: () => membersPUT(req()) },
  { name: 'DELETE /api/members', run: () => membersDELETE(req()) },
  { name: 'POST /api/menus', run: () => menusPOST(req()) },
  { name: 'PUT /api/menus', run: () => menusPUT(req()) },
  { name: 'DELETE /api/menus', run: () => menusDELETE(req()) },
  { name: 'POST /api/pages', run: () => pagesPOST(req()) },
  { name: 'PUT /api/pages', run: () => pagesPUT(req()) },
  { name: 'DELETE /api/pages', run: () => pagesDELETE(req()) },
  { name: 'POST /api/racks', run: () => racksPOST(req()) },
  { name: 'PUT /api/racks', run: () => racksPUT(req()) },
  { name: 'DELETE /api/racks', run: () => racksDELETE(req()) },
  { name: 'POST /api/services', run: () => servicesPOST(req()) },
  { name: 'PUT /api/services', run: () => servicesPUT(req()) },
  { name: 'DELETE /api/services', run: () => servicesDELETE(req()) },
  { name: 'PUT /api/settings', run: () => settingsPUT(req()) },
  { name: 'PUT /api/testimonials', run: () => testimonialsPUT(req()) },
  { name: 'DELETE /api/testimonials', run: () => testimonialsDELETE(req()) },
  { name: 'PUT /api/books/[id]', run: () => bookByIdPUT(req(), CTX) },
  { name: 'DELETE /api/books/[id]', run: () => bookByIdDELETE(req(), CTX) },
  { name: 'PUT /api/categories/[id]', run: () => categoryByIdPUT(req(), CTX) },
  { name: 'DELETE /api/categories/[id]', run: () => categoryByIdDELETE(req(), CTX) },
  { name: 'PUT /api/faqs/[id]', run: () => faqByIdPUT(req(), CTX) },
  { name: 'DELETE /api/faqs/[id]', run: () => faqByIdDELETE(req(), CTX) },
  { name: 'PUT /api/loans/[id]', run: () => loanByIdPUT(req(), CTX) },
  { name: 'DELETE /api/loans/[id]', run: () => loanByIdDELETE(req(), CTX) },
  { name: 'POST /api/loans/[id]/return', run: () => loanReturnPOST(req(), CTX) },
  { name: 'PUT /api/menus/[id]', run: () => menuByIdPUT(req(), CTX) },
  { name: 'DELETE /api/menus/[id]', run: () => menuByIdDELETE(req(), CTX) },
  { name: 'PUT /api/pages/[id]', run: () => pageByIdPUT(req(), CTX) },
  { name: 'DELETE /api/pages/[id]', run: () => pageByIdDELETE(req(), CTX) },
  { name: 'PUT /api/racks/[id]', run: () => rackByIdPUT(req(), CTX) },
  { name: 'DELETE /api/racks/[id]', run: () => rackByIdDELETE(req(), CTX) },
  { name: 'PUT /api/services/[id]', run: () => serviceByIdPUT(req(), SVC_CTX) },
  { name: 'DELETE /api/services/[id]', run: () => serviceByIdDELETE(req(), SVC_CTX) },
  { name: 'PUT /api/testimonials/[id]', run: () => testimonialByIdPUT(req(), CTX) },
  { name: 'DELETE /api/testimonials/[id]', run: () => testimonialByIdDELETE(req(), CTX) },
];

const staffOnlyVariants: Case[] = [
  {
    name: 'GET /api/categories?all=1',
    run: () => categoriesGET(req('http://localhost/api/categories?all=1')),
  },
  { name: 'GET /api/faqs?all=1', run: () => faqsGET(req('http://localhost/api/faqs?all=1')) },
  { name: 'GET /api/menus?all=1', run: () => menusGET(req('http://localhost/api/menus?all=1')) },
  { name: 'GET /api/pages?all=1', run: () => pagesGET(req('http://localhost/api/pages?all=1')) },
  { name: 'GET /api/racks?all=1', run: () => racksGET(req('http://localhost/api/racks?all=1')) },
  {
    name: 'GET /api/testimonials?all=1',
    run: () => testimonialsGET(req('http://localhost/api/testimonials?all=1')),
  },
];

function routeFiles(): string[] {
  const root = join(process.cwd(), 'src/app/api');
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === 'route.ts') out.push(p);
    }
  };
  walk(root);
  return out;
}

// Handler dengan requireStaff TANPA syarat (baris guard tidak di dalam if /
// bukan maybeStaff) — inilah definisi "admin-only endpoint" hari ini.
function scanAdminOnlyHandlers(): string[] {
  const found: string[] = [];
  for (const file of routeFiles()) {
    const src = readFileSync(file, 'utf8');
    const route =
      '/api' +
      file
        .replace(/\\/g, '/')
        .split('/src/app/api')[1]!
        .replace(/\/route\.ts$/, '');
    const re = /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/g;
    const marks: Array<{ method: string; start: number }> = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) marks.push({ method: m[1]!, start: m.index });
    for (let i = 0; i < marks.length; i++) {
      const region = src.slice(
        marks[i]!.start,
        i + 1 < marks.length ? marks[i + 1]!.start : src.length
      );
      const lines = region.split('\n');
      let unconditional = false;
      for (let l = 0; l < lines.length; l++) {
        const line = lines[l] ?? '';
        if (!/await\s+requireStaff\s*\(/.test(line)) continue;
        const maybe = /\b\w*[Mm]aybe\w*\b/.test(line);
        const inIf = [lines[l - 1] ?? '', lines[l - 2] ?? ''].some((p) => /^\s*if\s*\(/.test(p));
        if (!maybe && !inIf) unconditional = true;
      }
      if (unconditional) found.push(`${marks[i]!.method} ${route}`);
    }
  }
  return found.sort();
}

describe('issue #25 — unified staff authorization (Gherkin: non-staff → 403 everywhere)', () => {
  it('matrix covers exactly the 59 admin-only handlers found in src/app/api', () => {
    const scanned = scanAdminOnlyHandlers();
    const covered = adminOnly.map((c) => c.name).sort();
    // Wave2: +5 handler services (POST/PUT/DELETE koleksi + PUT/DELETE [id]);
    // GET koleksi/[id] publik-dengan-elevasi, benar tak masuk matrix.
    expect(covered.length, 'matrix must declare 59 admin-only endpoint+method pairs').toBe(59);
    expect(covered, 'matrix missing admin-only handlers present in src/app/api').toEqual(scanned);
  });

  for (const c of adminOnly) {
    it(`${c.name} → 403 FORBIDDEN for signed-in non-staff`, async () => {
      setSession({ id: 'U-MEMBER' }, 'member');
      const res = await c.run();
      expect(res.status).toBe(403);
      const j = (await res.json()) as { error: { code: string; message: string } };
      expect(j.error.code).toBe('FORBIDDEN');
      expect(j.error.message, '403 must come from the shared requireStaff() guard').toBe(
        'Butuh peran admin/librarian.'
      );
    });
  }

  for (const c of adminOnly) {
    it(`${c.name} → 401 UNAUTHORIZED for anonymous (existing behavior preserved)`, async () => {
      setSession(null, null);
      const res = await c.run();
      expect(res.status).toBe(401);
      const j = (await res.json()) as { error: { code: string } };
      expect(j.error.code).toBe('UNAUTHORIZED');
    });
  }

  for (const c of staffOnlyVariants) {
    it(`${c.name} (staff-only variant) → 403 FORBIDDEN for signed-in non-staff`, async () => {
      setSession({ id: 'U-MEMBER' }, 'member');
      const res = await c.run();
      expect(res.status).toBe(403);
      const j = (await res.json()) as { error: { code: string } };
      expect(j.error.code).toBe('FORBIDDEN');
    });
  }

  it('profil hilang → 403 (fail-closed, bukan fail-open)', async () => {
    setSession({ id: 'U-NO-PROFILE' }, null);
    const res = await bannersGET(req());
    expect(res.status).toBe(403);
  });

  it('staff (librarian/admin) tetap lolos — policy tidak menyempit', async () => {
    setSession({ id: 'U-LIB' }, 'librarian');
    const res = await categoriesGET(req('http://localhost/api/categories?all=1'));
    expect(res.status, 'librarian must still pass the staff-only variant').not.toBe(403);
    expect(res.status).not.toBe(401);
  });
});
