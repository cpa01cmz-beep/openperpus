import { describe, expect, it, beforeEach, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase),
}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

import {
  resetMockDb,
  installMockSupabase,
  setTable,
  setAuthUser,
  setProfileRole,
  setSignUpResult,
  setThrowFrom,
  req,
  jsonReq,
  badJsonReq,
  errCode,
} from './helpers/supabase-mock';

import {
  GET as CAT_GET,
  POST as CAT_POST,
  PUT as CAT_PUT,
  DELETE as CAT_DEL,
} from '@/app/api/categories/route';
import {
  GET as RACK_GET,
  POST as RACK_POST,
  PUT as RACK_PUT,
  DELETE as RACK_DEL,
} from '@/app/api/racks/route';
import {
  GET as MENU_GET,
  POST as MENU_POST,
  PUT as MENU_PUT,
  DELETE as MENU_DEL,
} from '@/app/api/menus/route';
import {
  GET as PAGE_GET,
  POST as PAGE_POST,
  PUT as PAGE_PUT,
  DELETE as PAGE_DEL,
} from '@/app/api/pages/route';
import {
  GET as FAQ_GET,
  POST as FAQ_POST,
  PUT as FAQ_PUT,
  DELETE as FAQ_DEL,
} from '@/app/api/faqs/route';
import {
  GET as BAN_GET,
  POST as BAN_POST,
  PUT as BAN_PUT,
  DELETE as BAN_DEL,
} from '@/app/api/banners/route';
import {
  GET as ART_GET,
  POST as ART_POST,
  PUT as ART_PUT,
  DELETE as ART_DEL,
} from '@/app/api/articles/route';
import {
  GET as MEM_GET,
  POST as MEM_POST,
  PUT as MEM_PUT,
  DELETE as MEM_DEL,
} from '@/app/api/members/route';
import {
  GET as TST_GET,
  POST as TST_POST,
  PUT as TST_PUT,
  resetTestimonialRateLimit,
} from '@/app/api/testimonials/route';
import { GET as SET_GET, PUT as SET_PUT } from '@/app/api/settings/route';
import { POST as REG_POST } from '@/app/api/register/route';
import { GET as HEALTH_GET } from '@/app/api/health/route';
import { GET as READYZ_GET } from '@/app/api/readyz/route';
import { GET as METRICS_GET } from '@/app/api/metrics/route';
import { GET as DOCS_GET } from '@/app/api/docs/route';

beforeEach(() => {
  resetMockDb();
  installMockSupabase();
  resetTestimonialRateLimit();
});

describe('GET /api/categories', () => {
  it('list 200 with meta+pagination', async () => {
    setTable('categories', { list: { data: [{ id: 'c1', name: 'Fiksi' }], count: 1 } });
    const res = await CAT_GET(req('/api/categories'));
    expect(res.status).toBe(200);
    const j = (await res.json()) as {
      data: unknown[];
      meta: { total: number };
      pagination: { totalPages: number };
    };
    expect(j.data).toHaveLength(1);
    expect(j.meta.total).toBe(1);
    expect(j.pagination.totalPages).toBe(1);
  });

  it('fetch error -> 500 FETCH_FAILED', async () => {
    setTable('categories', { list: { data: null, error: { message: 'boom' } } });
    const res = await CAT_GET(req('/api/categories'));
    expect(res.status).toBe(500);
    expect(await errCode(res)).toBe('FETCH_FAILED');
  });

  it('?all=1 without session -> 401', async () => {
    setAuthUser(null);
    const res = await CAT_GET(req('/api/categories?all=1'));
    expect(res.status).toBe(401);
  });

  it('?q= runs ilike filter', async () => {
    const res = await CAT_GET(req('/api/categories?q=Fiksi%20%_[]\\'));
    expect(res.status).toBe(200);
  });
});

describe('POST/PUT/DELETE /api/categories', () => {
  it('invalid json -> 400', async () => {
    const res = await CAT_POST(badJsonReq('POST', '/api/categories'));
    expect(res.status).toBe(400);
    expect(await errCode(res)).toBe('INVALID_JSON');
  });

  it('missing name -> 422', async () => {
    const res = await CAT_POST(jsonReq('POST', '/api/categories', {}));
    expect(res.status).toBe(422);
  });

  it('name too long -> 422', async () => {
    const res = await CAT_POST(jsonReq('POST', '/api/categories', { name: 'x'.repeat(201) }));
    expect(res.status).toBe(422);
  });

  it('non-integer sort_order -> 422', async () => {
    const res = await CAT_POST(
      jsonReq('POST', '/api/categories', { name: 'Fiksi', sort_order: 1.5 })
    );
    expect(res.status).toBe(422);
  });

  it('create 201', async () => {
    const res = await CAT_POST(
      jsonReq('POST', '/api/categories', { name: 'Fiksi', deskripsi: 'Cerita' })
    );
    expect(res.status).toBe(201);
    const j = (await res.json()) as { data: { slug: string } };
    expect(j.data.id).toBeDefined();
  });

  it('unique violation -> 409', async () => {
    setTable('categories', { insert: { data: null, error: { message: 'dup', code: '23505' } } });
    const res = await CAT_POST(jsonReq('POST', '/api/categories', { name: 'Fiksi' }));
    expect(res.status).toBe(409);
    expect(await errCode(res)).toBe('CONFLICT');
  });

  it('insert failure -> 500', async () => {
    setTable('categories', { insert: { data: null, error: { message: 'db' } } });
    const res = await CAT_POST(jsonReq('POST', '/api/categories', { name: 'Fiksi' }));
    expect(res.status).toBe(500);
    expect(await errCode(res)).toBe('SAVE_FAILED');
  });

  it('PUT without id -> 400', async () => {
    const res = await CAT_PUT(jsonReq('PUT', '/api/categories', { name: 'X' }));
    expect(res.status).toBe(400);
  });

  it('PUT invalid json -> 400', async () => {
    const res = await CAT_PUT(badJsonReq('PUT', '/api/categories?id=c1'));
    expect(res.status).toBe(400);
  });

  it('PUT empty name -> 422', async () => {
    const res = await CAT_PUT(jsonReq('PUT', '/api/categories?id=c1', { name: '   ' }));
    expect(res.status).toBe(422);
  });

  it('PUT success 200', async () => {
    const res = await CAT_PUT(
      jsonReq('PUT', '/api/categories?id=c1', { nama: 'Sastra', is_active: false, sort_order: '2' })
    );
    expect(res.status).toBe(200);
  });

  it('PUT conflict -> 409', async () => {
    setTable('categories', { update: { data: null, error: { message: 'dup', code: '23505' } } });
    const res = await CAT_PUT(jsonReq('PUT', '/api/categories?id=c1', { name: 'Sastra' }));
    expect(res.status).toBe(409);
  });

  it('DELETE without id -> 400', async () => {
    const res = await CAT_DEL(req('/api/categories', { method: 'DELETE' }));
    expect(res.status).toBe(400);
  });

  it('DELETE in use -> 409', async () => {
    setTable('books', { count: 3 });
    const res = await CAT_DEL(req('/api/categories?id=c1', { method: 'DELETE' }));
    expect(res.status).toBe(409);
  });

  it('DELETE success -> 200', async () => {
    const res = await CAT_DEL(req('/api/categories?id=c1', { method: 'DELETE' }));
    expect(res.status).toBe(200);
    const j = (await res.json()) as { message: string };
    expect(j.message).toContain('dihapus');
  });

  it('DELETE failure -> 500', async () => {
    setTable('categories', { delete: { data: null, error: { message: 'db' } } });
    const res = await CAT_DEL(req('/api/categories?id=c1', { method: 'DELETE' }));
    expect(res.status).toBe(500);
    expect(await errCode(res)).toBe('DELETE_FAILED');
  });
});

