/* Tipe + helper murni tinggal di @/lib/types (aman client bundle);
 * modul ini me-re-export agar impor lama halaman server tak berubah. */
export type {
  LibrarySettings,
  OperationalHour,
  Category,
  Book,
  Banner,
  Article,
  Testimonial,
  PageDoc,
} from '@/lib/types';
export {
  FALLBACK_SETTINGS,
  stockState,
  ratingNumber,
  normalizeBook,
  normalizeBooks,
  coerceRating,
} from '@/lib/types';

/* ============================================================
 * src/lib/books.ts — SHIM re-ekspor kompatibel (tanpa logika).
 * Logika katalog buku (BOOKS_SELECT, applyBooksSort, fetchBooks*,
 * fetchBookBySlug, fetchCategories) tinggal di ./books/catalog.
 * Kanonis per-domain: settings.ts, banners.ts, articles.ts,
 * testimonials.ts, pages.ts, stats.ts. 13 importer tak berubah.
 * ============================================================ */

/** Identitas perpus — single row id=1 (kanonis di settings.ts, unstable_cache). */
export { fetchSettings, getLibrarySettings, getOperationalHours, getSocials } from './settings';

/** Banner hero aktif (kanonis di banners.ts). */
export { fetchBanners } from './banners';

export const ARTICLES_TAG = 'articles';
export const BANNERS_TAG = 'banners';
export const TESTIMONIALS_TAG = 'testimonials';
export const PAGES_TAG = 'pages';
export const STATS_TAG = 'stats';

export * from './books/catalog';
export { BOOKS_SELECT, BOOKS_LIST_SELECT } from './books/catalog';

/** Artikel published (kanonis di articles.ts). */
export { fetchArticles, fetchArticleBySlug } from './articles';

/** Testimoni aktif (kanonis di testimonials.ts). */
export { fetchTestimonials } from './testimonials';

/** Halaman dinamis aktif (kanonis di pages.ts). */
export { fetchPages, fetchPage } from './pages';

/** Statistik StatsBar (kanonis di stats.ts, RPC get_library_stats). */
export { fetchStats, type LibraryStats } from './stats';
