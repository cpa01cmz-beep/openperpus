import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Reservation gate unified: [id] route + collection route menolak lompatan
// ilegal (pending->completed) dengan 422, mengizinkan pending->ready,
// ready->completed, any->cancelled/expired. Books PUT/DELETE audit
// books.update/books.delete + logs filter UI mencakup reservations.*,
// members.*, taxonomy.

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { PUT as BY_ID_PUT } from '@/app/api/reservations/[id]/route';
import { PUT as COLLECTION_PUT } from '@/app/api/reservations/route';
import { PUT as BOOK_PUT } from '@/app/api/books/[id]/route';

const RES_ID = '11111111-1111-4111-8111-111111111111';
const MID = '22222222-2222-4222-8222-222222222222';
const BID = '33333333-3333-4333-8333-333333333333';

type MockSupabase = Record<string, unknown>;

function setGlobal(mock: MockSupabase) {
  (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase = mock;
}

function putReq(url: string, body: Record<string, unknown>) {
  return new Request(url, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function staffAuth() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'U-ADMIN' } }, error: null }) },
  };
}

function updaterChain(cur: Record<string, unknown>, updated: Record<string, unknown>) {
  const chain: Record<string, unknown> = {};
  let isUpdate = false;
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.update = () => {
    isUpdate = true;
    return chain;
  };
  chain.single = async () =>
    isUpdate ? { data: updated, error: null } : { data: cur, error: null };
  chain.maybeSingle = chain.single;
  return chain;
}

// Mock untuk scoped() di [id] route: profiles/members maybeSingle,
// reservations select-atau-update, activity_logs capture.
function setByIdMock(status: string, seen: Record<string, unknown>[]) {
  const cur = { id: RES_ID, member_id: MID, status, books: null };
  const from = vi.fn((table: string) => {
    if (table === 'profiles')
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: { role: 'admin' }, error: null }) }),
        }),
      };
    if (table === 'members')
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: { id: MID }, error: null }) }),
        }),
      };
    if (table === 'reservations') return updaterChain(cur, { ...cur });
    if (table === 'activity_logs')
      return {
        insert: async (p: Record<string, unknown>) => {
          seen.push(p);
          return { error: null };
        },
      };
    return {
      select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
    };
  });
  setGlobal({ ...staffAuth(), from });
}

// Mock untuk getSession() di collection route: bentuk identik.
function setCollectionMock(status: string, seen: Record<string, unknown>[]) {
  const cur = { id: RES_ID, member_id: MID, status };
  const from = vi.fn((table: string) => {
    if (table === 'profiles')
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: { role: 'admin' }, error: null }) }),
        }),
      };
    if (table === 'members')
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: { id: MID }, error: null }) }),
        }),
      };
    if (table === 'reservations') return updaterChain(cur, { ...cur });
    if (table === 'activity_logs')
      return {
        insert: async (p: Record<string, unknown>) => {
          seen.push(p);
          return { error: null };
        },
      };
    return {
      select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
    };
  });
  setGlobal({ ...staffAuth(), from });
}

function setBookMock(seen: Record<string, unknown>[]) {
  const cur = { id: BID, title: 'Lama', slug: 'lama' };
  const from = vi.fn((table: string) => {
    if (table === 'profiles')
      return {
        select: () => ({
          eq: () => ({ single: async () => ({ data: { role: 'admin' }, error: null }) }),
        }),
      };
    if (table === 'books') return updaterChain(cur, { ...cur, title: 'Baru' });
    if (table === 'activity_logs')
      return {
        insert: async (p: Record<string, unknown>) => {
          seen.push(p);
          return { error: null };
        },
      };
    return {
      select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
    };
  });
  setGlobal({ ...staffAuth(), from });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('reservation gate unified ([id] + collection)', () => {
  it('[id] PUT pending->completed ditolak 422', async () => {
    setByIdMock('pending', []);
    const res = await BY_ID_PUT(
      putReq(`http://localhost/api/reservations/${RES_ID}`, { status: 'completed' }),
      {
        params: { id: RES_ID },
      }
    );
    if (!res) throw new Error('expected response');
    expect(res.status).toBe(422);
    const j = (await res.json()) as { error: { code: string; message: string } };
    expect(j.error.code).toBe('VALIDATION');
    expect(j.error.message).toMatch(/pending->completed tidak diizinkan/);
  });

  it('[id] PUT pending->ready lolos 200 + audit reservations.ready', async () => {
    const seen: Record<string, unknown>[] = [];
    setByIdMock('pending', seen);
    const res = await BY_ID_PUT(
      putReq(`http://localhost/api/reservations/${RES_ID}`, { status: 'ready' }),
      {
        params: { id: RES_ID },
      }
    );
    if (!res) throw new Error('expected response');
    expect(res.status).toBe(200);
    expect(seen.length).toBe(1);
    expect((seen[0] as { action: string }).action).toBe('reservations.ready');
  });

  it('[id] PUT ready->cancelled lolos 200 (any->cancelled)', async () => {
    setByIdMock('ready', []);
    const res = await BY_ID_PUT(
      putReq(`http://localhost/api/reservations/${RES_ID}`, { status: 'cancelled' }),
      {
        params: { id: RES_ID },
      }
    );
    if (!res) throw new Error('expected response');
    expect(res.status).toBe(200);
  });

  it('collection PUT pending->completed ditolak 422', async () => {
    setCollectionMock('pending', []);
    const res = await COLLECTION_PUT(
      putReq(`http://localhost/api/reservations?id=${RES_ID}`, { status: 'completed' })
    );
    expect(res.status).toBe(422);
    const j = (await res.json()) as { error: { code: string; message: string } };
    expect(j.error.code).toBe('VALIDATION');
    expect(j.error.message).toMatch(/pending->completed tidak diizinkan/);
  });

  it('collection PUT ready->completed lolos 200', async () => {
    const seen: Record<string, unknown>[] = [];
    setCollectionMock('ready', seen);
    const res = await COLLECTION_PUT(
      putReq(`http://localhost/api/reservations?id=${RES_ID}`, { status: 'completed' })
    );
    expect(res.status).toBe(200);
    expect((seen[0] as { action: string }).action).toBe('reservations.completed');
  });
});

describe('books [id] audit + logs filter', () => {
  it('books PUT inserts books.update audit', async () => {
    const seen: Record<string, unknown>[] = [];
    setBookMock(seen);
    const res = await BOOK_PUT(putReq(`http://localhost/api/books/${BID}`, { title: 'Baru' }), {
      params: { id: BID },
    });
    expect(res.status).toBe(200);
    expect(seen.length).toBe(1);
    expect((seen[0] as { action: string }).action).toBe('books.update');
    expect((seen[0] as { entity_id: string }).entity_id).toBe(BID);
  });

  it('logs page exposes reservations.*/members.*/taxonomy filters', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/admin/logs/page.tsx'), 'utf8');
    for (const a of [
      'reservations.completed',
      'reservations.cancelled',
      'members.create',
      'categories.update',
      'racks.delete',
      'menus.create',
      'books.update',
    ]) {
      expect(src.includes(a), `logs filter missing ${a}`).toBe(true);
    }
  });
});