describe('/api/racks', () => {
  it('GET list 200', async () => {
    setTable('racks', { list: { data: [{ id: 'r1', code: 'A1' }], count: 1 } });
    const res = await RACK_GET(req('/api/racks'));
    expect(res.status).toBe(200);
  });

  it('GET error -> 500', async () => {
    setTable('racks', { list: { data: null, error: { message: 'x' } } });
    expect((await RACK_GET(req('/api/racks'))).status).toBe(500);
  });

  it('GET ?all=1 unauth -> 401', async () => {
    setAuthUser(null);
    expect((await RACK_GET(req('/api/racks?all=1'))).status).toBe(401);
  });

  it('POST invalid json -> 400', async () => {
    expect((await RACK_POST(badJsonReq('POST', '/api/racks'))).status).toBe(400);
  });

  it('POST missing code -> 422', async () => {
    expect((await RACK_POST(jsonReq('POST', '/api/racks', { name: 'Rak' }))).status).toBe(422);
  });

  it('POST missing name -> 422', async () => {
    expect((await RACK_POST(jsonReq('POST', '/api/racks', { code: 'A1' }))).status).toBe(422);
  });

  it('POST code too long -> 422', async () => {
    const res = await RACK_POST(
      jsonReq('POST', '/api/racks', { code: 'x'.repeat(51), name: 'Rak' })
    );
    expect(res.status).toBe(422);
  });

  it('POST bad capacity -> 422', async () => {
    const res = await RACK_POST(
      jsonReq('POST', '/api/racks', { code: 'A1', name: 'Rak', capacity: -1 })
    );
    expect(res.status).toBe(422);
  });

  it('POST 201', async () => {
    const res = await RACK_POST(
      jsonReq('POST', '/api/racks', { code: 'A1', name: 'Rak A', lantai: 'Lt 1' })
    );
    expect(res.status).toBe(201);
  });

  it('POST conflict -> 409', async () => {
    setTable('racks', { insert: { data: null, error: { message: 'dup', code: '23505' } } });
    expect(
      (await RACK_POST(jsonReq('POST', '/api/racks', { code: 'A1', name: 'Rak' }))).status
    ).toBe(409);
  });

  it('PUT without id -> 400 / invalid json -> 400', async () => {
    expect((await RACK_PUT(jsonReq('PUT', '/api/racks', { name: 'X' }))).status).toBe(400);
    expect((await RACK_PUT(badJsonReq('PUT', '/api/racks?id=r1'))).status).toBe(400);
  });

  it('PUT empty code -> 422', async () => {
    const res = await RACK_PUT(jsonReq('PUT', '/api/racks?id=r1', { code: ' ' }));
    expect(res.status).toBe(422);
  });

  it('PUT success 200', async () => {
    const res = await RACK_PUT(
      jsonReq('PUT', '/api/racks?id=r1', { name: 'Rak B', capacity: '10', location: null })
    );
    expect(res.status).toBe(200);
  });

  it('PUT conflict -> 409', async () => {
    setTable('racks', { update: { data: null, error: { message: 'dup', code: '23505' } } });
    expect((await RACK_PUT(jsonReq('PUT', '/api/racks?id=r1', { name: 'B' }))).status).toBe(409);
  });

  it('DELETE without id -> 400; in use -> 409; success -> 200; failure -> 500', async () => {
    expect((await RACK_DEL(req('/api/racks', { method: 'DELETE' }))).status).toBe(400);
    setTable('books', { count: 2 });
    expect((await RACK_DEL(req('/api/racks?id=r1', { method: 'DELETE' }))).status).toBe(409);
    setTable('books', { count: 0 });
    expect((await RACK_DEL(req('/api/racks?id=r1', { method: 'DELETE' }))).status).toBe(200);
    setTable('racks', { delete: { data: null, error: { message: 'db' } } });
    expect((await RACK_DEL(req('/api/racks?id=r1', { method: 'DELETE' }))).status).toBe(500);
  });
});

