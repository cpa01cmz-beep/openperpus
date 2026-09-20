import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { PUT as BOOKS_ID_PUT } from '@/app/api/books/[id]/route';

const BID = '22222222-2222-4222-8222-222222222222';

function putReq(url: string, body: Record<string, unknown>) {
  return new Request(url, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function setGlobal(mock: unknown) {
  (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase = mock;
}

function staffAuth(role = 'admin') {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: 'U-ADMIN' } }, error: null }),
    },
    from: vi.fn((table: string) => {
      if (table === 'profiles')
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: { role }, error: null }) }) }),
        };
      if (table === 'books')
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { id: BID, stock_total: 5, stock_available: 3 },
                error: null,
              }),
            }),
          }),
          update: (p: Record<string, unknown>) => ({
            eq: () => ({
              select: () => ({
                single: async () => ({
                  data: { id: BID, ...(p as Record<string, unknown>) },
                  error: null,
                }),
              }),
            }),
          }),
        };
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
      };
    }),
  };
}

describe('FIX-A: PUT /api/books/[id] validateBook before update', () => {
  it('rejects invalid stock_available > stock_total with 422 VALIDATION', async () => {
    setGlobal(staffAuth());
    const res = await BOOKS_ID_PUT(
      putReq(`http://localhost/api/books/${BID}`, { stock_total: 5, stock_available: 10 }),
      { params: { id: BID } }
    );
    expect(res.status).toBe(422);
    const j = (await res.json()) as { error: { code: string; message: string } };
    expect(j.error.code).toBe('VALIDATION');
    expect(j.error.message).toBe('stock_available tidak boleh melebihi stock_total.');
  });

  it('rejects negative stock_available with 422 VALIDATION', async () => {
    setGlobal(staffAuth());
    const res = await BOOKS_ID_PUT(
      putReq(`http://localhost/api/books/${BID}`, { stock_available: -1 }),
      { params: { id: BID } }
    );
    expect(res.status).toBe(422);
    const j = (await res.json()) as { error: { code: string; message: string } };
    expect(j.error.code).toBe('VALIDATION');
    expect(j.error.message).toBe('stock_available tidak boleh negatif.');
  });

  it('rejects invalid category_id UUID with 422 VALIDATION', async () => {
    setGlobal(staffAuth());
    const res = await BOOKS_ID_PUT(
      putReq(`http://localhost/api/books/${BID}`, { category_id: 'not-uuid' }),
      { params: { id: BID } }
    );
    expect(res.status).toBe(422);
    const j = (await res.json()) as { error: { code: string; message: string } };
    expect(j.error.code).toBe('VALIDATION');
    expect(j.error.message).toBe('category_id harus UUID valid.');
  });

  it('rejects invalid rack_id UUID with 422 VALIDATION', async () => {
    setGlobal(staffAuth());
    const res = await BOOKS_ID_PUT(
      putReq(`http://localhost/api/books/${BID}`, { rack_id: 'not-uuid' }),
      { params: { id: BID } }
    );
    expect(res.status).toBe(422);
    const j = (await res.json()) as { error: { code: string; message: string } };
    expect(j.error.code).toBe('VALIDATION');
    expect(j.error.message).toBe('rack_id harus UUID valid.');
  });

  it('accepts valid payload and updates', async () => {
    setGlobal(staffAuth());
    const res = await BOOKS_ID_PUT(
      putReq(`http://localhost/api/books/${BID}`, {
        title: 'Updated Title',
        stock_total: 10,
        stock_available: 5,
      }),
      { params: { id: BID } }
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as {
      data: { title: string; stock_total: number; stock_available: number };
    };
    expect(j.data.title).toBe('Updated Title');
  });
});
