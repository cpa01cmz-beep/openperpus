// S-roi11 Wishlist Simpanku — pure client localStorage, tanpa DB/server.
// ponytail: single-device only; upgrade ke tabel DB (wishlists: user_id, book_id)
// + GET/POST /api/wishlist saat sinkron lintas-perangkat dibutuhkan.

export const WISHLIST_KEY = 'openperpus:wishlist:v1';

function storage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    const w = window as unknown as { localStorage?: Storage };
    if (w.localStorage) return w.localStorage;
    const g = globalThis as unknown as { localStorage?: Storage };
    return g.localStorage ?? null;
  } catch {
    return null;
  }
}

function save(list: string[]): void {
  try {
    storage()?.setItem(WISHLIST_KEY, JSON.stringify(list));
  } catch {
    /* abaikan: storage penuh / nonaktif */
  }
}

/** Daftar slug tersimpan; [] bila SSR, kosong, atau JSON korup. */
export function getWishlist(): string[] {
  try {
    const s = storage();
    if (!s) return [];
    const raw = s.getItem(WISHLIST_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string');
  } catch {
    return [];
  }
}

/** True bila slug tersimpan (false di SSR / data korup). */
export function isSaved(slug: string): boolean {
  return getWishlist().includes(slug);
}

/** Toggle slug; kembalikan daftar baru ([] di SSR tanpa storage). */
export function toggleWishlist(slug: string): string[] {
  if (!storage()) return [];
  const current = getWishlist();
  const next = current.includes(slug) ? current.filter((s) => s !== slug) : [...current, slug];
  save(next);
  return next;
}

/** Kosongkan wishlist (no-op di SSR). */
export function clearWishlist(): void {
  try {
    storage()?.removeItem(WISHLIST_KEY);
  } catch {
    /* abaikan */
  }
}