describe('/api/menus', () => {
  it('GET list 200', async () => {
    setTable('menus', { list: { data: [{ id: 'm1', label: 'Beranda' }], count: 1 } });
    expect((await MENU_GET(req('/api/menus'))).status).toBe(200);
  });

  it('GET ?id= found 200', async () => {
    setTable('menus', { single: { data: { id: 'm1', is_active: true } } });
    const res = await MENU_GET(req('/api/menus?id=m1'));
    expect(res.status).toBe(200);
  });

  it('GET ?id= missing -> 404; inactive anon -> 404', async () => {
    setTable('menus', { single: { data: null, error: { message: 'nf' } } });
    expect((await MENU_GET(req('/api/menus?id=zzz'))).status).toBe(404);
    setTable('menus', { single: { data: { id: 'm1', is_active: false } } });
    setAuthUser(null);
    expect((await MENU_GET(req('/api/menus?id=m1'))).status).toBe(404);
  });

  it('GET bad position -> 422; ok with position filter', async () => {
    expect((await MENU_GET(req('/api/menus?position=bogus'))).status).toBe(422);
    expect((await MENU_GET(req('/api/menus?position=header'))).status).toBe(200);
  });

  it('GET error -> 500; ?all=1 unauth -> 401', async () => {
    setTable('menus', { list: { data: null, error: { message: 'x' } } });
    expect((await MENU_GET(req('/api/menus'))).status).toBe(500);
    setAuthUser(null);
    expect((await MENU_GET(req('/api/menus?all=1'))).status).toBe(401);
  });

  it('POST invalid json / missing label / missing url / bad position / bad target / bad sort / bad parent', async () => {
    expect((await MENU_POST(badJsonReq('POST', '/api/menus'))).status).toBe(400);
    expect((await MENU_POST(jsonReq('POST', '/api/menus', { url: '/' }))).status).toBe(422);
    expect((await MENU_POST(jsonReq('POST', '/api/menus', { label: 'X' }))).status).toBe(422);
    expect(
      (await MENU_POST(jsonReq('POST', '/api/menus', { label: 'X', url: '/', position: 'top' })))
        .status
    ).toBe(422);
    expect(
      (await MENU_POST(jsonReq('POST', '/api/menus', { label: 'X', url: '/', target: '_blank?' })))
        .status
    ).toBe(422);
    expect(
      (await MENU_POST(jsonReq('POST', '/api/menus', { label: 'X', url: '/', sort_order: 'abc' })))
        .status
    ).toBe(422);
    expect(
      (
        await MENU_POST(
          jsonReq('POST', '/api/menus', { label: 'X', url: '/', parent_id: 'not-uuid' })
        )
      ).status
    ).toBe(422);
  });

  it('POST 201', async () => {
    const res = await MENU_POST(
      jsonReq('POST', '/api/menus', {
        label: 'Beranda',
        url: '/',
        position: 'header',
        target: '_blank',
        urutan: '1',
      })
    );
    expect(res.status).toBe(201);
  });

  it('POST save failure -> 500', async () => {
    setTable('menus', { insert: { data: null, error: { message: 'db' } } });
    expect((await MENU_POST(jsonReq('POST', '/api/menus', { label: 'B', url: '/' }))).status).toBe(
      500
    );
  });

  it('PUT guard ids/json/validation/success', async () => {
    expect((await MENU_PUT(jsonReq('PUT', '/api/menus', { label: 'X' }))).status).toBe(400);
    expect((await MENU_PUT(badJsonReq('PUT', '/api/menus?id=m1'))).status).toBe(400);
    expect((await MENU_PUT(jsonReq('PUT', '/api/menus?id=m1', { label: ' ' }))).status).toBe(422);
    expect((await MENU_PUT(jsonReq('PUT', '/api/menus?id=m1', { url: '' }))).status).toBe(422);
    expect((await MENU_PUT(jsonReq('PUT', '/api/menus?id=m1', { position: 'nope' }))).status).toBe(
      422
    );
    expect((await MENU_PUT(jsonReq('PUT', '/api/menus?id=m1', { target: '_self2' }))).status).toBe(
      422
    );
    expect((await MENU_PUT(jsonReq('PUT', '/api/menus?id=m1', { parent_id: 'bad' }))).status).toBe(
      422
    );
    expect((await MENU_PUT(jsonReq('PUT', '/api/menus?id=m1', { parent_id: 'm1' }))).status).toBe(
      422
    );
    const ok = await MENU_PUT(
      jsonReq('PUT', '/api/menus?id=m1', { label: 'Beranda Baru', sort_order: '2' })
    );
    expect(ok.status).toBe(200);
    setTable('menus', { update: { data: null, error: { message: 'db' } } });
    const failed = await MENU_PUT(jsonReq('PUT', '/api/menus?id=m1', { label: 'X' }));
    expect(failed.status).toBe(500);
    expect(await errCode(failed)).toBe('SAVE_FAILED');
    setTable('menus', { update: { data: null, error: { message: 'db' } } });
    expect((await MENU_PUT(jsonReq('PUT', '/api/menus?id=m1', { label: 'X' }))).status).toBe(500);
  });

  it('DELETE without id / has children / success / failure', async () => {
    expect((await MENU_DEL(req('/api/menus', { method: 'DELETE' }))).status).toBe(400);
    setTable('menus', { count: 2 });
    expect((await MENU_DEL(req('/api/menus?id=m1', { method: 'DELETE' }))).status).toBe(409);
    setTable('menus', { count: 0 });
    expect((await MENU_DEL(req('/api/menus?id=m1', { method: 'DELETE' }))).status).toBe(200);
    setTable('menus', { delete: { data: null, error: { message: 'db' } } });
    expect((await MENU_DEL(req('/api/menus?id=m1', { method: 'DELETE' }))).status).toBe(500);
  });
});

