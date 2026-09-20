// S-roi6: Sweep reservasi kedaluwarsa 1-klik (orkestrasi client N-call).
// Kandidat: status pending|ready + expires_at < now(). Baris lain tak tersentuh.
// Sweep: PUT /api/reservations?id= {status:"expired"} per kandidat (server gate
// mengizinkan any->expired). 422/403/offline per-baris: diskip + failure count,
// tanpa membatalkan kandidat valid lain. Non-staff: guard throw, zero mutations.

type FetchLike = (
  url: string,
  init?: RequestInit
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export type SweepableRow = {
  id: string;
  status: string;
  expires_at: string | null;
};

export type SweepCandidate = { id: string };

export type SweepResult = {
  succeeded: number;
  failed: number;
  errors: Array<{ id: string; message: string }>;
};

const SWEEPABLE = new Set(['pending', 'ready']);

function serverMessage(json: unknown): string {
  const err = (json as { error?: { message?: string } | string } | null | undefined)?.error;
  if (!err) return 'Gagal.';
  return typeof err === 'string' ? err : (err.message ?? 'Gagal.');
}

/** AC1: kandidat murni — pending/ready + expires_at < now. Tanpa mutasi input. */
export function findExpiredCandidates<T extends SweepableRow>(
  rows: T[],
  now: Date = new Date()
): T[] {
  const t = now.getTime();
  return rows.filter((r) => {
    if (!SWEEPABLE.has(r.status)) return false;
    if (!r.expires_at) return false;
    const d = new Date(r.expires_at).getTime();
    return !Number.isNaN(d) && d < t;
  });
}

/** AC2+AC3: sweep 1-klik. Guard staff dulu (zero mutations bila non-staff).
 * Konkuren terbatas 5 agar N kandidat tidak serial 1-per-1. */
export async function sweepExpiredReservations(
  deps: { fetchLike: FetchLike; isStaff: boolean },
  input: { candidates: SweepCandidate[] }
): Promise<SweepResult> {
  if (!deps.isStaff) {
    throw new Error('Hanya pustakawan/staff yang boleh menandai kedaluwarsa.');
  }
  const result: SweepResult = { succeeded: 0, failed: 0, errors: [] };
  const CONCURRENCY = 5;
  const queue = [...input.candidates];
  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const c = queue.shift();
      if (!c) return;
      try {
        const res = await deps.fetchLike(`/api/reservations?id=${encodeURIComponent(c.id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'expired' }),
        });
        const json = (await res.json().catch(() => ({}))) as unknown;
        if (!res.ok) {
          result.failed += 1;
          result.errors.push({ id: c.id, message: serverMessage(json) });
          continue;
        }
        result.succeeded += 1;
      } catch (e) {
        result.failed += 1;
        result.errors.push({ id: c.id, message: (e as Error).message });
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, Math.max(queue.length, 1)) }, () => worker())
  );
  return result;
}
