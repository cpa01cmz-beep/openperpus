import { BookX } from 'lucide-react';
import type { Book, Category } from '@/lib/types';
import type { CatalogSortKey } from './CatalogControls';
import CatalogExplorerFilters from './CatalogExplorerFilters';
import CatalogGrid from './CatalogGrid';
import Pagination from '@/components/ui/Pagination';

type SortKey = CatalogSortKey;

const DEFAULT_SORT: SortKey = 'terbaru';

type Props = {
  books: Book[];
  categories: Pick<Category, 'id' | 'name' | 'slug'>[];
  total?: number;
  page?: number;
  perPage?: number;
  initialQ?: string;
  initialCategoryId?: string | null;
  initialSort?: SortKey;
  initialAvailableOnly?: boolean;
};

/** Explorer katalog server composer: Grid + Pagination SSR, filter sebagai client island.
 *  Grid dirender server tanpa client JS; interaktivitas (search/chips/sort/URL)
 *  tinggal di CatalogExplorerFilters -> CatalogControls. */
export default function CatalogExplorer({
  books,
  categories,
  total,
  page = 1,
  perPage = 24,
  initialQ = '',
  initialCategoryId = null,
  initialSort = DEFAULT_SORT,
  initialAvailableOnly = false,
}: Props) {
  const serverTotal = total ?? books.length;
  const totalPages = Math.max(1, Math.ceil(serverTotal / perPage));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const basePath = '/katalog';

  const hrefForPage = (p: number) => {
    const sp = new URLSearchParams();
    const needle = initialQ.trim();
    if (needle) sp.set('q', needle);
    if (initialCategoryId) sp.set('kategori', initialCategoryId);
    if (initialSort !== 'terbaru') sp.set('sort', initialSort);
    if (initialAvailableOnly) sp.set('tersedia', '1');
    sp.set('page', String(Math.min(totalPages, Math.max(1, p))));
    sp.set('per_page', String(perPage));
    return `${basePath}?${sp.toString()}`;
  };

  const resetHref = `${basePath}?page=1&per_page=${perPage}`;

  return (
    <div className="space-y-4">
      <CatalogExplorerFilters
        categories={categories}
        perPage={perPage}
        initialQ={initialQ}
        initialCategoryId={initialCategoryId}
        initialSort={initialSort}
        initialAvailableOnly={initialAvailableOnly}
        resultCount={books.length}
        serverTotal={serverTotal}
      />

      {/*
        grid-cols-2 base: grid 2 kolom mulai 360px, tanpa scroll horizontal.
        Kontrol sentuh min-h-[44px] tinggal di CatalogControls.
      */}
      {books.length > 0 ? (
        <CatalogGrid books={books} />
      ) : (
        <div className="grid place-items-center rounded-[var(--radius-lg)] border border-dashed border-[var(--ink)]/10 bg-[var(--surface)] px-6 py-14 text-center">
          <BookX className="h-10 w-10 text-[var(--ink)]/25" aria-hidden="true" />
          <h2 className="mt-3 font-heading text-lg font-bold text-[var(--ink)]">
            Tidak ada buku yang cocok
          </h2>
          <p className="mt-1 max-w-sm text-sm text-[var(--ink)]/60">
            Coba kata kunci lain, ubah kategori, atau matikan filter “hanya yang tersedia”.
          </p>
          <a
            href={resetHref}
            className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-[var(--radius-lg)] bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Atur ulang filter
          </a>
        </div>
      )}

      <Pagination page={safePage} totalPages={totalPages} hrefForPage={hrefForPage} />
    </div>
  );
}