describe('/api/pages', () => {
  it('GET list/id/inactive/search/error/all', async () => {
    setTable('pages', { list: { data: [{ id: 'p1', title: 'Tentang' }], count: 1 } });
    expect((await PAGE_GET(req('/api/pages'))).status).toBe(200);
    setTable('pages', { single: { data: { id: 'p1', is_active: true } } });
    expect((await PAGE_GET(req('/api/pages?id=p1'))).status).toBe(200);
    setTable('pages', { single: { data: null, error: { message: 'nf' } } });
    expect((await PAGE_GET(req('/api/pages?id=zz'))).status).toBe(404);
    setTable('pages', { single: { data: { id: 'p1', is_active: false } } });
    setAuthUser(null);
    expect((await PAGE_GET(req('/api/pages?id=p1'))).status).toBe(404);
    setTable('pages', { list: { data: null, error: { message: 'x' } } });
    expect((await PAGE_GET(req('/api/pages'))).status).toBe(500);
    setAuthUser(null);
    expect((await PAGE_GET(req('/api/pages?all=1'))).status).toBe(401);
  });

  it('POST validation and success', async () => {
    expect((await PAGE_POST(badJsonReq('POST', '/api/pages'))).status).toBe(400);
    expect((await PAGE_POST(jsonReq('POST', '/api/pages', { content_md: 'isi' }))).status).toBe(
      422
    );
    expect((await PAGE_POST(jsonReq('POST', '/api/pages', { title: 'Judul' }))).status).toBe(422);
    const ok = await PAGE_POST(
      jsonReq('POST', '/api/pages', {
        title: 'Judul',
        konten: 'Isi halaman',
        tampil_di_menu: 'ya',
        slug: 'Judul Halaman!',
      })
    );
    expect(ok.status).toBe(201);
    setTable('pages', { insert: { data: null, error: { message: 'dup', code: '23505' } } });
    expect(
      (await PAGE_POST(jsonReq('POST', '/api/pages', { title: 'J', content_md: 'I' }))).status
    ).toBe(409);
    setTable('pages', { insert: { data: null, error: { message: 'db' } } });
    expect(
      (await PAGE_POST(jsonReq('POST', '/api/pages', { title: 'J', content_md: 'I' }))).status
    ).toBe(500);
  });

  it('PUT guards and success', async () => {
    expect((await PAGE_PUT(jsonReq('PUT', '/api/pages', { title: 'X' }))).status).toBe(400);
    expect((await PAGE_PUT(badJsonReq('PUT', '/api/pages?id=p1'))).status).toBe(400);
    expect((await PAGE_PUT(jsonReq('PUT', '/api/pages?id=p1', { title: ' ' }))).status).toBe(422);
    expect((await PAGE_PUT(jsonReq('PUT', '/api/pages?id=p1', { content_md: '' }))).status).toBe(
      422
    );
    expect((await PAGE_PUT(jsonReq('PUT', '/api/pages?id=p1', {}))).status).toBe(422);
    const ok = await PAGE_PUT(
      jsonReq('PUT', '/api/pages?id=p1', { judul: 'Baru', seo_title: 'SEO' })
    );
    expect(ok.status).toBe(200);
    setTable('pages', { update: { data: null, error: { message: 'dup', code: '23505' } } });
    expect((await PAGE_PUT(jsonReq('PUT', '/api/pages?id=p1', { title: 'X' }))).status).toBe(409);
  });

  it('DELETE id/success/failure', async () => {
    expect((await PAGE_DEL(req('/api/pages', { method: 'DELETE' }))).status).toBe(400);
    setTable('pages', { single: { data: { id: 'p1', slug: 'baru' } } });
    expect((await PAGE_DEL(req('/api/pages?id=p1', { method: 'DELETE' }))).status).toBe(200);
    setTable('pages', { delete: { data: null, error: { message: 'db' } } });
    expect((await PAGE_DEL(req('/api/pages?id=p1', { method: 'DELETE' }))).status).toBe(500);
  });
});

describe('/api/faqs', () => {
  it('GET list/id/search/category/error', async () => {
    setTable('faqs', { list: { data: [{ id: 'f1', question: 'Q?' }], count: 1 } });
    expect((await FAQ_GET(req('/api/faqs'))).status).toBe(200);
    expect((await FAQ_GET(req('/api/faqs?category=Umum'))).status).toBe(200);
    setTable('faqs', { single: { data: { id: 'f1', is_active: true } } });
    expect((await FAQ_GET(req('/api/faqs?id=f1'))).status).toBe(200);
    setTable('faqs', { single: { data: null, error: { message: 'nf' } } });
    expect((await FAQ_GET(req('/api/faqs?id=zz'))).status).toBe(404);
    setTable('faqs', { single: { data: { id: 'f1', is_active: false } } });
    setAuthUser(null);
    expect((await FAQ_GET(req('/api/faqs?id=f1'))).status).toBe(404);
    setTable('faqs', { list: { data: null, error: { message: 'x' } } });
    expect((await FAQ_GET(req('/api/faqs'))).status).toBe(500);
  });

  it('POST validation/success/failure', async () => {
    expect((await FAQ_POST(badJsonReq('POST', '/api/faqs'))).status).toBe(400);
    expect((await FAQ_POST(jsonReq('POST', '/api/faqs', { answer: 'A' }))).status).toBe(422);
    expect((await FAQ_POST(jsonReq('POST', '/api/faqs', { question: 'Q?' }))).status).toBe(422);
    expect(
      (await FAQ_POST(jsonReq('POST', '/api/faqs', { question: 'Q?', answer: 'A', urutan: 'x' })))
        .status
    ).toBe(422);
    const ok = await FAQ_POST(
      jsonReq('POST', '/api/faqs', { question: 'Q?', answer: 'A', kategori: 'Umum', urutan: '1' })
    );
    expect(ok.status).toBe(201);
    setTable('faqs', { insert: { data: null, error: { message: 'db' } } });
    expect(
      (await FAQ_POST(jsonReq('POST', '/api/faqs', { question: 'Q', answer: 'A' }))).status
    ).toBe(500);
  });

  it('PUT guards/success', async () => {
    expect((await FAQ_PUT(jsonReq('PUT', '/api/faqs', { question: 'Q' }))).status).toBe(400);
    expect((await FAQ_PUT(badJsonReq('PUT', '/api/faqs?id=f1'))).status).toBe(400);
    expect((await FAQ_PUT(jsonReq('PUT', '/api/faqs?id=f1', { question: ' ' }))).status).toBe(422);
    expect((await FAQ_PUT(jsonReq('PUT', '/api/faqs?id=f1', { answer: '' }))).status).toBe(422);
    expect((await FAQ_PUT(jsonReq('PUT', '/api/faqs?id=f1', {}))).status).toBe(422);
    const ok = await FAQ_PUT(
      jsonReq('PUT', '/api/faqs?id=f1', { pertanyaan: 'Q baru', urutan: '3' })
    );
    expect(ok.status).toBe(200);
    setTable('faqs', { update: { data: null, error: { message: 'db' } } });
    const failed = await FAQ_PUT(jsonReq('PUT', '/api/faqs?id=f1', { question: 'Q' }));
    expect(failed.status).toBe(500);
    expect(await errCode(failed)).toBe('SAVE_FAILED');
  });

  it('DELETE success/failure', async () => {
    expect((await FAQ_DEL(req('/api/faqs', { method: 'DELETE' }))).status).toBe(400);
    expect((await FAQ_DEL(req('/api/faqs?id=f1', { method: 'DELETE' }))).status).toBe(200);
    setTable('faqs', { delete: { data: null, error: { message: 'db' } } });
    expect((await FAQ_DEL(req('/api/faqs?id=f1', { method: 'DELETE' }))).status).toBe(500);
  });
});

