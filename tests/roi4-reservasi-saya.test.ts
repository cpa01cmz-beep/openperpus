import { describe, expect, it, vi } from 'vitest';

// S-roi4: Reservasi & pinjaman saya dengan batal 1-klik.
// RED first — modul @/lib/reservations-client belum ada.
// AC1: GET /api/reservations (no-store) -> status, judul, expires_at + loan due_at.
// AC2: PUT /api/reservations?id= {status:'cancelled'} 200 -> batal.
// AC3: 401 -> login banner; offline -> cached + reload; tanpa bocor data anggota lain.

import { cancelMyReservation, fetchMyLoans, fetchMyReservations } from '@/lib/reservations-client';

type Json = Record<string, unknown>;

function mockFetchOnce(status: number, body: unknown, opts?: { throws?: Error }) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (opts?.throws) throw opts.throws;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    };
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

const RES_ROW = {
  id: '11111111-1111-4111-8111-111111111111',
  status: 'pending',
  expires_at: '2026-10-01T00:00:00.000Z',
  books: { id: 'b1', title: 'Laskar Pelangi' },
};

const LOAN_ROW = {
  id: '22222222-2222-4222-8222-222222222222',
  status: 'borrowed',
  due_at: '2026-10-15T00:00:00.000Z',
  books: { id: 'b1', title: 'Laskar Pelangi' },
};

describe('S-roi4 AC1: daftar reservasi + pinjaman aktif (no-store)', () => {
  it('fetchMyReservations GET /api/reservations no-store + data status/judul/expires_at', async () => {
    const { fn, calls } = mockFetchOnce(200, { data: [RES_ROW] });
    const rows = await fetchMyReservations({ fetchLike: fn });
    expect(calls.length).toBe(1);
    expect(calls[0]!.url).toBe('/api/reservations');
    expect((calls[0]!.init as RequestInit)?.cache).toBe('no-store');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'pending', expires_at: RES_ROW.expires_at });
  });

  it('fetchMyLoans GET /api/loans no-store + data status/judul/due_at', async () => {
    const { fn, calls } = mockFetchOnce(200, { data: [LOAN_ROW] });
    const rows = await fetchMyLoans({ fetchLike: fn });
    expect(calls.length).toBe(1);
    expect(String(calls[0]!.url)).toContain('/api/loans');
    expect((calls[0]!.init as RequestInit)?.cache).toBe('no-store');
    expect(rows[0]).toMatchObject({ status: 'borrowed', due_at: LOAN_ROW.due_at });
  });

  it('tidak pernah mengirim member_id (server memaksa milik sendiri, anti-bocor)', async () => {
    const { fn, calls } = mockFetchOnce(200, { data: [RES_ROW] });
    await fetchMyReservations({ fetchLike: fn });
    expect(String(calls[0]!.url)).not.toContain('member_id');
    const { fn: fn2, calls: calls2 } = mockFetchOnce(200, { data: [LOAN_ROW] });
    await fetchMyLoans({ fetchLike: fn2 });
    expect(String(calls2[0]!.url)).not.toContain('member_id');
  });
});

describe('S-roi4 AC2: batal 1-klik milik sendiri', () => {
  it("cancelMyReservation PUT /api/reservations?id= {status:'cancelled'} -> 200 data", async () => {
    const { fn, calls } = mockFetchOnce(200, {
      data: { ...RES_ROW, status: 'cancelled' },
    });
    const row = (await cancelMyReservation({ fetchLike: fn }, { id: RES_ROW.id })) as Json;
    expect(calls.length).toBe(1);
    expect(String(calls[0]!.url)).toBe(`/api/reservations?id=${RES_ROW.id}`);
    expect((calls[0]!.init?.method ?? '').toUpperCase()).toBe('PUT');
    expect(JSON.parse(String(calls[0]!.init?.body))).toMatchObject({
      status: 'cancelled',
    });
    expect(row).toMatchObject({ status: 'cancelled' });
  });

  it('cancel tanpa id -> VALIDATION error sebelum fetch (tanpa request)', async () => {
    const { fn, calls } = mockFetchOnce(200, {});
    await expect(cancelMyReservation({ fetchLike: fn }, { id: '' })).rejects.toThrow();
    expect(calls.length).toBe(0);
  });
});

describe('S-roi4 AC3: 401 / offline tanpa crash tanpa bocor', () => {
  it('401 -> UNAUTHENTICATED (halaman tampilkan banner login /login?next=/reservasi-saya)', async () => {
    const { fn } = mockFetchOnce(401, {
      error: { code: 'UNAUTHORIZED', message: 'Silakan login.' },
    });
    await expect(fetchMyReservations({ fetchLike: fn })).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    const { fn: fn2 } = mockFetchOnce(401, { error: { message: 'Silakan login.' } });
    await expect(fetchMyLoans({ fetchLike: fn2 })).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('fetch gagal total (offline) -> OFFLINE agar halaman tampilkan cache + tombol muat ulang', async () => {
    const { fn } = mockFetchOnce(0, null, { throws: new TypeError('Failed to fetch') });
    await expect(fetchMyReservations({ fetchLike: fn })).rejects.toMatchObject({
      code: 'OFFLINE',
    });
  });
});
