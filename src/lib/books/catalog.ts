import { unstable_cache } from 'next/cache';
import { createPublicClient as createClient } from '@/lib/supabase/public';
import { sanitizeIlike } from '@/lib/search';
import type { FetchBooksOpts as BaseFetchBooksOpts } from '@/lib/types';
import type { Book, Category } from '@/lib/types';
import { normalizeBook, normalizeBooks } from '@/lib/types';

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

/** Kolom select buku + relasi kategori & rak — dipakai fetchBooks(Uncached), fetchBooksPaged(Uncached), fetchBookBySlug(Uncached). */
export const BOOKS_SELECT =
  'id,title,slug,author,publisher,year,isbn,category_id,rack_id,cover_url,description,pages,language,stock_total,stock_available,featured,rating_avg,created_at,updated_at,categories(id,name,slug),racks(code,name,location)';

/** Select sempit untuk daftar publik/kartu: tanpa description (hemat payload list).
 *  Detail buku (fetchBookBySlug) + SEO/sitemap (updated_at) tetap memakai BOOKS_SELECT penuh. */
export const BOOKS_LIST_SELECT =
  'id,title,slug,author,publisher,year,isbn,category_id,rack_id,cover_url,pages,language,stock_total,stock_available,featured,rating_avg,created_at,updated_at,categories(id,name,slug),racks(code,name,location)';

/** Ambil objek pertama bila relasi datang sebagai array (bentuk join Supabase). */
function firstObj(v: unknown): Record<string, unknown> | null {
  const item: unknown = Array.isArray(v) ? (v as unknown[])[0] : v;
  return item !== null && typeof item === 'object' ? (item as Record<string, unknown>) : null;
}

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function strOrEmpty(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** Ubah satu baris BOOKS_SELECT menjadi Book kanonis:
 *  relasi array -> objek tunggal + rating_avg via normalizeBook. */
function toBook(row: Record<string, unknown>): Book {
  const cat = firstObj(row.categories);
  const rak = firstObj(row.racks);
  return normalizeBook({
    id: strOrEmpty(row.id),
    title: strOrEmpty(row.title),
    slug: strOrEmpty(row.slug),
    author: strOrNull(row.author),
    publisher: strOrNull(row.publisher),
    year: typeof row.year === 'number' ? row.year : null,
    isbn: strOrNull(row.isbn),
    category_id: strOrNull(row.category_id),
    rack_id: strOrNull(row.rack_id),
    cover_url: strOrNull(row.cover_url),
    description: strOrNull(row.description),
    pages: typeof row.pages === 'number' ? row.pages : null,
    language: strOrNull(row.language),
    stock_total: typeof row.stock_total === 'number' ? row.stock_total : 0,
    stock_available: typeof row.stock_available === 'number' ? row.stock_available : 0,
    featured: row.featured === true,
    rating_avg: row.rating_avg,
    created_at: strOrNull(row.created_at) ?? undefined,
    updated_at: strOrNull(row.updated_at),
    categories: cat
      ? { id: strOrEmpty(cat.id), name: strOrEmpty(cat.name), slug: strOrEmpty(cat.slug) }
      : null,
    racks: rak
      ? {
          code: strOrEmpty(rak.code),
          name: strOrEmpty(rak.name),
          location: strOrNull(rak.location),
        }
      : null,
  });
}

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
    let query = supabase.from('books').select(BOOKS_LIST_SELECT).eq('is_active', true);

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
    return normalizeBooks(((data ?? []) as Record<string, unknown>[]).map(toBook));
  } catch {
    return [];
  }
}

/** Katalog server-paginated: .range(from,to) + count exact (katalog UI butuh total pasti). */
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
      .select(BOOKS_LIST_SELECT, { count: 'exact' })
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
    return {
      books: normalizeBooks(((data ?? []) as Record<string, unknown>[]).map(toBook)),
      total: count ?? 0,
    };
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
    return toBook(data as Record<string, unknown>);
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