describe('/api/banners', () => {
  it('GET staff guard + list + sort params + error', async () => {
    setTable('banners', { list: { data: [{ id: 'b1', title: 'Promo' }], count: 1 } });
    expect((await BAN_GET(req('/api/banners'))).status).toBe(200);
    expect((await BAN_GET(req('/api/banners?sort=title&order=desc'))).status).toBe(200);
    expect((await BAN_GET(req('/api/banners?sort=bogus&order=up'))).status).toBe(200);
    setAuthUser(null);
    expect((await BAN_GET(req('/api/banners'))).status).toBe(401);
    setAuthUser({ id: 'user-1' });
    setTable('banners', { list: { data: null, error: { message: 'x' } } });
    expect((await BAN_GET(req('/api/banners'))).status).toBe(500);
  });

  it('POST invalid/missing/title+image/success/save-fail', async () => {
    expect((await BAN_POST(badJsonReq('POST', '/api/banners'))).status).toBe(400);
    expect((await BAN_POST(jsonReq('POST', '/api/banners', { image_url: '/x.png' }))).status).toBe(
      422
    );
    expect((await BAN_POST(jsonReq('POST', '/api/banners', { title: 'Promo' }))).status).toBe(422);
    const ok = await BAN_POST(
      jsonReq('POST', '/api/banners', {
        judul: 'Promo',
        gambar_url: 'https://x.supabase.co/a.png',
        subjudul: 'Sub',
        link_url: '/katalog',
        urutan: '1',
      })
    );
    expect(ok.status).toBe(201);
    setTable('banners', { insert: { data: null, error: { message: 'db' } } });
    expect(
      (await BAN_POST(jsonReq('POST', '/api/banners', { title: 'P', image_url: '/x.png' }))).status
    ).toBe(500);
  });

  it('PUT id/json/success', async () => {
    expect((await BAN_PUT(jsonReq('PUT', '/api/banners', { title: 'X' }))).status).toBe(400);
    expect((await BAN_PUT(badJsonReq('PUT', '/api/banners?id=b1'))).status).toBe(400);
    const ok = await BAN_PUT(
      jsonReq('PUT', '/api/banners?id=b1', {
        title: 'Promo2',
        subtitle: 'S2',
        link: '/faq',
        sort_order: '2',
      })
    );
    expect(ok.status).toBe(200);
  });

  it('DELETE id/success/failure', async () => {
    expect((await BAN_DEL(req('/api/banners', { method: 'DELETE' }))).status).toBe(400);
    expect((await BAN_DEL(req('/api/banners?id=b1', { method: 'DELETE' }))).status).toBe(200);
    setTable('banners', { delete: { data: null, error: { message: 'db' } } });
    expect((await BAN_DEL(req('/api/banners?id=b1', { method: 'DELETE' }))).status).toBe(500);
  });
});

describe('/api/articles', () => {
  it('GET guard/list/q/status/error', async () => {
    setTable('articles', { list: { data: [{ id: 'a1', title: 'Berita' }], count: 1 } });
    expect((await ART_GET(req('/api/articles'))).status).toBe(200);
    expect((await ART_GET(req('/api/articles?q=berita&status=published'))).status).toBe(200);
    setAuthUser(null);
    expect((await ART_GET(req('/api/articles'))).status).toBe(401);
    setAuthUser({ id: 'user-1' });
    setTable('articles', { list: { data: null, error: { message: 'x' } } });
    expect((await ART_GET(req('/api/articles'))).status).toBe(500);
  });

  it('POST validation/status/slug conflict/success/save-fail', async () => {
    expect((await ART_POST(badJsonReq('POST', '/api/articles'))).status).toBe(400);
    expect((await ART_POST(jsonReq('POST', '/api/articles', { content_md: 'isi' }))).status).toBe(
      422
    );
    expect((await ART_POST(jsonReq('POST', '/api/articles', { title: 'Judul' }))).status).toBe(422);
    expect(
      (
        await ART_POST(
          jsonReq('POST', '/api/articles', { title: 'J', content_md: 'I', status: 'live' })
        )
      ).status
    ).toBe(422);
    const ok = await ART_POST(
      jsonReq('POST', '/api/articles', {
        title: 'Berita Panas',
        konten: 'Isi lengkap',
        status: 'published',
        slug: 'Berita Panas',
        category: 'Umum',
      })
    );
    expect(ok.status).toBe(201);
    setTable('articles', { insert: { data: null, error: { message: 'dup', code: '23505' } } });
    expect(
      (await ART_POST(jsonReq('POST', '/api/articles', { title: 'J', content_md: 'I' }))).status
    ).toBe(409);
    setTable('articles', { insert: { data: null, error: { message: 'db' } } });
    expect(
      (await ART_POST(jsonReq('POST', '/api/articles', { title: 'J', content_md: 'I' }))).status
    ).toBe(500);
  });

  it('PUT guards/success', async () => {
    expect((await ART_PUT(jsonReq('PUT', '/api/articles', { title: 'X' }))).status).toBe(400);
    expect((await ART_PUT(badJsonReq('PUT', '/api/articles?id=a1'))).status).toBe(400);
    const ok = await ART_PUT(
      jsonReq('PUT', '/api/articles?id=a1', {
        title: 'Berita Edit',
        excerpt: 'Ringkas',
        status: 'draft',
      })
    );
    expect(ok.status).toBe(200);
    setTable('articles', { update: { data: null, error: { message: 'db' } } });
    const failed = await ART_PUT(jsonReq('PUT', '/api/articles?id=a1', { title: 'X' }));
    expect(failed.status).toBe(500);
    expect(await errCode(failed)).toBe('SAVE_FAILED');
  });

  it('DELETE id/success/failure', async () => {
    expect((await ART_DEL(req('/api/articles', { method: 'DELETE' }))).status).toBe(400);
    expect((await ART_DEL(req('/api/articles?id=a1', { method: 'DELETE' }))).status).toBe(200);
    setTable('articles', { delete: { data: null, error: { message: 'db' } } });
    expect((await ART_DEL(req('/api/articles?id=a1', { method: 'DELETE' }))).status).toBe(500);
  });
});

