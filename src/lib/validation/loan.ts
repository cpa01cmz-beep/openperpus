/**
 * src/lib/validation/loan.ts — Loan entity validation.
 * Extracted from validation.ts (barrel shim at index.ts).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(v: unknown): boolean {
  return typeof v === 'string' && UUID_RE.test(v);
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

export const loanSchema = makeSchema(validateLoan);
