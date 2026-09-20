/* Formatter domain buku (murni, tanpa I/O) — kanonis di sini.
 * types.ts re-export agar 19 importer tak berubah. */

type BookPick = { stock_available: number; stock_total: number; rating_avg?: unknown };

export function stockState(book: Pick<BookPick, 'stock_available' | 'stock_total'>) {
  const avail = Number(book.stock_available) || 0;
  if (avail <= 0) return { label: 'Habis dipinjam', tone: 'rose' as const };
  if (avail <= 2) return { label: `Sisa ${avail}`, tone: 'amber' as const };
  return { label: `Tersedia · ${avail}`, tone: 'emerald' as const };
}

export function ratingNumber(v: BookPick['rating_avg'] | unknown): number {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v ?? 0);
  return Number.isFinite(n) ? Math.min(5, Math.max(0, n)) : 0;
}

export function coerceRating(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > 5) return null;
  return n;
}

export function normalizeBook<T extends { rating_avg?: unknown }>(
  row: T
): Omit<T, 'rating_avg'> & { rating_avg: number | null } {
  const rest = { ...row };
  delete rest.rating_avg;
  return { ...rest, rating_avg: coerceRating(row.rating_avg) };
}

export function normalizeBooks<T extends { rating_avg?: unknown }>(
  rows: T[]
): (Omit<T, 'rating_avg'> & { rating_avg: number | null })[] {
  return rows.map(normalizeBook);
}
