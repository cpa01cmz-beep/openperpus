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
import { FALLBACK_SETTINGS } from '@/lib/types';
import type {
  LibrarySettings,
  Banner,
  Article,
  Testimonial,
  PageDoc,
  Book,
  Category,
} from '@/lib/types';

/* ============================================================
 * src/lib/books.ts — helper data PUBLIK (Server Components)
 * Sumber: Supabase langsung (RLS publik: is_active / published).
 * Semua helper aman-null: gagal fetch -> fallback elegan, UI tak blank.
 * Revalidate 60 ditaruh di tiap page (export const revalidate = 60),
 * bukan di sini, agar reusable di server component mana pun.
 * ============================================================ */

/** Identitas perpus — single row id=1. Fallback elegan bila null/error. */
export async function fetchSettings(): Promise<LibrarySettings> {
  return unstable_cache(() => fetchSettingsUncached(), ['library-settings'], {
    tags: ['settings'],
    revalidate: 60,
  })();
}

async function fetchSettingsUncached(): Promise<LibrarySettings> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('library_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    if (error || !data) return FALLBACK_SETTINGS;
    return { ...FALLBACK_SETTINGS, ...(data as LibrarySettings) };
  } catch {
    return FALLBACK_SETTINGS;
  }
}

/** Banner hero aktif, urut sort_order. */
export async function fetchBanners(): Promise<Banner[]> {
  return unstable_cache(() => fetchBannersUncached(), ['banners'], {
    tags: [BANNERS_TAG],
    revalidate: 60,
  })();
}

async function fetchBannersUncached(): Promise<Banner[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('banners')
      .select('id,title,subtitle,image_url,link,sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .limit(6);
    if (error) return [];
    return (data ?? []) as Banner[];
  } catch {
    return [];
  }
}

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
  'id,title,slug,author,publisher,year,isbn,category_id,rack_id,cover_url,description,pages,language,stock_total,stock_available,featured,rating_avg,created_at,categories(id,name,slug),racks(code,name,location)';

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

/** Artikel published terbaru. */
export async function fetchArticles(limit = 3): Promise<Article[]> {
  return unstable_cache(() => fetchArticlesUncached(limit), ['articles', String(limit)], {
    tags: [ARTICLES_TAG],
    revalidate: 60,
  })();
}

async function fetchArticlesUncached(limit = 3): Promise<Article[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('articles')
      .select('id,title,slug,excerpt,content_md,cover_url,category,published_at,views')
      .eq('status', 'published')
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(limit);
    if (error) return [];
    return (data ?? []) as Article[];
  } catch {
    return [];
  }
}

export async function fetchArticleBySlug(slug: string): Promise<Article | null> {
  return unstable_cache(() => fetchArticleBySlugUncached(slug), ['article-slug', slug], {
    tags: [ARTICLES_TAG],
    revalidate: 60,
  })();
}

async function fetchArticleBySlugUncached(slug: string): Promise<Article | null> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('articles')
      .select('id,title,slug,excerpt,content_md,cover_url,category,published_at,views')
      .eq('slug', slug)
      .eq('status', 'published')
      .maybeSingle();
    if (error || !data) return null;
    return data as Article;
  } catch {
    return null;
  }
}

/** Testimoni aktif. */
export async function fetchTestimonials(limit = 6): Promise<Testimonial[]> {
  return unstable_cache(() => fetchTestimonialsUncached(limit), ['testimonials', String(limit)], {
    tags: [TESTIMONIALS_TAG],
    revalidate: 60,
  })();
}

async function fetchTestimonialsUncached(limit = 6): Promise<Testimonial[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('testimonials')
      .select('id,name,role,content,avatar_url,rating')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .limit(limit);
    if (error) return [];
    return (data ?? []) as Testimonial[];
  } catch {
    return [];
  }
}

/** Daftar halaman dinamis aktif (untuk sitemap /halaman/*). Gagal fetch → fallback []. */
export async function fetchPages(limit = 100): Promise<PageDoc[]> {
  return unstable_cache(() => fetchPagesUncached(limit), ['pages', String(limit)], {
    tags: [PAGES_TAG],
    revalidate: 60,
  })();
}

async function fetchPagesUncached(limit = 100): Promise<PageDoc[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('pages')
      .select('id,slug,title,content_md,excerpt')
      .eq('is_active', true)
      .order('title', { ascending: true })
      .limit(limit);
    if (error) return [];
    return (data ?? []) as PageDoc[];
  } catch {
    return [];
  }
}

/** Halaman dinamis (tentang/layanan/...) by slug. */
export async function fetchPage(slug: string): Promise<PageDoc | null> {
  return unstable_cache(() => fetchPageUncached(slug), ['page-slug', slug], {
    tags: [PAGES_TAG],
    revalidate: 60,
  })();
}

async function fetchPageUncached(slug: string): Promise<PageDoc | null> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('pages')
      .select('id,slug,title,content_md,excerpt')
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle();
    if (error || !data) return null;
    return data as PageDoc;
  } catch {
    return null;
  }
}

/** Angka statistik untuk StatsBar (head-count ringan). */
export async function fetchStats(): Promise<{
  totalBooks: number;
  totalCategories: number;
  totalArticles: number;
  totalCopies: number;
}> {
  return unstable_cache(() => fetchStatsUncached(), ['stats'], {
    tags: [STATS_TAG],
    revalidate: 60,
  })();
}

async function fetchStatsUncached(): Promise<{
  totalBooks: number;
  totalCategories: number;
  totalArticles: number;
  totalCopies: number;
}> {
  try {
    const supabase = createClient();
    const [books, cats, arts, copies] = await Promise.all([
      supabase.from('books').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase
        .from('categories')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true),
      supabase
        .from('articles')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'published'),
      supabase
        .from('books')
        .select('stock_total')
        .eq('is_active', true)
        .order('stock_total', { ascending: false })
        .limit(5000),
    ]);
    const totalCopies =
      copies.data?.reduce(
        (s: number, b: { stock_total?: number | string | null }) =>
          s + (Number(b.stock_total) || 0),
        0
      ) ?? 0;
    return {
      totalBooks: books.count ?? books.data?.length ?? 0,
      totalCategories: cats.count ?? cats.data?.length ?? 0,
      totalArticles: arts.count ?? arts.data?.length ?? 0,
      totalCopies,
    };
  } catch {
    return { totalBooks: 0, totalCategories: 0, totalArticles: 0, totalCopies: 0 };
  }
}
