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
  req,
  jsonReq,
  badJsonReq,
} from './helpers/supabase-mock';

import { GET as CAT_GET, PUT as CAT_PUT, DELETE as CAT_DEL } from '@/app/api/categories/[id]/route';
import { GET as RACK_GET, PUT as RACK_PUT, DELETE as RACK_DEL } from '@/app/api/racks/[id]/route';
import { GET as MENU_GET, PUT as MENU_PUT, DELETE as MENU_DEL } from '@/app/api/menus/[id]/route';
import { GET as PAGE_GET, PUT as PAGE_PUT, DELETE as PAGE_DEL } from '@/app/api/pages/[id]/route';
import { GET as FAQ_GET, PUT as FAQ_PUT, DELETE as FAQ_DEL } from '@/app/api/faqs/[id]/route';
import {
  GET as TST_GET,
  PUT as TST_PUT,
  DELETE as TST_DEL,
} from '@/app/api/testimonials/[id]/route';
import { PUT as BOOK_PUT, DELETE as BOOK_DEL } from '@/app/api/books/[id]/route';
import { GET as FINE_GET } from '@/app/api/fines/[id]/route';
import { POST as PAY_POST } from '@/app/api/fines/[id]/pay/route';

const ctx = { params: { id: 'row-1' } };

beforeEach(() => {
  resetMockDb();
  installMockSupabase();
});

describe('categories/[id]', () => {
  it('GET active 200 / missing 404 / inactive anon 404 / inactive staff 200', async () => {
    setTable('categories', { single: { data: { id: 'c1', is_active: true } } });
    expect((await CAT_GET(req('/api/x'), ctx)).status).toBe(200);

    setTable('categories', { single: { data: null, error: { message: 'nf' } } });
    expect((await CAT_GET(req('/api/x'), ctx)).status).toBe(404);

    setTable('categories', { single: { data: { id: 'c1', is_active: false } } });
    setAuthUser(null);
    expect((await CAT_GET(req('/api/x'), ctx)).status).toBe(404);
    setAuthUser({ id: 'user-1' });
    expect((await CAT_GET(req('/api/x'), ctx)).status).toBe(200);
  });

  it('PUT json/name/conflict/save-fail/success', async () => {
    expect((await CAT_PUT(badJsonReq('PUT', '/api/x'), ctx)).status).toBe(400);
    expect((await CAT_PUT(jsonReq('PUT', '/api/x', { name: ' ' }), ctx)).status).toBe(422);
    setTable('categories', { update: { data: null, error: { message: 'dup', code: '23505' } } });
    expect((await CAT_PUT(jsonReq('PUT', '/api/x', { name: 'Baru' }), ctx)).status).toBe(409);
    setTable('categories', { update: { data: null, error: { message: 'db' } } });
    expect((await CAT_PUT(jsonReq('PUT', '/api/x', { name: 'Baru' }), ctx)).status).toBe(500);
    setTable('categories', { update: { data: { id: 'row-1' }, error: null } });
    const ok = await CAT_PUT(jsonReq('PUT', '/api/x', { name: 'Baru', sort_order: '3' }), ctx);
    expect(ok.status).toBe(200);
  });

  it('DELETE in-use 409 / success 200 / failure 500', async () => {
    setTable('books', { count: 2 });
    expect((await CAT_DEL(req('/api/x', { method: 'DELETE' }), ctx)).status).toBe(409);
    setTable('books', { count: 0 });
    expect((await CAT_DEL(req('/api/x', { method: 'DELETE' }), ctx)).status).toBe(200);
    setTable('categories', { delete: { data: null, error: { message: 'db' } } });
    expect((await CAT_DEL(req('/api/x', { method: 'DELETE' }), ctx)).status).toBe(500);
  });
});

