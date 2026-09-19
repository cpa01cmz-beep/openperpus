import { describe, expect, it, vi } from 'vitest';

// S-roi6: Sweep reservasi kedaluwarsa 1-klik di meja sirkulasi.
// AC1: banner "Kedaluwarsa N baris" + kandidat, baris lain utuh.
// AC2: PUT /api/reservations?id= {status:expired} per kandidat, 422 diskip + failure count.
// AC3: non-staff / 403 / offline → zero mutations, guard alert, reload no-store.

import { findExpiredCandidates, sweepExpiredReservations } from '@/lib/reservation-sweep';

type Row = { id: string; status: string; expires_at: string | null };

const NOW = new Date('2026-09-19T00:00:00.000Z');
const PAST = '2026-09-01T00:00:00.000Z';
const FUTURE = '2026-10-01T00:00:00.000Z';

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

describe('S-roi6 expiry sweep', () => {
  it('AC1: 3 pending/ready rows expires_at < now() → 3 kandidat, baris lain utuh', () => {
    const rows: Row[] = [
      { id: 'a', status: 'pending', expires_at: PAST },
      { id: 'b', status: 'ready', expires_at: PAST },
      { id: 'c', status: 'pending', expires_at: PAST },
      { id: 'd', status: 'pending', expires_at: FUTURE },
      { id: 'e', status: 'ready', expires_at: null },
    ];
    const out = findExpiredCandidates(rows, NOW);
    expect(out.map((r) => r.id).sort()).toEqual(['a', 'b', 'c']);
    expect(rows).toHaveLength(5);
  });

  it('AC1: status final (completed/cancelled/expired) walau lewat expires_at → bukan kandidat', () => {
    const rows: Row[] = [
      { id: 'x', status: 'completed', expires_at: PAST },
      { id: 'y', status: 'cancelled', expires_at: PAST },
      { id: 'z', status: 'expired', expires_at: PAST },
    ];
    expect(findExpiredCandidates(rows, NOW)).toEqual([]);
  });

  it('AC2: sweep PUT /api/reservations?id= {status:expired} per kandidat → semua expired', async () => {
    const { fn, calls } = mockFetch([
      { status: 200, body: { data: { id: 'a', status: 'expired' } } },
      { status: 200, body: { data: { id: 'b', status: 'expired' } } },
      { status: 200, body: { data: { id: 'c', status: 'expired' } } },
    ]);
    const res = await sweepExpiredReservations(
      { fetchLike: fn, isStaff: true },
      { candidates: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }
    );
    expect(calls).toHaveLength(3);
    expect(calls[0]!.url).toBe('/api/reservations?id=a');
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ status: 'expired' });
    expect(res.succeeded).toBe(3);
    expect(res.failed).toBe(0);
  });

  it('AC2: invalid 422 diskip dengan failure count, yang valid tetap expired', async () => {
    const { fn, calls } = mockFetch([
      { status: 200, body: { data: { id: 'a', status: 'expired' } } },
      {
        status: 422,
        body: { error: { code: 'VALIDATION', message: 'Transisi status tidak diizinkan.' } },
      },
    ]);
    const res = await sweepExpiredReservations(
      { fetchLike: fn, isStaff: true },
      { candidates: [{ id: 'a' }, { id: 'bad' }] }
    );
    expect(calls).toHaveLength(2);
    expect(res.succeeded).toBe(1);
    expect(res.failed).toBe(1);
    expect(res.errors).toHaveLength(1);
  });

  it('AC3: non-staff sweep → zero mutations + guard error (alert via guard)', async () => {
    const { fn, calls } = mockFetch([
      { status: 200, body: { data: { id: 'a', status: 'expired' } } },
    ]);
    await expect(
      sweepExpiredReservations({ fetchLike: fn, isStaff: false }, { candidates: [{ id: 'a' }] })
    ).rejects.toThrow(/pustakawan|staff/i);
    expect(calls).toHaveLength(0);
  });

  it('AC3: API 403 / offline → zero sukses, gagal dihitung, tanpa mutasi sukses', async () => {
    const { fn: fn403, calls: calls403 } = mockFetch([
      {
        status: 403,
        body: { error: { code: 'FORBIDDEN', message: 'Bukan reservasi milik Anda.' } },
      },
    ]);
    const r403 = await sweepExpiredReservations(
      { fetchLike: fn403, isStaff: true },
      { candidates: [{ id: 'a' }] }
    );
    expect(calls403).toHaveLength(1);
    expect(r403.succeeded).toBe(0);
    expect(r403.failed).toBe(1);

    const offline = vi.fn(async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const rOff = await sweepExpiredReservations(
      { fetchLike: offline, isStaff: true },
      { candidates: [{ id: 'a' }] }
    );
    expect(rOff.succeeded).toBe(0);
    expect(rOff.failed).toBe(1);
  });
});