describe('/api/members', () => {
  it('GET guard/list/status/q/error', async () => {
    setTable('members', { list: { data: [{ id: 'm1', member_code: 'AG-1' }], count: 1 } });
    expect((await MEM_GET(req('/api/members'))).status).toBe(200);
    expect((await MEM_GET(req('/api/members?status=active&q=AG'))).status).toBe(200);
    setAuthUser(null);
    expect((await MEM_GET(req('/api/members'))).status).toBe(401);
    setAuthUser({ id: 'user-1' });
    setTable('members', { list: { data: null, error: { message: 'x' } } });
    expect((await MEM_GET(req('/api/members'))).status).toBe(500);
  });

  it('POST validation/profile-missing/conflict/success', async () => {
    expect((await MEM_POST(badJsonReq('POST', '/api/members'))).status).toBe(400);
    expect((await MEM_POST(jsonReq('POST', '/api/members', {}))).status).toBe(422);
    expect(
      (await MEM_POST(jsonReq('POST', '/api/members', { user_id: 'u', status: 'active' }))).status
    ).toBe(422);
    expect(
      (
        await MEM_POST(
          jsonReq('POST', '/api/members', {
            user_id: '11111111-1111-4111-8111-111111111111',
            status: 'banned',
          })
        )
      ).status
    ).toBe(422);
    setTable('profiles', { single: { data: null, error: { message: 'nf' } } });
    expect(
      (
        await MEM_POST(
          jsonReq('POST', '/api/members', { user_id: '11111111-1111-4111-8111-111111111111' })
        )
      ).status
    ).toBe(404);
    setTable('profiles', { single: { data: { id: '11111111-1111-4111-8111-111111111111' } } });
    const ok = await MEM_POST(
      jsonReq('POST', '/api/members', {
        user_id: '11111111-1111-4111-8111-111111111111',
        member_code: 'AG-99',
        phone: '0812',
        status: 'pending',
      })
    );
    expect(ok.status).toBe(201);
    setTable('members', { insert: { data: null, error: { message: 'dup', code: '23505' } } });
    expect(
      (
        await MEM_POST(
          jsonReq('POST', '/api/members', { user_id: '11111111-1111-4111-8111-111111111111' })
        )
      ).status
    ).toBe(409);
    setTable('members', { insert: { data: null, error: { message: 'db' } } });
    expect(
      (
        await MEM_POST(
          jsonReq('POST', '/api/members', { user_id: '11111111-1111-4111-8111-111111111111' })
        )
      ).status
    ).toBe(500);
  });

  it('PUT id/json/status/success', async () => {
    expect((await MEM_PUT(jsonReq('PUT', '/api/members', { phone: '1' }))).status).toBe(400);
    expect((await MEM_PUT(badJsonReq('PUT', '/api/members?id=m1'))).status).toBe(400);
    expect((await MEM_PUT(jsonReq('PUT', '/api/members?id=m1', { status: 'ghost' }))).status).toBe(
      422
    );
    const ok = await MEM_PUT(
      jsonReq('PUT', '/api/members?id=m1', {
        phone: '0813',
        alamat: 'Jl. A',
        status: 'suspended',
        member_code: 'AG-2',
      })
    );
    expect(ok.status).toBe(200);
    setTable('members', { update: { data: null, error: { message: 'db' } } });
    expect((await MEM_PUT(jsonReq('PUT', '/api/members?id=m1', { phone: '1' }))).status).toBe(500);
  });

  it('DELETE id/active-loans-conflict/success/failure', async () => {
    expect((await MEM_DEL(req('/api/members', { method: 'DELETE' }))).status).toBe(400);
    setTable('loans', { count: 1 });
    expect((await MEM_DEL(req('/api/members?id=m1', { method: 'DELETE' }))).status).toBe(409);
    setTable('loans', { count: 0 });
    expect((await MEM_DEL(req('/api/members?id=m1', { method: 'DELETE' }))).status).toBe(200);
    setTable('members', { delete: { data: null, error: { message: 'db' } } });
    expect((await MEM_DEL(req('/api/members?id=m1', { method: 'DELETE' }))).status).toBe(500);
  });
});