describe('racks/[id]', () => {
  it('GET active/missing/inactive-anon/inactive-staff', async () => {
    setTable('racks', { single: { data: { id: 'r1', is_active: true } } });
    expect((await RACK_GET(req('/api/x'), ctx)).status).toBe(200);
    setTable('racks', { single: { data: null, error: { message: 'nf' } } });
    expect((await RACK_GET(req('/api/x'), ctx)).status).toBe(404);
    setTable('racks', { single: { data: { id: 'r1', is_active: false } } });
    setAuthUser(null);
    expect((await RACK_GET(req('/api/x'), ctx)).status).toBe(404);
  });

  it('PUT json/code/name/capacity/conflict/save-fail/success', async () => {
    expect((await RACK_PUT(badJsonReq('PUT', '/api/x'), ctx)).status).toBe(400);
    expect((await RACK_PUT(jsonReq('PUT', '/api/x', { code: ' ' }), ctx)).status).toBe(422);
    expect((await RACK_PUT(jsonReq('PUT', '/api/x', { name: ' ' }), ctx)).status).toBe(422);
    expect((await RACK_PUT(jsonReq('PUT', '/api/x', { capacity: 1.5 }), ctx)).status).toBe(422);
    setTable('racks', { update: { data: null, error: { message: 'dup', code: '23505' } } });
    expect((await RACK_PUT(jsonReq('PUT', '/api/x', { code: 'B2' }), ctx)).status).toBe(409);
    setTable('racks', { update: { data: null, error: { message: 'db' } } });
    expect((await RACK_PUT(jsonReq('PUT', '/api/x', { code: 'B2' }), ctx)).status).toBe(500);
    setTable('racks', { update: { data: { id: 'row-1' }, error: null } });
    const ok = await RACK_PUT(jsonReq('PUT', '/api/x', { location: 'Lt 2', capacity: null }), ctx);
    expect(ok.status).toBe(200);
  });

  it('DELETE in-use 409 / success / failure', async () => {
    setTable('books', { count: 1 });
    expect((await RACK_DEL(req('/api/x', { method: 'DELETE' }), ctx)).status).toBe(409);
    setTable('books', { count: 0 });
    expect((await RACK_DEL(req('/api/x', { method: 'DELETE' }), ctx)).status).toBe(200);
    setTable('racks', { delete: { data: null, error: { message: 'db' } } });
    expect((await RACK_DEL(req('/api/x', { method: 'DELETE' }), ctx)).status).toBe(500);
  });
});

describe('menus/[id]', () => {
  it('GET active/missing/inactive gate', async () => {
    setTable('menus', { single: { data: { id: 'm1', is_active: true } } });
    expect((await MENU_GET(req('/api/x'), ctx)).status).toBe(200);
    setTable('menus', { single: { data: null, error: { message: 'nf' } } });
    expect((await MENU_GET(req('/api/x'), ctx)).status).toBe(404);
    setTable('menus', { single: { data: { id: 'm1', is_active: false } } });
    setAuthUser(null);
    expect((await MENU_GET(req('/api/x'), ctx)).status).toBe(404);
  });

  it('PUT guards + success + save-fail', async () => {
    expect((await MENU_PUT(badJsonReq('PUT', '/api/x'), ctx)).status).toBe(400);
    expect((await MENU_PUT(jsonReq('PUT', '/api/x', { label: ' ' }), ctx)).status).toBe(422);
    expect((await MENU_PUT(jsonReq('PUT', '/api/x', { url: ' ' }), ctx)).status).toBe(422);
    expect((await MENU_PUT(jsonReq('PUT', '/api/x', { position: 'sidebar2' }), ctx)).status).toBe(
      422
    );
    expect((await MENU_PUT(jsonReq('PUT', '/api/x', { target: '_blank2' }), ctx)).status).toBe(422);
    expect((await MENU_PUT(jsonReq('PUT', '/api/x', { parent_id: 'not-uuid' }), ctx)).status).toBe(
      422
    );
    expect((await MENU_PUT(jsonReq('PUT', '/api/x', { parent_id: 'row-1' }), ctx)).status).toBe(
      422
    );
    setTable('menus', { update: { data: null, error: { message: 'db' } } });
    expect((await MENU_PUT(jsonReq('PUT', '/api/x', { label: 'Baru' }), ctx)).status).toBe(500);
    setTable('menus', { update: { data: { id: 'row-1' }, error: null } });
    const ok = await MENU_PUT(jsonReq('PUT', '/api/x', { label: 'Baru', target: '_blank' }), ctx);
    expect(ok.status).toBe(200);
  });

  it('DELETE children 409 / success / failure', async () => {
    setTable('menus', { count: 3 });
    expect((await MENU_DEL(req('/api/x', { method: 'DELETE' }), ctx)).status).toBe(409);
    setTable('menus', { count: 0 });
    expect((await MENU_DEL(req('/api/x', { method: 'DELETE' }), ctx)).status).toBe(200);
    setTable('menus', { delete: { data: null, error: { message: 'db' } } });
    expect((await MENU_DEL(req('/api/x', { method: 'DELETE' }), ctx)).status).toBe(500);
  });
});

