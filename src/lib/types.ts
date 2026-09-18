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
  hari?: string;
  day?: string;
  buka?: string;
  open?: string;
  tutup?: string;
  close?: string;
};

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
  rating_avg: number | string | null;
  created_at?: string;
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
};

export type FetchBooksOpts = {
  featured?: boolean;
  limit?: number;
  categoryId?: string;
  search?: string;
};

export const FALLBACK_SETTINGS: LibrarySettings = {
  id: 1,
  name: "Perpustakaan Digital",
  tagline: "Membaca, Meminjam, Tumbuh Bersama",
  logo_url: null,
  favicon_url: null,
  address: "Alamat perpustakaan akan tampil di sini setelah diisi admin.",
  phone: null,
  email: null,
  operational_hours: [
    { hari: "Senin – Jumat", buka: "08:00", tutup: "16:00" },
    { hari: "Sabtu", buka: "09:00", tutup: "12:00" },
  ],
  socials: {},
  welcome_text: null,
  vision: null,
  mission: null,
  about: null,
  seo_title: null,
  seo_desc: null,
  announcement: null,
  active_theme: "emerald",
};

/* ---------- formatter kecil dipakai komponen (murni, tanpa I/O) ---------- */

export function stockState(book: Pick<Book, "stock_available" | "stock_total">) {
  const avail = Number(book.stock_available) || 0;
  if (avail <= 0) return { label: "Habis dipinjam", tone: "rose" as const };
  if (avail <= 2) return { label: `Sisa ${avail}`, tone: "amber" as const };
  return { label: `Tersedia · ${avail}`, tone: "emerald" as const };
}

export function ratingNumber(v: Book["rating_avg"]): number {
  const n = typeof v === "string" ? parseFloat(v) : Number(v ?? 0);
  return Number.isFinite(n) ? Math.min(5, Math.max(0, n)) : 0;
}
