/* ============================================================
 * src/lib/types.ts — tipe + helper MURNI, aman untuk client bundle.
 * NOL impor server (tanpa next/headers, tanpa supabase).
 * Client Components WAJIB impor tipe/helper dari sini, BUKAN dari
 * @/lib/books (yang menarik next/headers via server.ts dan
 * merusak production build).
 * @/lib/books me-re-export semuanya agar halaman server tak berubah.
 * ============================================================ */

export type LibrarySettings = {
  id: number;
  name: string | null;
  tagline: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  operational_hours: OperationalHour[] | null;
  socials: Record<string, string> | null;
  welcome_text: string | null;
  vision: string | null;
  mission: string | null;
  about: string | null;
  seo_title: string | null;
  seo_desc: string | null;
  announcement: string | null;
  active_theme: string;
};

export type OperationalHour = {
  day: string;
  open: string | null;
  close: string | null;
};

export type OperationalHourInput = {
  hari?: unknown;
  day?: unknown;
  buka?: unknown;
  open?: unknown;
  tutup?: unknown;
  close?: unknown;
};

export function normalizeOperationalHour(h: unknown): OperationalHour | null {
  if (!h || typeof h !== 'object') return null;
  const r = h as OperationalHourInput;
  const day = [r.day, r.hari].find((v) => typeof v === 'string' && v.trim());
  if (!day) return null;
  const pick = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
  return {
    day: (day as string).trim(),
    open: pick(r.open ?? r.buka),
    close: pick(r.close ?? r.tutup),
  };
}

export function normalizeOperationalHours(v: unknown): OperationalHour[] {
  if (!Array.isArray(v)) return [];
  const out: OperationalHour[] = [];
  for (const h of v) {
    const n = normalizeOperationalHour(h);
    if (n) out.push(n);
  }
  return out;
}

export type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  cover_url: string | null;
};

export type Book = {
  id: string;
  title: string;
  slug: string;
  author: string | null;
  publisher: string | null;
  year: number | null;
  isbn: string | null;
  category_id: string | null;
  rack_id: string | null;
  cover_url: string | null;
  description: string | null;
  pages: number | null;
  language: string | null;
  stock_total: number;
  stock_available: number;
  featured: boolean;
  rating_avg: number | null;
  created_at?: string;
  updated_at?: string | null;
  categories?: { id: string; name: string; slug: string } | null;
  racks?: { code: string; name: string; location: string | null } | null;
};

export type Banner = {
  id: string;
  title: string;
  subtitle: string | null;
  image_url: string;
  link: string | null;
  sort_order: number;
};

export type Article = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content_md: string | null;
  cover_url: string | null;
  category: string | null;
  published_at: string | null;
  views: number;
};

export type Testimonial = {
  id: string;
  name: string;
  role: string | null;
  content: string;
  avatar_url: string | null;
  rating: number;
};

export type PageDoc = {
  id: string;
  slug: string;
  title: string;
  content_md: string | null;
  excerpt: string | null;
  updated_at?: string | null;
};

export type FetchBooksOpts = {
  featured?: boolean;
  limit?: number;
  categoryId?: string;
  search?: string;
};

export const FALLBACK_SETTINGS: LibrarySettings = {
  id: 1,
  name: 'Perpustakaan Digital',
  tagline: 'Membaca, Meminjam, Tumbuh Bersama',
  logo_url: null,
  favicon_url: null,
  address: 'Alamat perpustakaan akan tampil di sini setelah diisi admin.',
  phone: null,
  email: null,
  operational_hours: [
    { day: 'Senin – Jumat', open: '08:00', close: '16:00' },
    { day: 'Sabtu', open: '09:00', close: '12:00' },
  ],
  socials: {},
  welcome_text: null,
  vision: null,
  mission: null,
  about: null,
  seo_title: null,
  seo_desc: null,
  announcement: null,
  active_theme: 'emerald',
};

/* ---------- formatter domain buku: kanonis di domain-format.ts (murni, tanpa I/O).
 * Re-export agar 19 importer tak berubah. ---------- */
export {
  stockState,
  ratingNumber,
  coerceRating,
  normalizeBook,
  normalizeBooks,
} from './domain-format';
