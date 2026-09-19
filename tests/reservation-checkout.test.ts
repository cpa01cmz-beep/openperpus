import { describe, expect, it, vi, beforeEach } from 'vitest';

// US-02: Reservasi → Pinjam 1-klik (orkestrasi client 2-call).
// Urutan: POST /api/loans dulu, HANYA jika 201 lanjut PUT /api/reservations completed.
// Jika POST gagal: tampilkan message server persis + JANGAN ubah reservasi.
// Kompensasi: tidak ada rollback loan jika PUT gagal (dokumentasi di helper).

import { checkoutReservation, clearCheckoutInflight } from '@/lib/reservation-checkout';

function mockFetch(scenarios: Array<{ status: number; body: unknown }>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const s = scenarios[calls.length - 1] ?? scenarios[scenarios.length - 1]!;
    return {
      ok: s.status >= 200 && s.status < 300,
      status: s.status,
      json: async () => s.body,
    };
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

const RES_ID = '11111111-1111-4111-8111-111111111111';
const MEMBER_ID = '22222222-2222-4222-8222-222222222222';
const BOOK_ID = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  clearCheckoutInflight();
});

describe('US-02 reservation-checkout', () => {
  it('happy: ready → POST /api/loans 201 (due+14h) lalu PUT completed 200', async () => {
    const borrowed = new Date('2026-01-01T00:00:00.000Z');
    const due = new Date(borrowed.getTime() + 14 * 24 * 3600 * 1000);
    const { fn, calls } = mockFetch([
      { status: 201, body: { data: { id: 'loan-1', due_at: due.toISOString() } } },
      { status: 200, body: { data: { id: RES_ID, status: 'completed' } } },
    ]);
    const res = await checkoutReservation(
      { fetchLike: fn },
      { reservationId: RES_ID, memberId: MEMBER_ID, bookId: BOOK_ID }
    );
    expect(calls.length).toBe(2);
    expect(calls[0]!.url).toBe('/api/loans');
    expect(JSON.parse(String(calls[0]!.init?.body)).book_id).toBe(BOOK_ID);
    expect(calls[1]!.url).toBe(`/api/reservations?id=${RES_ID}`);
    expect(JSON.parse(String(calls[1]!.init?.body)).status).toBe('completed');
    expect((res.loan as { id: string }).id).toBe('loan-1');
    // due+14 hari persis
    expect(new Date((res.loan as { due_at: string }).due_at).toISOString()).toBe(due.toISOString());
    expect((res.reservation as { status: string }).status).toBe('completed');
  });

  it("edge stok 0 → 409 'Stok buku habis.' + reservasi tetap ready (PUT tidak dipanggil)", async () => {
    const { fn, calls } = mockFetch([
      {
        status: 409,
        body: { error: { code: 'CONFLICT', message: 'Stok buku habis.' } },
      },
    ]);
    await expect(
      checkoutReservation(
        { fetchLike: fn },
        { reservationId: RES_ID, memberId: MEMBER_ID, bookId: BOOK_ID }
      )
    ).rejects.toThrow('Stok buku habis.');
    expect(calls.length).toBe(1);
    expect(calls[0]!.url).toBe('/api/loans');
  });

  it("edge suspended → 422 'Anggota tidak aktif (suspended/expired/pending).'", async () => {
    const { fn, calls } = mockFetch([
      {
        status: 422,
        body: {
          error: {
            code: 'VALIDATION',
            message: 'Anggota tidak aktif (suspended/expired/pending).',
          },
        },
      },
    ]);
    await expect(
      checkoutReservation(
        { fetchLike: fn },
        { reservationId: RES_ID, memberId: MEMBER_ID, bookId: BOOK_ID }
      )
    ).rejects.toThrow('Anggota tidak aktif (suspended/expired/pending).');
    expect(calls.length).toBe(1);
  });

  it('edge double-klik → hanya 1 loan (klik kedua diabaikan saat in-flight)', async () => {
    const { fn, calls } = mockFetch([
      { status: 201, body: { data: { id: 'loan-1' } } },
      { status: 200, body: { data: { id: RES_ID, status: 'completed' } } },
    ]);
    const input = { reservationId: RES_ID, memberId: MEMBER_ID, bookId: BOOK_ID };
    const [a, b] = await Promise.allSettled([
      checkoutReservation({ fetchLike: fn }, input),
      checkoutReservation({ fetchLike: fn }, input),
    ]);
    const fulfilled = [a, b].filter((r) => r.status === 'fulfilled').length;
    const skipped = [a, b].filter(
      (r) =>
        r.status === 'fulfilled' &&
        (r as PromiseFulfilledResult<{ skipped?: boolean }>).value?.skipped
    ).length;
    expect(fulfilled).toBe(2);
    expect(skipped).toBe(1);
    expect(calls.filter((c) => c.url === '/api/loans').length).toBe(1);
  });

  it('kompensasi: PUT completed gagal → error dilempar + loan TIDAK di-rollback', async () => {
    const { fn, calls } = mockFetch([
      { status: 201, body: { data: { id: 'loan-9' } } },
      { status: 500, body: { error: { message: 'Gagal mengupdate reservasi.' } } },
    ]);
    await expect(
      checkoutReservation(
        { fetchLike: fn },
        { reservationId: RES_ID, memberId: MEMBER_ID, bookId: BOOK_ID }
      )
    ).rejects.toThrow('Gagal mengupdate reservasi.');
    // loan tetap ada (1 POST), tidak ada DELETE rollback
    expect(calls.filter((c) => c.url === '/api/loans').length).toBe(1);
    expect(calls.some((c) => (c.init?.method ?? '').toUpperCase() === 'DELETE')).toBe(false);
  });
});
