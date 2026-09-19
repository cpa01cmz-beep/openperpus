/**
 * src/lib/validation.ts — shared validation for all entities (Keandalan & Pengujian).
 * Dependency-free (no zod): vitest node-safe, zero imports.
 * Rules mirror inline validation across API routes; replace facade with zod when available.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): boolean {
  return typeof v === 'string' && UUID_RE.test(v);
}

/** Returns an error message, or null when valid. partial=true validates only present fields. */
export function validateBook(b: Record<string, unknown>, partial = false): string | null {
  if (!partial || b.title !== undefined) {
    if (typeof b.title !== 'string' || !b.title.trim()) return 'title wajib diisi.';
    if (b.title.trim().length < 3) return 'title minimal 3 karakter.';
    if (b.title.length > 500) return 'title maksimal 500 karakter.';
  }
  if (!partial || b.author !== undefined) {
    if (typeof b.author !== 'string' || !b.author.trim())
      return 'author wajib diisi (migrasi NOT NULL).';
  }
  if (
    b.year !== undefined &&
    b.year !== null &&
    (!Number.isInteger(b.year) || (b.year as number) < 1000 || (b.year as number) > 2100)
  ) {
    return 'year harus 1000–2100.';
  }
  if (b.category_id !== undefined && b.category_id !== null && !isUuid(b.category_id))
    return 'category_id harus UUID valid.';
  if (b.rack_id !== undefined && b.rack_id !== null && !isUuid(b.rack_id))
    return 'rack_id harus UUID valid.';
  if (
    b.stock_total !== undefined &&
    (!Number.isInteger(b.stock_total) || (b.stock_total as number) < 0)
  )
    return 'stock_total minimal 0.';
  if (
    b.stock_available !== undefined &&
    (!Number.isInteger(b.stock_available) || (b.stock_available as number) < 0)
  ) {
    return 'stock_available tidak boleh negatif.';
  }
  if (
    b.pages !== undefined &&
    b.pages !== null &&
    (!Number.isInteger(b.pages) || (b.pages as number) <= 0)
  )
    return 'pages harus > 0.';
  return null;
}

const MEMBER_STATUSES = ['active', 'suspended', 'expired', 'pending'] as const;

export function validateMember(m: Record<string, unknown>, partial = false): string | null {
  if (!partial || m.user_id !== undefined) {
    if (!isUuid(m.user_id)) return 'user_id wajib UUID valid (profiles.id).';
  }
  if (!partial || m.member_code !== undefined) {
    if (typeof m.member_code !== 'string' || !m.member_code.trim())
      return 'member_code wajib diisi.';
    if (m.member_code.length > 50) return 'member_code maksimal 50 karakter.';
  }
  if (m.phone !== undefined && m.phone !== null) {
    if (typeof m.phone !== 'string') return 'phone harus string atau null.';
    if (m.phone.length > 30) return 'phone maksimal 30 karakter.';
  }
  if (m.address !== undefined && m.address !== null) {
    if (typeof m.address !== 'string') return 'address harus string atau null.';
    if (m.address.length > 500) return 'address maksimal 500 karakter.';
  }
  if (m.status !== undefined) {
    if (
      typeof m.status !== 'string' ||
      !MEMBER_STATUSES.includes(m.status as (typeof MEMBER_STATUSES)[number])
    )
      return 'status harus: active|suspended|expired|pending.';
  }
  if (m.join_date !== undefined && m.join_date !== null) {
    const d = new Date(m.join_date as string);
    if (Number.isNaN(d.getTime())) return 'join_date tidak valid (ISO 8601).';
  }
  return null;
}

const LOAN_STATUSES = ['borrowed', 'returned', 'overdue', 'lost'] as const;

export function validateLoan(l: Record<string, unknown>, partial = false): string | null {
  if (!partial || l.book_id !== undefined) {
    if (!isUuid(l.book_id)) return 'book_id wajib UUID valid.';
  }
  if (!partial || l.member_id !== undefined) {
    if (!isUuid(l.member_id)) return 'member_id wajib UUID valid.';
  }
  if (l.borrowed_at !== undefined) {
    const d = new Date(l.borrowed_at as string);
    if (Number.isNaN(d.getTime())) return 'borrowed_at tidak valid (ISO 8601).';
  }
  if (l.due_at !== undefined) {
    const d = new Date(l.due_at as string);
    if (Number.isNaN(d.getTime())) return 'due_at tidak valid (ISO 8601).';
  }
  if (l.returned_at !== undefined && l.returned_at !== null) {
    const d = new Date(l.returned_at as string);
    if (Number.isNaN(d.getTime())) return 'returned_at tidak valid (ISO 8601).';
  }
  if (l.status !== undefined) {
    if (
      typeof l.status !== 'string' ||
      !LOAN_STATUSES.includes(l.status as (typeof LOAN_STATUSES)[number])
    )
      return 'status harus: borrowed|returned|overdue|lost.';
  }
  if (l.fine_amount !== undefined) {
    if (typeof l.fine_amount !== 'number' || l.fine_amount < 0) return 'fine_amount minimal 0.';
  }
  if (l.notes !== undefined && l.notes !== null) {
    if (typeof l.notes !== 'string') return 'notes harus string atau null.';
    if (l.notes.length > 2000) return 'notes maksimal 2000 karakter.';
  }
  return null;
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

const FINE_STATUSES = ['unpaid', 'partial', 'paid', 'waived'] as const;

export function validateFine(f: Record<string, unknown>, partial = false): string | null {
  if (!partial || f.loan_id !== undefined) {
    if (!isUuid(f.loan_id)) return 'loan_id wajib UUID valid.';
  }
  if (!partial || f.member_id !== undefined) {
    if (!isUuid(f.member_id)) return 'member_id wajib UUID valid.';
  }
  if (!partial || f.amount !== undefined) {
    if (typeof f.amount !== 'number' || f.amount < 0) return 'amount minimal 0.';
  }
  if (f.paid_amount !== undefined) {
    if (typeof f.paid_amount !== 'number' || f.paid_amount < 0) return 'paid_amount minimal 0.';
  }
  if (f.status !== undefined) {
    if (
      typeof f.status !== 'string' ||
      !FINE_STATUSES.includes(f.status as (typeof FINE_STATUSES)[number])
    )
      return 'status harus: unpaid|partial|paid|waived.';
  }
  if (f.issued_at !== undefined) {
    const d = new Date(f.issued_at as string);
    if (Number.isNaN(d.getTime())) return 'issued_at tidak valid (ISO 8601).';
  }
  if (f.paid_at !== undefined && f.paid_at !== null) {
    const d = new Date(f.paid_at as string);
    if (Number.isNaN(d.getTime())) return 'paid_at tidak valid (ISO 8601).';
  }
  if (f.notes !== undefined && f.notes !== null) {
    if (typeof f.notes !== 'string') return 'notes harus string atau null.';
    if (f.notes.length > 2000) return 'notes maksimal 2000 karakter.';
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

export const bookSchema = makeSchema(validateBook);
export const memberSchema = makeSchema(validateMember);
export const loanSchema = makeSchema(validateLoan);
export const reservationSchema = makeSchema(validateReservation);
export const fineSchema = makeSchema(validateFine);
