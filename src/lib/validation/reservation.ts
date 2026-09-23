/**
 * src/lib/validation/reservation.ts — Reservation entity validation.
 * Extracted from validation.ts (barrel shim at index.ts).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(v: unknown): boolean {
  return typeof v === 'string' && UUID_RE.test(v);
}

const RESERVATION_STATUSES = ['pending', 'ready', 'completed', 'cancelled', 'expired'] as const;

export function validateReservation(r: Record<string, unknown>, partial = false): string | null {
  if (!partial || r.book_id !== undefined) {
    if (!isUuid(r.book_id)) return 'book_id wajib UUID valid.';
  }
  if (!partial || r.member_id !== undefined) {
    if (!isUuid(r.member_id)) return 'member_id wajib UUID valid.';
  }
  if (r.status !== undefined) {
    if (
      typeof r.status !== 'string' ||
      !RESERVATION_STATUSES.includes(r.status as (typeof RESERVATION_STATUSES)[number])
    )
      return 'status harus: pending|ready|completed|cancelled|expired.';
  }
  if (r.reserved_at !== undefined) {
    const d = new Date(r.reserved_at as string);
    if (Number.isNaN(d.getTime())) return 'reserved_at tidak valid (ISO 8601).';
  }
  if (r.expires_at !== undefined && r.expires_at !== null) {
    const d = new Date(r.expires_at as string);
    if (Number.isNaN(d.getTime())) return 'expires_at tidak valid (ISO 8601).';
  }
  if (r.notes !== undefined && r.notes !== null) {
    if (typeof r.notes !== 'string') return 'notes harus string atau null.';
    if (r.notes.length > 2000) return 'notes maksimal 2000 karakter.';
  }
  return null;
}

export type SafeParseResult =
  { success: true; data: Record<string, unknown> } | { success: false; error: string };

function makeSchema(validate: (v: Record<string, unknown>, p?: boolean) => string | null) {
  return {
    safeParse(input: unknown, partial = false): SafeParseResult {
      if (typeof input !== 'object' || input === null) {
        return { success: false, error: 'input harus berupa objek.' };
      }
      const err = validate(input as Record<string, unknown>, partial);
      if (err) return { success: false, error: err };
      return { success: true, data: input as Record<string, unknown> };
    },
    parse(input: unknown, partial = false): Record<string, unknown> {
      const r = this.safeParse(input, partial);
      if (!r.success) throw new Error((r as { error: string }).error);
      return (r as { success: true; data: Record<string, unknown> }).data;
    },
  };
}

export const reservationSchema = makeSchema(validateReservation);
