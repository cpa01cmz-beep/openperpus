'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { Category } from '@/lib/types';
import CatalogControls, { type CatalogSortKey } from './CatalogControls';

type Props = {
  categories: Pick<Category, 'id' | 'name' | 'slug'>[];
  perPage?: number;
  initialQ?: string;
  initialCategoryId?: string | null;
  initialSort?: CatalogSortKey;
  initialAvailableOnly?: boolean;
  resultCount: number;
  serverTotal: number;
};

const DEFAULT_SORT: CatalogSortKey = 'terbaru';

/** Client interactivity island: filter state + URL sync (?page=&per_page=&q=&kategori=).
 *  Grid + Pagination tetap dirender server oleh CatalogExplorer. */
export default function CatalogExplorerFilters({
  categories,
  perPage = 24,
  initialQ = '',
  initialCategoryId = null,
  initialSort = DEFAULT_SORT,
  initialAvailableOnly = false,
  resultCount,
  serverTotal,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const [q, setQ] = useState(initialQ);
  const [catId, setCatId] = useState<string | null>(initialCategoryId);
  const [sort, setSort] = useState<CatalogSortKey>(initialSort);
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
      sort?: CatalogSortKey;
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

  return (
    <CatalogControls
      q={q}
      onQChange={setQ}
      categories={categories}
      catId={catId}
      onCatChange={(id) => {
        setCatId(id);
        pushUrl({ kategori: id, page: 1 });
      }}
      sort={sort}
      onSortChange={(v) => {
        setSort(v);
        pushUrl({ sort: v, page: 1 });
      }}
      onlyAvailable={onlyAvailable}
      onAvailableChange={(v) => {
        setOnlyAvailable(v);
        pushUrl({ tersedia: v, page: 1 });
      }}
      resultCount={resultCount}
      serverTotal={serverTotal}
    />
  );
}