describe('pages/[id]', () => {
  it('GET active/missing/inactive gate', async () => {
    setTable('pages', { single: { data: { id: 'p1', is_active: true, slug: 'x' } } });
    expect((await PAGE_GET(req('/api/x'), ctx)).status).toBe(200);
    setTable('pages', { single: { data: null, error: { message: 'nf' } } });
    expect((await PAGE_GET(req('/api/x'), ctx)).status).toBe(404);
    setTable('pages', { single: { data: { id: 'p1', is_active: false } } });
    setAuthUser(null);
    expect((await PAGE_GET(req('/api/x'), ctx)).status).toBe(404);
  });

  it('PUT guards/empty/conflict/save-fail/success', async () => {
    expect((await PAGE_PUT(badJsonReq('PUT', '/api/x'), ctx)).status).toBe(400);
    expect((await PAGE_PUT(jsonReq('PUT', '/api/x', { title: ' ' }), ctx)).status).toBe(422);
    expect((await PAGE_PUT(jsonReq('PUT', '/api/x', { content_md: '' }), ctx)).status).toBe(422);
    expect((await PAGE_PUT(jsonReq('PUT', '/api/x', {}), ctx)).status).toBe(422);
    setTable('pages', { update: { data: null, error: { message: 'dup', code: '23505' } } });
    expect((await PAGE_PUT(jsonReq('PUT', '/api/x', { title: 'Baru' }), ctx)).status).toBe(409);
    setTable('pages', { update: { data: null, error: { message: 'db' } } });
    expect((await PAGE_PUT(jsonReq('PUT', '/api/x', { title: 'Baru' }), ctx)).status).toBe(500);
    setTable('pages', { update: { data: { id: 'row-1' }, error: null } });
    const ok = await PAGE_PUT(
      jsonReq('PUT', '/api/x', { excerpt: 'Ringkas', seo_title: 'SEO' }),
      ctx
    );
    expect(ok.status).toBe(200);
  });

  it('DELETE success + failure', async () => {
    setTable('pages', { single: { data: { id: 'p1', slug: 'lama' } } });
    expect((await PAGE_DEL(req('/api/x', { method: 'DELETE' }), ctx)).status).toBe(200);
    setTable('pages', { delete: { data: null, error: { message: 'db' } } });
    expect((await PAGE_DEL(req('/api/x', { method: 'DELETE' }), ctx)).status).toBe(500);
  });
});

