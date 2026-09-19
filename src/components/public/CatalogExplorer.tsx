'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowUpDown, BookX } from 'lucide-react';
import type { Book, Category } from '@/lib/books';
import BookCard from './BookCard';
import CategoryChips from './CategoryChips';
import SearchBar from './SearchBar';
import Pagination from '@/components/ui/Pagination';

type SortKey = 'terbaru' | 'judul' | 'rating' | 'stok';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'terbaru', label: 'Terbaru' },
  { key: 'judul', label: 'Judul A–Z' },
  { key: 'rating', label: 'Rating tertinggi' },
  { key: 'stok', label: 'Stok terbanyak' },
];

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

/** Explorer katalog client: filter via URL (?page=&per_page=&q=&kategori=), slice dari server. */
export default function CatalogExplorer({
  books,
  categories,
  total,
  page = 1,
  perPage = 24,
  initialQ = '',
  initialCategoryId = null,
  initialSort = 'terbaru',
  initialAvailableOnly = false,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const [q, setQ] = useState(initialQ);
  const [catId, setCatId] = useState<string | null>(initialCategoryId);
  const [sort, setSort] = useState<SortKey>(initialSort);
  const [onlyAvailable, setOnlyAvailable] = useState(initialAvailableOnly);

  useEffect(() => {
    setQ(initialQ);
  }, [initialQ]);
  useEffect(() => {
    setCatId(initialCategoryId);
  }, [initialCategoryId]);
  useEffect(() => {
    setSort(initialSort);
  }, [initialSort]);
  useEffect(() => {
    setOnlyAvailable(initialAvailableOnly);
  }, [initialAvailableOnly]);

  const pushUrl = useCallback(
    (next: {
      q?: string;
      kategori?: string | null;
      sort?: SortKey;
      tersedia?: boolean;
      page?: number;
    }) => {
      const sp =
        typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search)
          : new URLSearchParams();
      const curQ = next.q !== undefined ? next.q.trim() : q.trim();
      const curCat = next.kategori !== undefined ? next.kategori : catId;
      const curSort = next.sort ?? sort;
      const curTersedia = next.tersedia ?? onlyAvailable;
      const curPage = next.page ?? 1;
      if (curQ) sp.set('q', curQ);
      else sp.delete('q');
      if (curCat) sp.set('kategori', curCat);
      else sp.delete('kategori');
      if (curSort && curSort !== 'terbaru') sp.set('sort', curSort);
      else sp.delete('sort');
      if (curTersedia) sp.set('tersedia', '1');
      else sp.delete('tersedia');
      sp.set('page', String(curPage));
      sp.set('per_page', String(perPage));
      router.push(`${pathname}?${sp.toString()}`, { scroll: false });
    },
    [router, pathname, q, catId, sort, onlyAvailable, perPage]
  );

  useEffect(() => {
    const needle = q.trim();
    const initial = (initialQ ?? '').trim();
    if (needle === initial) return;
    const t = setTimeout(() => pushUrl({ q: needle, page: 1 }), 400);
    return () => clearTimeout(t);
  }, [q, initialQ, pushUrl]);

  const serverTotal = total ?? books.length;
  const totalPages = Math.max(1, Math.ceil(serverTotal / perPage));
  const safePage = Math.min(Math.max(1, page), totalPages);

  const hrefForPage = useCallback(
    (p: number) => {
      const sp = new URLSearchParams();
      const needle = q.trim();
      if (needle) sp.set('q', needle);
      if (catId) sp.set('kategori', catId);
      if (sort !== 'terbaru') sp.set('sort', sort);
      if (onlyAvailable) sp.set('tersedia', '1');
      sp.set('page', String(Math.min(totalPages, Math.max(1, p))));
      sp.set('per_page', String(perPage));
      return `${pathname}?${sp.toString()}`;
    },
    [q, catId, sort, onlyAvailable, perPage, pathname, totalPages]
  );

  const resetAll = () => {
    setQ('');
    setCatId(null);
    setSort('terbaru');
    setOnlyAvailable(false);
    const sp = new URLSearchParams();
    sp.set('page', '1');
    sp.set('per_page', String(perPage));
    router.push(`${pathname}?${sp.toString()}`, { scroll: false });
  };

  return (
    <div className="space-y-4">
      <SearchBar value={q} onChange={setQ} />

      <CategoryChips
        categories={categories}
        activeId={catId}
        onChange={(id) => {
          setCatId(id);
          pushUrl({ kategori: id, page: 1 });
        }}
      />

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <label
          htmlFor="sort"
          className="flex items-center gap-1.5 text-xs font-medium text-[var(--ink)]/60"
        >
          <ArrowUpDown className="h-3.5 w-3.5" aria-hidden="true" /> Urutkan
        </label>
        <select
          id="sort"
          value={sort}
          onChange={(e) => {
            const v = e.target.value as SortKey;
            setSort(v);
            pushUrl({ sort: v, page: 1 });
          }}
          className="min-h-[44px] rounded-[var(--radius-md)] border border-[var(--ink)]/10 bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] shadow-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        >
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>

        <label className="ml-auto inline-flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-[var(--ink)]/70">
          <input
            type="checkbox"
            checked={onlyAvailable}
            onChange={(e) => {
              setOnlyAvailable(e.target.checked);
              pushUrl({ tersedia: e.target.checked, page: 1 });
            }}
            className="h-5 w-5 shrink-0 rounded accent-brand"
          />
          Hanya yang tersedia
        </label>
      </div>

      <p role="status" aria-live="polite" className="text-xs text-[var(--ink)]/60">
        Menampilkan {books.length} dari {serverTotal} buku
        {q.trim() && (
          <>
            {' '}
            untuk “<span className="font-semibold text-[var(--ink)]/80">{q.trim()}</span>”
          </>
        )}
      </p>

      {books.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
          {books.map((b) => (
            <BookCard key={b.id} book={b} />
          ))}
        </div>
      ) : (
        <div className="grid place-items-center rounded-[var(--radius-lg)] border border-dashed border-[var(--ink)]/10 bg-[var(--surface)] px-6 py-14 text-center">
          <BookX className="h-10 w-10 text-[var(--ink)]/25" aria-hidden="true" />
          <h2 className="mt-3 font-heading text-lg font-bold text-[var(--ink)]">
            Tidak ada buku yang cocok
          </h2>
          <p className="mt-1 max-w-sm text-sm text-[var(--ink)]/60">
            Coba kata kunci lain, ubah kategori, atau matikan filter “hanya yang tersedia”.
          </p>
          <button
            type="button"
            onClick={resetAll}
            className="mt-4 min-h-[44px] rounded-[var(--radius-lg)] bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Atur ulang filter
          </button>
        </div>
      )}

      <Pagination page={safePage} totalPages={totalPages} hrefForPage={hrefForPage} />
    </div>
  );
}
