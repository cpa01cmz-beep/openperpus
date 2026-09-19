import { unstable_cache } from 'next/cache';
import { createPublicClient as createClient } from '@/lib/supabase/public';
import { sanitizeIlike } from '@/lib/search';
import type { FetchBooksOpts as BaseFetchBooksOpts } from '@/lib/types';

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
export { FALLBACK_SETTINGS, stockState, ratingNumber } from '@/lib/types';
import type { Book, Category } from '@/lib/types';

/* ============================================================
 * src/lib/books.ts — FASADE domain buku + re-ekspor kompatibel.
 * Kanonis per-domain tinggal di modulnya masing-masing:
 * settings.ts, banners.ts, articles.ts, testimonials.ts,
 * pages.ts, stats.ts. Modul ini HANYA berisi logika buku
 * (BOOKS_SELECT, applyBooksSort, fetchBooks*, fetchBookBySlug,
 * fetchCategories) + re-ekspor agar 18 importer tak berubah.
 * S-cache: fetchSettings dibungkus unstable_cache di settings.ts;
 * sanitizeIlike dipakai di fetchBooksUncached/fetchBooksPagedUncached.
 * ============================================================ */

/** Identitas perpus — single row id=1 (kanonis di settings.ts, unstable_cache). */
export { fetchSettings, getLibrarySettings, getOperationalHours, getSocials } from './settings';

/** Banner hero aktif (kanonis di banners.ts). */
export { fetchBanners } from './banners';

export type FetchBooksOpts = BaseFetchBooksOpts & {
  q?: string;
  page?: number;
  perPage?: number;
  sort?: 'terbaru' | 'judul' | 'rating' | 'stok';
  availableOnly?: boolean;
};

export type PagedBooks = { books: Book[]; total: number };

export const BOOKS_TAG = 'books';
export const CATEGORIES_TAG = 'categories';
export const ARTICLES_TAG = 'articles';
export const BANNERS_TAG = 'banners';
export const TESTIMONIALS_TAG = 'testimonials';
export const PAGES_TAG = 'pages';
export const STATS_TAG = 'stats';

/** Kolom select buku + relasi kategori & rak — dipakai fetchBooks(Uncached), fetchBooksPaged(Uncached), fetchBookBySlug(Uncached). */
const BOOKS_SELECT =
  'id,title,slug,author,publisher,year,isbn,category_id,rack_id,cover_url,description,pages,language,stock_total,stock_available,featured,rating_avg,created_at,updated_at,categories(id,name,slug),racks(code,name,location)';

/** Terapkan urutan katalog dari opts.sort — dipakai fetchBooksUncached + fetchBooksPagedUncached. */
function applyBooksSort<Q extends { order(column: string, options?: Record<string, unknown>): Q }>(
  query: Q,
  sort: FetchBooksOpts['sort']
): Q {
  switch (sort ?? 'terbaru') {
    case 'judul':
      return query.order('title', { ascending: true });
    case 'rating':
      return query.order('rating_avg', { ascending: false, nullsFirst: false });
    case 'stok':
      return query.order('stock_available', { ascending: false });
    default:
      return query.order('created_at', { ascending: false });
  }
}

function stableKey(opts: FetchBooksOpts): string {
  return JSON.stringify({
    featured: opts.featured ?? false,
    limit: opts.limit ?? null,
    categoryId: opts.categoryId ?? null,
    search: opts.q ?? opts.search ?? '',
    page: opts.page ?? null,
    perPage: opts.perPage ?? null,
    sort: opts.sort ?? 'terbaru',
    availableOnly: opts.availableOnly ?? false,
  });
}

/** Daftar buku aktif + relasi kategori & rak (tanpa N+1). */
export async function fetchBooks(opts: FetchBooksOpts = {}): Promise<Book[]> {
  return unstable_cache(() => fetchBooksUncached(opts), ['books', stableKey(opts)], {
    tags: [BOOKS_TAG],
    revalidate: 60,
  })();
}