describe('faqs/[id]', () => {
  it('GET active/missing/inactive gate', async () => {
    setTable('faqs', { single: { data: { id: 'f1', is_active: true } } });
    expect((await FAQ_GET(req('/api/x'), ctx)).status).toBe(200);
    setTable('faqs', { single: { data: null, error: { message: 'nf' } } });
    expect((await FAQ_GET(req('/api/x'), ctx)).status).toBe(404);
    setTable('faqs', { single: { data: { id: 'f1', is_active: false } } });
    setAuthUser(null);
    expect((await FAQ_GET(req('/api/x'), ctx)).status).toBe(404);
  });

  it('PUT guards/empty/save-fail/success', async () => {
    expect((await FAQ_PUT(badJsonReq('PUT', '/api/x'), ctx)).status).toBe(400);
    expect((await FAQ_PUT(jsonReq('PUT', '/api/x', { question: ' ' }), ctx)).status).toBe(422);
    expect((await FAQ_PUT(jsonReq('PUT', '/api/x', { answer: ' ' }), ctx)).status).toBe(422);
    expect((await FAQ_PUT(jsonReq('PUT', '/api/x', { urutan: 'x' }), ctx)).status).toBe(422);
    expect((await FAQ_PUT(jsonReq('PUT', '/api/x', {}), ctx)).status).toBe(422);
    setTable('faqs', { update: { data: null, error: { message: 'db' } } });
    expect((await FAQ_PUT(jsonReq('PUT', '/api/x', { question: 'Baru?' }), ctx)).status).toBe(500);
    setTable('faqs', { update: { data: { id: 'row-1' }, error: null } });
    const ok = await FAQ_PUT(jsonReq('PUT', '/api/x', { answer: 'Baru.', urutan: '2' }), ctx);
    expect(ok.status).toBe(200);
  });

  it('DELETE success + failure', async () => {
    expect((await FAQ_DEL(req('/api/x', { method: 'DELETE' }), ctx)).status).toBe(200);
    setTable('faqs', { delete: { data: null, error: { message: 'db' } } });
    expect((await FAQ_DEL(req('/api/x', { method: 'DELETE' }), ctx)).status).toBe(500);
  });
});

describe('testimonials/[id]', () => {
  it('GET active/missing/inactive gate', async () => {
    setTable('testimonials', { single: { data: { id: 't1', is_active: true } } });
    expect((await TST_GET(req('/api/x'), ctx)).status).toBe(200);
    setTable('testimonials', { single: { data: null, error: { message: 'nf' } } });
    expect((await TST_GET(req('/api/x'), ctx)).status).toBe(404);
    setTable('testimonials', { single: { data: { id: 't1', is_active: false } } });
    setAuthUser(null);
    expect((await TST_GET(req('/api/x'), ctx)).status).toBe(404);
  });

  it('PUT guards/empty/save-fail/success', async () => {
    expect((await TST_PUT(badJsonReq('PUT', '/api/x'), ctx)).status).toBe(400);
    expect((await TST_PUT(jsonReq('PUT', '/api/x', { name: ' ' }), ctx)).status).toBe(422);
    expect((await TST_PUT(jsonReq('PUT', '/api/x', { content: ' ' }), ctx)).status).toBe(422);
    expect((await TST_PUT(jsonReq('PUT', '/api/x', { rating: 0 }), ctx)).status).toBe(422);
    expect((await TST_PUT(jsonReq('PUT', '/api/x', { urutan: 'zz' }), ctx)).status).toBe(422);
    expect((await TST_PUT(jsonReq('PUT', '/api/x', {}), ctx)).status).toBe(422);
    setTable('testimonials', { update: { data: null, error: { message: 'db' } } });
    expect((await TST_PUT(jsonReq('PUT', '/api/x', { name: 'Baru' }), ctx)).status).toBe(500);
    setTable('testimonials', { update: { data: { id: 'row-1' }, error: null } });
    const ok = await TST_PUT(jsonReq('PUT', '/api/x', { rating: '4', is_active: 'true' }), ctx);
    expect(ok.status).toBe(200);
  });

  it('DELETE success + failure', async () => {
    expect((await TST_DEL(req('/api/x', { method: 'DELETE' }), ctx)).status).toBe(200);
    setTable('testimonials', { delete: { data: null, error: { message: 'db' } } });
    expect((await TST_DEL(req('/api/x', { method: 'DELETE' }), ctx)).status).toBe(500);
  });
});

