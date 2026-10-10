import { describe, expect, it, vi, beforeEach } from 'vitest';

// US-02 v2 (issue #73): Reservasi -> Pinjam jadi SATU panggilan atomik.
// POST /api/reservations/{id}/checkout -> RPC checkout_reservation_tx
// (migrasi 0024): lock reservasi+buku, gate kelayakan, insert loan, update
// reservasi completed dalam satu transaksi. Tidak ada lagi 2-call
// (POST /api/loans + PUT completed) yang bisa gagal separuh.

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

beforeEach(() => {
  clearCheckoutInflight();
});

describe('US-02 v2 reservation-checkout (atomik 1-call)', () => {
  it('happy: POST /api/reservations/{id}/checkout 201 -> loan + reservation completed', async () => {
    const { fn, calls } = mockFetch([
      {
        status: 201,
        body: {
          data: {
            loan: { id: 'loan-1', status: 'borrowed' },
            reservation: { id: RES_ID, status: 'completed', loan_id: 'loan-1' },
          },
        },
      },
    ]);
    const res = await checkoutReservation({ fetchLike: fn }, { reservationId: RES_ID });
    expect(calls.length).toBe(1);
    expect(calls[0]!.url).toBe(`/api/reservations/${RES_ID}/checkout`);
    expect(calls[0]!.init?.method).toBe('POST');
    expect((res.loan as { id: string }).id).toBe('loan-1');
    expect((res.reservation as { status: string }).status).toBe('completed');
    // member/book tidak lagi dikirim dari klien - server resolve dari reservasi.
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({});
  });

  it("edge stok 0 -> 409 'Stok buku habis.' dilempar (rollback DB, reservasi tak tersentuh)", async () => {
    const { fn, calls } = mockFetch([
      { status: 409, body: { error: { code: 'CONFLICT', message: 'Stok buku habis.' } } },
    ]);
    await expect(checkoutReservation({ fetchLike: fn }, { reservationId: RES_ID })).rejects.toThrow(
      'Stok buku habis.'
    );
    expect(calls.length).toBe(1);
  });

  it("edge gate kelayakan -> 409 'Anggota memiliki tagihan denda belum lunas.'", async () => {
    const { fn } = mockFetch([
      {
        status: 409,
        body: {
          error: { code: 'CONFLICT', message: 'Anggota memiliki tagihan denda belum lunas.' },
        },
      },
    ]);
    await expect(checkoutReservation({ fetchLike: fn }, { reservationId: RES_ID })).rejects.toThrow(
      'Anggota memiliki tagihan denda belum lunas.'
    );
  });

  it("edge reservasi belum ready -> 409 'Reservasi belum siap diambil (status bukan ready).'", async () => {
    const { fn } = mockFetch([
      {
        status: 409,
        body: {
          error: { code: 'CONFLICT', message: 'Reservasi belum siap diambil (status bukan ready).' },
        },
      },
    ]);
    await expect(checkoutReservation({ fetchLike: fn }, { reservationId: RES_ID })).rejects.toThrow(
      'Reservasi belum siap diambil'
    );
  });

  it('edge migrasi 0024 belum jalan -> 500 dengan pesan deploy migrasi', async () => {
    const { fn } = mockFetch([
      {
        status: 500,
        body: {
          error: {
            code: 'SAVE_FAILED',
            message: 'Fungsi checkout_reservation_tx belum terdeploy. Jalankan migrasi 0024.',
          },
        },
      },
    ]);
    await expect(checkoutReservation({ fetchLike: fn }, { reservationId: RES_ID })).rejects.toThrow(
      'checkout_reservation_tx belum terdeploy'
    );
  });

  it('edge double-klik -> hanya 1 checkout (klik kedua diabaikan saat in-flight)', async () => {
    const { fn, calls } = mockFetch([
      { status: 201, body: { data: { loan: { id: 'loan-1' }, reservation: { id: RES_ID } } } },
    ]);
    const input = { reservationId: RES_ID };
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
    expect(calls.length).toBe(1);
  });

  it('retry aman: transaksi DB atomik - klien tak pernah kirim DELETE/kompensasi', async () => {
    const { fn, calls } = mockFetch([
      { status: 201, body: { data: { loan: { id: 'loan-7' }, reservation: { id: RES_ID } } } },
    ]);
    await checkoutReservation({ fetchLike: fn }, { reservationId: RES_ID });
    expect(calls.some((c) => (c.init?.method ?? '').toUpperCase() === 'DELETE')).toBe(false);
    expect(calls.filter((c) => c.url.includes('/checkout')).length).toBe(1);
  });
});