describe('/api/testimonials', () => {
  it('GET list/id/inactive/error', async () => {
    setTable('testimonials', { list: { data: [{ id: 't1', name: 'Andi' }], count: 1 } });
    expect((await TST_GET(req('/api/testimonials'))).status).toBe(200);
    setTable('testimonials', { single: { data: { id: 't1', is_active: true } } });
    expect((await TST_GET(req('/api/testimonials?id=t1'))).status).toBe(200);
    setTable('testimonials', { single: { data: null, error: { message: 'nf' } } });
    expect((await TST_GET(req('/api/testimonials?id=zz'))).status).toBe(404);
    setTable('testimonials', { single: { data: { id: 't1', is_active: false } } });
    setAuthUser(null);
    expect((await TST_GET(req('/api/testimonials?id=t1'))).status).toBe(404);
    setAuthUser({ id: 'user-1' });
    setTable('testimonials', { list: { data: null, error: { message: 'x' } } });
    expect((await TST_GET(req('/api/testimonials'))).status).toBe(500);
  });

  it('POST invalid json -> 400', async () => {
    expect((await TST_POST(badJsonReq('POST', '/api/testimonials'))).status).toBe(400);
  });

  it('POST honeypot -> 422 SPAM_DETECTED', async () => {
    const res = await TST_POST(
      jsonReq('POST', '/api/testimonials', { name: 'X', content: 'Y', website: 'spam' })
    );
    expect(res.status).toBe(422);
    expect(await errCode(res)).toBe('SPAM_DETECTED');
  });

  it('POST missing name/content -> 422', async () => {
    expect((await TST_POST(jsonReq('POST', '/api/testimonials', { content: 'Y' }))).status).toBe(
      422
    );
    expect((await TST_POST(jsonReq('POST', '/api/testimonials', { name: 'X' }))).status).toBe(422);
  });

  it('POST content cap -> 422', async () => {
    const res = await TST_POST(
      jsonReq('POST', '/api/testimonials', { name: 'X', content: 'y'.repeat(2001) })
    );
    expect(res.status).toBe(422);
  });

  it('POST bad avatar -> 422', async () => {
    const res = await TST_POST(
      jsonReq('POST', '/api/testimonials', {
        name: 'X',
        content: 'Y',
        avatar_url: 'javascript:alert(1)',
      })
    );
    expect(res.status).toBe(422);
  });

  it('POST bad rating -> 422', async () => {
    const res = await TST_POST(
      jsonReq('POST', '/api/testimonials', { name: 'X', content: 'Y', rating: 9 })
    );
    expect(res.status).toBe(422);
  });

  it('POST anon success -> 201 inactive', async () => {
    setAuthUser(null);
    const res = await TST_POST(
      jsonReq('POST', '/api/testimonials', {
        name: 'Andi',
        content: 'Keren!',
        avatar_url: '/a.png',
        rating: '5',
      })
    );
    expect(res.status).toBe(201);
    const j = (await res.json()) as { revalidated: string[] };
    expect(j.revalidated).toEqual([]);
  });

  it('POST staff success writes log + revalidate', async () => {
    const res = await TST_POST(
      jsonReq('POST', '/api/testimonials', {
        name: 'Pustakawan',
        content: 'Mantap',
        sort_order: '1',
        is_active: true,
      })
    );
    expect(res.status).toBe(201);
    const j = (await res.json()) as { revalidated: string[] };
    expect(j.revalidated.length).toBeGreaterThan(0);
  });

  it('POST rate limited -> 429 after limit', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await TST_POST(
        jsonReq('POST', '/api/testimonials', { name: `N${i}`, content: 'C' })
      );
      expect(r.status).toBe(201);
    }
    const blocked = await TST_POST(
      jsonReq('POST', '/api/testimonials', { name: 'N6', content: 'C' })
    );
    expect(blocked.status).toBe(429);
    expect(await errCode(blocked)).toBe('RATE_LIMITED');
    expect(blocked.headers.get('Retry-After')).toBeTruthy();
  });

  it('PUT id/json/success', async () => {
    expect((await TST_PUT(jsonReq('PUT', '/api/testimonials', { name: 'X' }))).status).toBe(400);
    expect((await TST_PUT(badJsonReq('PUT', '/api/testimonials?id=t1'))).status).toBe(400);
    expect((await TST_PUT(jsonReq('PUT', '/api/testimonials?id=t1', { name: ' ' }))).status).toBe(
      422
    );
    expect((await TST_PUT(jsonReq('PUT', '/api/testimonials?id=t1', { content: '' }))).status).toBe(
      422
    );
    expect((await TST_PUT(jsonReq('PUT', '/api/testimonials?id=t1', { rating: 99 }))).status).toBe(
      422
    );
    expect((await TST_PUT(jsonReq('PUT', '/api/testimonials?id=t1', { urutan: 'x' }))).status).toBe(
      422
    );
    const ok = await TST_PUT(
      jsonReq('PUT', '/api/testimonials?id=t1', {
        name: 'Andi Edit',
        content: 'Baru',
        rating: '4',
        is_active: 'true',
      })
    );
    expect(ok.status).toBe(200);
    setTable('testimonials', { update: { data: null, error: { message: 'db' } } });
    const failed = await TST_PUT(jsonReq('PUT', '/api/testimonials?id=t1', { name: 'X' }));
    expect(failed.status).toBe(500);
    expect(await errCode(failed)).toBe('SAVE_FAILED');
  });
});

describe('/api/settings', () => {
  it('GET data / not found / error', async () => {
    expect((await SET_GET(req('/api/settings'))).status).toBe(200);
    setTable('library_settings', { single: { data: null, error: null } });
    expect((await SET_GET(req('/api/settings'))).status).toBe(404);
    setTable('library_settings', { single: { data: null, error: { message: 'x' } } });
    expect((await SET_GET(req('/api/settings'))).status).toBe(500);
  });

  it('PUT guards + success', async () => {
    expect((await SET_PUT(badJsonReq('PUT', '/api/settings'))).status).toBe(400);
    expect(
      (
        await SET_PUT(
          new Request('http://localhost/api/settings', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: '[]',
          })
        )
      ).status
    ).toBe(422);
    expect((await SET_PUT(jsonReq('PUT', '/api/settings', { name: 'ab' }))).status).toBe(422);
    expect(
      (await SET_PUT(jsonReq('PUT', '/api/settings', { name: 'Perpus', email: 'not-an-email' })))
        .status
    ).toBe(422);
    expect(
      (await SET_PUT(jsonReq('PUT', '/api/settings', { name: 'Perpus', fine_per_day: 0 }))).status
    ).toBe(422);
    expect(
      (await SET_PUT(jsonReq('PUT', '/api/settings', { name: 'Perpus', active_theme: 'neon' })))
        .status
    ).toBe(422);
    const ok = await SET_PUT(
      jsonReq('PUT', '/api/settings', {
        nama_perpus: 'Perpus Baru',
        telepon: '021',
        fine_per_day: '1500',
        active_theme: 'midnight',
        unknown_key: 'ignored',
      })
    );
    expect(ok.status).toBe(200);
    setTable('library_settings', { update: { data: null, error: { message: 'db' } } });
    expect((await SET_PUT(jsonReq('PUT', '/api/settings', { name: 'Perpus' }))).status).toBe(500);
    setAuthUser(null);
    expect((await SET_PUT(jsonReq('PUT', '/api/settings', { name: 'Perpus' }))).status).toBe(401);
    setAuthUser({ id: 'user-1' });
    setProfileRole('member');
    expect((await SET_PUT(jsonReq('PUT', '/api/settings', { name: 'Perpus' }))).status).toBe(403);
  });
});

