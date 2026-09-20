// US-02: Reservasi → Pinjam 1-klik (orkestrasi client 2-call).
// Urutan: POST /api/loans dulu, HANYA jika 201 lanjut PUT /api/reservations completed.
// Jika POST gagal: lempar message server persis + JANGAN ubah reservasi.
// KOMPENSASI: tidak ada rollback loan jika PUT gagal — loan tetap tercatat,
// error dilempar + logger.error untuk visibilitas, staff menyelesaikan manual.
// (Rollback loan via DELETE dilarang: DELETE loans hanya admin + hanya
// returned/lost, dan menghapus loan valid merusak stok/audit.)
// IDEMPOTENCY: guard client-side per reservationId (inflight Set, satu tab).
// Guard server-side: PUT reservations completed hanya dari status pending/ready
// (ditolak 409 bila sudah completed — src/app/api/reservations/route.ts),
// sehingga retry setelah PUT-sukses-sebagian aman diulang.

import { logger } from '@/lib/logger';

type FetchLike = (
  url: string,
  init?: RequestInit
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export type CheckoutInput = {
  reservationId: string;
  memberId: string;
  bookId: string;
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
    // 1) Buat loan dulu (server: guard member active 422, stok habis 409, due auto +14h).
    const loanRes = await deps.fetchLike('/api/loans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        member_id: input.memberId,
        book_id: input.bookId,
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      }),
    });
    const loanJson = (await loanRes.json().catch(() => ({}))) as {
      data?: unknown;
    };
    if (!loanRes.ok || loanRes.status !== 201) {
      throw new Error(serverMessage(loanJson));
    }

    // 2) HANYA jika loan 201: tandai reservasi completed (server menulis
    // activity_logs "reservations.completed" via writeLog di PUT).
    const putRes = await deps.fetchLike(`/api/reservations?id=${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    });
    const putJson = (await putRes.json().catch(() => ({}))) as {
      data?: unknown;
    };
    if (!putRes.ok) {
      const detail = serverMessage(putJson);
      const loanId = (loanJson as { data?: { id?: string } }).data?.id ?? 'tak-dikenal';
      logger.error(
        `[US-02] loan dibuat tetapi reservasi ${key} gagal completed — selesaikan manual.`,
        {
          detail,
        }
      );
      throw new Error(`${detail} (loan ${loanId} perlu rekonsiliasi manual)`);
    }

    return { loan: loanJson.data ?? null, reservation: putJson.data ?? null };
  } finally {
    inflight.delete(key);
  }
}
