/** Default masa berlaku reservasi baru (isu #76, migrasi 0026). Murni, tanpa I/O. */

/** Masa berlaku default reservasi baru: +3 hari. */
export const RESERVATION_EXPIRY_DAYS = 3;

/**
 * Samakan dengan DEFAULT DB migrasi 0026: tanpa expires_at (undefined/null/'')
 * → now + 3 hari. Nilai eksplisit tetap divalidasi (ISO + masa depan) dengan
 * pesan error yang sama seperti gate 422 di POST /api/reservations.
 */
export function resolveReservationExpiresAt(raw: unknown, now: Date = new Date()): string {
  if (raw === undefined || raw === null || raw === '') {
    return new Date(now.getTime() + RESERVATION_EXPIRY_DAYS * 86400000).toISOString();
  }
  const d = new Date(raw as string);
  if (Number.isNaN(d.getTime())) throw new Error('expires_at tidak valid.');
  if (d.getTime() <= now.getTime()) throw new Error('expires_at harus di masa depan.');
  return d.toISOString();
}
