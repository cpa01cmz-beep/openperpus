/**
 * src/lib/validation/fine.ts — Fine entity validation.
 * Extracted from validation.ts (barrel shim at index.ts).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(v: unknown): boolean {
  return typeof v === 'string' && UUID_RE.test(v);
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

export const fineSchema = makeSchema(validateFine);