describe('books/[id]', () => {
  it('PUT unauth/json/validation/stock guard/save-fail/success', async () => {
    setAuthUser(null);
    expect((await BOOK_PUT(badJsonReq('PUT', '/api/x'), ctx)).status).toBe(401);
    setAuthUser({ id: 'user-1' });
    expect((await BOOK_PUT(badJsonReq('PUT', '/api/x'), ctx)).status).toBe(400);
    expect((await BOOK_PUT(jsonReq('PUT', '/api/x', { title: 'AB' }), ctx)).status).toBe(422);
    expect(
      (await BOOK_PUT(jsonReq('PUT', '/api/x', { category_id: 'bukan-uuid' }), ctx)).status
    ).toBe(422);
    expect((await BOOK_PUT(jsonReq('PUT', '/api/x', { rack_id: 'bukan-uuid' }), ctx)).status).toBe(
      422
    );
    expect((await BOOK_PUT(jsonReq('PUT', '/api/x', { stock_available: -1 }), ctx)).status).toBe(
      422
    );
    setTable('books', { single: { data: { stock_total: 2, stock_available: 1 } } });
    expect((await BOOK_PUT(jsonReq('PUT', '/api/x', { stock_available: 5 }), ctx)).status).toBe(
      422
    );
    setTable('books', { single: { data: null, error: null } });
    expect((await BOOK_PUT(jsonReq('PUT', '/api/x', { stock_available: 1 }), ctx)).status).toBe(
      404
    );
    setTable('books', { update: { data: null, error: { message: 'db' } } });
    expect((await BOOK_PUT(jsonReq('PUT', '/api/x', { title: 'Buku Baru' }), ctx)).status).toBe(
      500
    );
    setTable('books', {
      single: { data: { stock_total: 5, stock_available: 4 } },
      update: { data: { id: 'row-1' }, error: null },
    });
    const ok = await BOOK_PUT(
      jsonReq('PUT', '/api/x', { judul: 'Judul Baru', penulis: 'Penulis' }),
      ctx
    );
    expect(ok.status).toBe(200);
  });

  it('DELETE unauth/active loans/success/failure', async () => {
    setAuthUser(null);
    expect((await BOOK_DEL(req('/api/x', { method: 'DELETE' }), ctx)).status).toBe(401);
    setAuthUser({ id: 'user-1' });
    setTable('loans', { count: 4 });
    expect((await BOOK_DEL(req('/api/x', { method: 'DELETE' }), ctx)).status).toBe(409);
    setTable('loans', { count: 0 });
    expect((await BOOK_DEL(req('/api/x', { method: 'DELETE' }), ctx)).status).toBe(200);
    setTable('books', { delete: { data: null, error: { message: 'db' } } });
    expect((await BOOK_DEL(req('/api/x', { method: 'DELETE' }), ctx)).status).toBe(500);
  });
});

describe('fines/[id] + pay guards', () => {
  it('GET unauth 401', async () => {
    setAuthUser(null);
    expect((await FINE_GET(req('/api/x'), ctx)).status).toBe(401);
  });

  it('GET staff 200', async () => {
    setTable('profiles', { single: { data: { role: 'admin' } } });
    setTable('fines', { single: { data: { id: 'f1', member_id: 'm-own' } } });
    expect((await FINE_GET(req('/api/x'), ctx)).status).toBe(200);
  });

  it('GET member own 200 / others 403', async () => {
    setTable('profiles', { single: { data: { role: 'member' } } });
    setTable('fines', { single: { data: { id: 'f1', member_id: 'm-own' } } });
    setTable('members', { single: { data: { id: 'm-own' } } });
    expect((await FINE_GET(req('/api/x'), ctx)).status).toBe(200);
    setTable('fines', { single: { data: { id: 'f1', member_id: 'm-other' } } });
    expect((await FINE_GET(req('/api/x'), ctx)).status).toBe(403);
  });

  it('GET not found 404', async () => {
    setTable('profiles', { single: { data: { role: 'admin' } } });
    setTable('fines', { single: { data: null, error: { message: 'nf' } } });
    expect((await FINE_GET(req('/api/x'), ctx)).status).toBe(404);
  });

  it('pay unauth/invalid json/not found', async () => {
    setAuthUser(null);
    expect((await PAY_POST(badJsonReq('POST', '/api/x'), ctx)).status).toBe(401);
    setAuthUser({ id: 'user-1' });
    expect((await PAY_POST(badJsonReq('POST', '/api/x'), ctx)).status).toBe(400);
    setTable('fines', { single: { data: null, error: { message: 'nf' } } });
    expect((await PAY_POST(jsonReq('POST', '/api/x', { metode: 'cash' }), ctx)).status).toBe(404);
  });
});