describe('/api/register', () => {
  it('invalid json -> 422', async () => {
    expect((await REG_POST(badJsonReq('POST', '/api/register'))).status).toBe(422);
  });

  it('validation: nama/email/password/phone/address', async () => {
    expect(
      (await REG_POST(jsonReq('POST', '/api/register', { email: 'a@b.c', password: 'secret1' })))
        .status
    ).toBe(422);
    expect(
      (
        await REG_POST(
          jsonReq('POST', '/api/register', { nama: 'B', email: 'bad', password: 'secret1' })
        )
      ).status
    ).toBe(422);
    expect(
      (
        await REG_POST(
          jsonReq('POST', '/api/register', { nama: 'B', email: 'a@b.c', password: '123' })
        )
      ).status
    ).toBe(422);
    expect(
      (
        await REG_POST(
          jsonReq('POST', '/api/register', {
            nama: 'B',
            email: 'a@b.c',
            password: 'secret1',
            phone: 'x'.repeat(31),
          })
        )
      ).status
    ).toBe(422);
    expect(
      (
        await REG_POST(
          jsonReq('POST', '/api/register', {
            nama: 'B',
            email: 'a@b.c',
            password: 'secret1',
            address: 'x'.repeat(501),
          })
        )
      ).status
    ).toBe(422);
  });

  it('duplicate profile -> 409', async () => {
    setTable('profiles', { single: { data: { id: 'existing' } } });
    const res = await REG_POST(
      jsonReq('POST', '/api/register', { nama: 'Budi', email: 'budi@mail.id', password: 'secret1' })
    );
    expect(res.status).toBe(409);
  });

  it('duplicate member_code -> 409', async () => {
    setTable('profiles', { single: { data: null, error: null } });
    setTable('members', { single: { data: { id: 'm1' } } });
    const res = await REG_POST(
      jsonReq('POST', '/api/register', {
        nama: 'Budi',
        email: 'budi@mail.id',
        password: 'secret1',
        member_code: 'AG-1',
      })
    );
    expect(res.status).toBe(409);
  });

  it('signup conflict -> 409', async () => {
    setTable('profiles', { single: { data: null, error: null } });
    setSignUpResult({ data: { user: null }, error: { message: 'already registered' } });
    const res = await REG_POST(
      jsonReq('POST', '/api/register', { nama: 'Budi', email: 'budi@mail.id', password: 'secret1' })
    );
    expect(res.status).toBe(409);
  });

  it('signup failure -> 500', async () => {
    setTable('profiles', { single: { data: null, error: null } });
    setSignUpResult({ data: { user: null }, error: { message: 'server down' } });
    const res = await REG_POST(
      jsonReq('POST', '/api/register', { nama: 'Budi', email: 'budi@mail.id', password: 'secret1' })
    );
    expect(res.status).toBe(500);
  });

  it('profile insert conflict -> 409', async () => {
    setTable('profiles', {
      single: { data: null, error: null },
      insert: { data: null, error: { message: 'dup', code: '23505' } },
    });
    const res = await REG_POST(
      jsonReq('POST', '/api/register', { nama: 'Budi', email: 'budi@mail.id', password: 'secret1' })
    );
    expect(res.status).toBe(409);
  });

  it('profile insert failure -> 500', async () => {
    setTable('profiles', {
      single: { data: null, error: null },
      insert: { data: null, error: { message: 'db' } },
    });
    const res = await REG_POST(
      jsonReq('POST', '/api/register', { nama: 'Budi', email: 'budi@mail.id', password: 'secret1' })
    );
    expect(res.status).toBe(500);
  });

  it('member insert conflict -> 409', async () => {
    setTable('profiles', { single: { data: null, error: null } });
    setTable('members', { insert: { data: null, error: { message: 'dup', code: '23505' } } });
    const res = await REG_POST(
      jsonReq('POST', '/api/register', { nama: 'Budi', email: 'budi@mail.id', password: 'secret1' })
    );
    expect(res.status).toBe(409);
  });

  it('member insert failure -> 500', async () => {
    setTable('profiles', { single: { data: null, error: null } });
    setTable('members', { insert: { data: null, error: { message: 'db' } } });
    const res = await REG_POST(
      jsonReq('POST', '/api/register', { nama: 'Budi', email: 'budi@mail.id', password: 'secret1' })
    );
    expect(res.status).toBe(500);
  });

  it('happy path -> 201 with auto member code', async () => {
    setTable('profiles', { single: { data: null, error: null } });
    const res = await REG_POST(
      jsonReq('POST', '/api/register', {
        full_name: 'Budi Santoso',
        email: 'budi@mail.id',
        password: 'secret1',
        telepon: '0812',
        alamat: 'Jl. Kenanga',
      })
    );
    expect(res.status).toBe(201);
    const j = (await res.json()) as { data: { member_code: string } };
    expect(j.data.member_code).toMatch(/^AG-/);
  });
});

describe('probes: health, readyz, metrics, docs', () => {
  it('health 200 with checks', async () => {
    const res = await HEALTH_GET();
    expect(res.status).toBe(200);
    const j = (await res.json()) as { status: string; checks: Record<string, string> };
    expect(j.status).toBe('ok');
    expect(j.checks.sentry).toBe('disabled');
  });

  it('readyz ok -> 200', async () => {
    const res = await READYZ_GET();
    expect(res.status).toBe(200);
    const j = (await res.json()) as { ready: boolean; checks: { supabase: string } };
    expect(j.ready).toBe(true);
    expect(j.checks.supabase).toBe('ok');
  });

  it('readyz ping error -> 503', async () => {
    setTable('books', { list: { data: null, error: { message: 'down' } } });
    const res = await READYZ_GET();
    expect(res.status).toBe(503);
    const j = (await res.json()) as { ready: boolean; checks: { detail?: string } };
    expect(j.ready).toBe(false);
    expect(j.checks.detail).toBe('ping failed');
  });

  it('readyz throw -> 503 unreachable', async () => {
    setThrowFrom('books');
    const res = await READYZ_GET();
    expect(res.status).toBe(503);
    const j = (await res.json()) as { checks: { detail?: string } };
    expect(j.checks.detail).toBe('unreachable');
  });

  it('metrics without token -> 200 text/plain', async () => {
    vi.stubEnv('METRICS_TOKEN', '');
    const res = await METRICS_GET(req('/api/metrics'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/plain');
    const body = await res.text();
    expect(body).toContain('process_uptime_seconds');
    expect(body).toContain('build_info');
    vi.unstubAllEnvs();
  });

  it('metrics with token: 401 then 200', async () => {
    vi.stubEnv('METRICS_TOKEN', 'sekret');
    const noAuth = await METRICS_GET(req('/api/metrics'));
    expect(noAuth.status).toBe(401);
    const bad = await METRICS_GET(
      req('/api/metrics', { headers: { Authorization: 'Bearer salah' } })
    );
    expect(bad.status).toBe(401);
    const good = await METRICS_GET(
      req('/api/metrics', { headers: { Authorization: 'Bearer sekret' } })
    );
    expect(good.status).toBe(200);
    vi.unstubAllEnvs();
  });

  it('metrics failure -> 500', async () => {
    const spy = vi.spyOn(process, 'memoryUsage').mockImplementation(() => {
      throw new Error('mem');
    });
    const res = await METRICS_GET(req('/api/metrics'));
    expect(res.status).toBe(500);
    expect(await errCode(res)).toBe('INTERNAL');
    spy.mockRestore();
  });

  it('docs returns html with embedded spec', async () => {
    const res = await DOCS_GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('api-reference');
    expect(html).toContain('openapi.yaml');
  });
});
