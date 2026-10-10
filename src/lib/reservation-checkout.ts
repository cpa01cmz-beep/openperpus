// US-02 v2 (issue #73): Reservasi → Pinjam jadi SATU panggilan atomik.
// Dulu: POST /api/loans lalu PUT /api/reservations {status:"completed"} —
// bila PUT gagal, loan tetap tercatat sementara reservasi belum selesai
// (rekonsiliasi manual), dan completed juga bisa dicapai tanpa loan.
// Sekarang: POST /api/reservations/{id}/checkout → RPC checkout_reservation_tx
// (migrasi 0024) mengerjakan lock reservasi+buku, gate kelayakan, insert loan,
// update reservasi dalam SATU transaksi Postgres. Gagal di titik mana pun =
// rollback penuh; retry aman (idempoten bila sudah completed + loan_id).
// Server tetap menolak PUT status=completed langsung (422).
// IDEMPOTENCY: guard client-side per reservationId (inflight Set, satu tab) —
// klik ganda tidak memicu dua checkout.

import { logger } from '@/lib/logger';

type FetchLike = (
  url: string,
  init?: RequestInit
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export type CheckoutInput = {
  reservationId: string;
  notes?: string;
};

export type CheckoutResult = {
  loan: unknown;
  reservation: unknown;
  skipped?: boolean;
};

const inflight = new Set<string>();

export function clearCheckoutInflight(): void {
  inflight.clear();
}

function serverMessage(json: unknown): string {
  const err = (json as { error?: { message?: string } | string } | null | undefined)?.error;
  if (!err) return 'Gagal.';
  return typeof err === 'string' ? err : (err.message ?? 'Gagal.');
}

export async function checkoutReservation(
  deps: { fetchLike: FetchLike },
  input: CheckoutInput
): Promise<CheckoutResult> {
  const key = input.reservationId;
  if (inflight.has(key)) {
    return { loan: null, reservation: null, skipped: true };
  }
  inflight.add(key);
  try {
    const res = await deps.fetchLike(`/api/reservations/${encodeURIComponent(key)}/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input.notes !== undefined ? { notes: input.notes } : {}),
    });
    const json = (await res.json().catch(() => ({}))) as {
      data?: { loan?: unknown; reservation?: unknown };
    };
    if (!res.ok || res.status !== 201) {
      throw new Error(serverMessage(json));
    }
    return { loan: json.data?.loan ?? null, reservation: json.data?.reservation ?? null };
  } catch (e) {
    logger.error(`[US-02] checkout reservasi ${key} gagal.`, {
      detail: (e as Error).message,
    });
    throw e;
  } finally {
    inflight.delete(key);
  }
}
