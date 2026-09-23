/**
 * src/lib/validation/member.ts — Member entity validation.
 * Extracted from validation.ts (barrel shim at index.ts).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(v: unknown): boolean {
  return typeof v === 'string' && UUID_RE.test(v);
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

export const memberSchema = makeSchema(validateMember);
