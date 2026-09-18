/**
 * src/lib/validation.ts — shared book validation (T-S1).
 * Dependency-free (no zod): vitest node-safe, no imports.
 * Rules mirror the former inline validateBook in src/app/api/books/route.ts,
 * plus title min 3 chars (required by tests/api/books-crud.test.ts).
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): boolean {
  return typeof v === "string" && UUID_RE.test(v);
}

/** Returns an error message, or null when valid. partial=true validates only present fields. */
export function validateBook(b: Record<string, unknown>, partial = false): string | null {
  if (!partial || b.title !== undefined) {
    if (typeof b.title !== "string" || !b.title.trim()) return "title wajib diisi.";
    if (b.title.trim().length < 3) return "title minimal 3 karakter.";
    if (b.title.length > 500) return "title maksimal 500 karakter.";
  }
  if (!partial || b.author !== undefined) {
    if (typeof b.author !== "string" || !b.author.trim())
      return "author wajib diisi (migrasi NOT NULL).";
  }
  if (
    b.year !== undefined &&
    b.year !== null &&
    (!Number.isInteger(b.year) || (b.year as number) < 1000 || (b.year as number) > 2100)
  ) {
    return "year harus 1000–2100.";
  }
  if (b.category_id !== undefined && b.category_id !== null && !isUuid(b.category_id))
    return "category_id harus UUID valid.";
  if (b.rack_id !== undefined && b.rack_id !== null && !isUuid(b.rack_id))
    return "rack_id harus UUID valid.";
  if (
    b.stock_total !== undefined &&
    (!Number.isInteger(b.stock_total) || (b.stock_total as number) < 0)
  )
    return "stock_total minimal 0.";
  if (
    b.stock_available !== undefined &&
    (!Number.isInteger(b.stock_available) || (b.stock_available as number) < 0)
  ) {
    return "stock_available tidak boleh negatif.";
  }
  if (
    b.pages !== undefined &&
    b.pages !== null &&
    (!Number.isInteger(b.pages) || (b.pages as number) <= 0)
  )
    return "pages harus > 0.";
  return null;
}

export type SafeParseResult =
  | { success: true; data: Record<string, unknown> }
  | { success: false; error: string };

/** Zod-like schema facade over validateBook. */
export const bookSchema = {
  safeParse(input: unknown): SafeParseResult {
    if (typeof input !== "object" || input === null) {
      return { success: false, error: "book harus berupa objek." };
    }
    const err = validateBook(input as Record<string, unknown>);
    if (err) return { success: false, error: err };
    return { success: true, data: input as Record<string, unknown> };
  },
  parse(input: unknown): Record<string, unknown> {
    const r = bookSchema.safeParse(input);
    if (!r.success) throw new Error((r as { error: string }).error);
    return (r as { success: true; data: Record<string, unknown> }).data;
  },
};
