import { describe, expect, it } from 'vitest';

// Isu #76: sweep reservasi expired otomatis (cron + default expiry + guard).
// Murni deterministik: tanpa DB/Docker — now di-inject eksplisit.
import { isCronAuthorized } from '@/lib/cron-sweep';
import {
  RESERVATION_EXPIRY_DAYS,
  resolveReservationExpiresAt,
} from '@/lib/reservation-expiry';

const NOW = new Date('2026-10-01T00:00:00.000Z');

describe('isu #76 sweep reservasi otomatis', () => {
  it('tanpa expires_at (undefined/null/kosong) → default +3 hari dari now', () => {
    expect(RESERVATION_EXPIRY_DAYS).toBe(3);
    expect(resolveReservationExpiresAt(undefined, NOW)).toBe('2026-10-04T00:00:00.000Z');
    expect(resolveReservationExpiresAt(null, NOW)).toBe('2026-10-04T00:00:00.000Z');
    expect(resolveReservationExpiresAt('', NOW)).toBe('2026-10-04T00:00:00.000Z');
  });

  it('eksplisit valid di masa depan → dinormalisasi ISO', () => {
    expect(resolveReservationExpiresAt('2026-10-10T12:00:00.000Z', NOW)).toBe(
      '2026-10-10T12:00:00.000Z'
    );
  });

  it('invalid / kini / masa lalu → throw pesan yang sama dengan gate 422', () => {
    expect(() => resolveReservationExpiresAt('xxx', NOW)).toThrow('expires_at tidak valid.');
    expect(() => resolveReservationExpiresAt('2026-09-01T00:00:00.000Z', NOW)).toThrow(
      'expires_at harus di masa depan.'
    );
    expect(() => resolveReservationExpiresAt('2026-10-01T00:00:00.000Z', NOW)).toThrow(
      'expires_at harus di masa depan.'
    );
  });

  it('guard cron: Bearer cocok → true; salah/hilang/tanpa secret → false', () => {
    expect(isCronAuthorized('Bearer s3cr3t', 's3cr3t')).toBe(true);
    expect(isCronAuthorized('Bearer salah', 's3cr3t')).toBe(false);
    expect(isCronAuthorized(null, 's3cr3t')).toBe(false);
    expect(isCronAuthorized('Bearer s3cr3t', undefined)).toBe(false);
    expect(isCronAuthorized('Bearer s3cr3t', '')).toBe(false);
  });
});