async function fetchBooksUncached(opts: FetchBooksOpts): Promise<Book[]> {
  try {
    const supabase = createClient();
    const needle = sanitizeIlike(opts.q ?? opts.search ?? '');
    let query = supabase.from('books').select(BOOKS_SELECT).eq('is_active', true);

    query = applyBooksSort(query, opts.sort);

    if (opts.featured) query = query.eq('featured', true);
    if (opts.categoryId) query = query.eq('category_id', opts.categoryId);
    if (opts.availableOnly) query = query.gt('stock_available', 0);
    if (needle) {
      query = query.or(
        `title.ilike.%${needle}%,author.ilike.%${needle}%,publisher.ilike.%${needle}%,isbn.ilike.%${needle}%`
      );
    }
    if (opts.page && opts.perPage) {
      const page = Math.max(1, Math.floor(opts.page));
      const perPage = Math.min(100, Math.max(1, Math.floor(opts.perPage)));
      query = query.range((page - 1) * perPage, page * perPage - 1);
    } else if (opts.limit) {
      query = query.limit(opts.limit);
    }

    const { data, error } = await query;
    if (error) return [];
    return (data ?? []) as unknown as Book[];
  } catch {
    return [];
  }
}

/** Katalog server-paginated: .range(from,to) + count exact (mirror /api/books). */
export async function fetchBooksPaged(opts: FetchBooksOpts = {}): Promise<PagedBooks> {
  return unstable_cache(() => fetchBooksPagedUncached(opts), ['books-paged', stableKey(opts)], {
    tags: [BOOKS_TAG],
    revalidate: 60,
  })();
}

async function fetchBooksPagedUncached(opts: FetchBooksOpts): Promise<PagedBooks> {
  try {
    const supabase = createClient();
    const page = Math.max(1, Math.floor(opts.page ?? 1));
    const perPage = Math.min(100, Math.max(1, Math.floor(opts.perPage ?? 24)));
    const from = (page - 1) * perPage;
    const to = page * perPage - 1;
    const needle = sanitizeIlike(opts.q ?? opts.search ?? '');

    let query = supabase
      .from('books')
      .select(BOOKS_SELECT, { count: 'exact' })
      .eq('is_active', true);

    query = applyBooksSort(query, opts.sort);

    if (opts.featured) query = query.eq('featured', true);
    if (opts.categoryId) query = query.eq('category_id', opts.categoryId);
    if (opts.availableOnly) query = query.gt('stock_available', 0);
    if (needle) {
      query = query.or(
        `title.ilike.%${needle}%,author.ilike.%${needle}%,publisher.ilike.%${needle}%,isbn.ilike.%${needle}%`
      );
    }

    const { data, error, count } = await query.range(from, to);
    if (error) return { books: [], total: 0 };
    return { books: (data ?? []) as unknown as Book[], total: count ?? 0 };
  } catch {
    return { books: [], total: 0 };
  }
}

/** Detail buku by slug (publik). */
export async function fetchBookBySlug(slug: string): Promise<Book | null> {
  return unstable_cache(() => fetchBookBySlugUncached(slug), ['book-slug', slug], {
    tags: [BOOKS_TAG],
    revalidate: 60,
  })();
}

async function fetchBookBySlugUncached(slug: string): Promise<Book | null> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('books')
      .select(BOOKS_SELECT)
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle();
    if (error || !data) return null;
    return data as unknown as Book;
  } catch {
    return null;
  }
}

/** Kategori aktif untuk chips filter. */
export async function fetchCategories(): Promise<Category[]> {
  return unstable_cache(() => fetchCategoriesUncached(), ['categories'], {
    tags: [CATEGORIES_TAG],
    revalidate: 60,
  })();
}

async function fetchCategoriesUncached(): Promise<Category[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('categories')
      .select('id,name,slug,description,cover_url')
      .eq('is_active', true)
      .order('name', { ascending: true });
    if (error) return [];
    return (data ?? []) as Category[];
  } catch {
    return [];
  }
}

/** Artikel published (kanonis di articles.ts). */
export { fetchArticles, fetchArticleBySlug } from './articles';

/** Testimoni aktif (kanonis di testimonials.ts). */
export { fetchTestimonials } from './testimonials';

/** Halaman dinamis aktif (kanonis di pages.ts). */
export { fetchPages, fetchPage } from './pages';

/** Statistik StatsBar (kanonis di stats.ts, RPC get_library_stats). */
export { fetchStats, type LibraryStats } from './stats';
