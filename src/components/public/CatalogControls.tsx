'use client';

import { ArrowUpDown } from 'lucide-react';
import type { Category } from '@/lib/types';
import CategoryChips from './CategoryChips';
import SearchBar from './SearchBar';

export type CatalogSortKey = 'terbaru' | 'judul' | 'rating' | 'stok';

export const CATALOG_SORTS: { key: CatalogSortKey; label: string }[] = [
  { key: 'terbaru', label: 'Terbaru' },
  { key: 'judul', label: 'Judul A–Z' },
  { key: 'rating', label: 'Rating tertinggi' },
  { key: 'stok', label: 'Stok terbanyak' },
];

type Props = {
  q: string;
  onQChange: (v: string) => void;
  categories: Pick<Category, 'id' | 'name' | 'slug'>[];
  catId: string | null;
  onCatChange: (id: string | null) => void;
  sort: CatalogSortKey;
  onSortChange: (v: CatalogSortKey) => void;
  onlyAvailable: boolean;
  onAvailableChange: (v: boolean) => void;
  resultCount: number;
  serverTotal: number;
};

/** Client interactivity island: SearchBar + Chips + sort + filter + status. */
export default function CatalogControls({
  q,
  onQChange,
  categories,
  catId,
  onCatChange,
  sort,
  onSortChange,
  onlyAvailable,
  onAvailableChange,
  resultCount,
  serverTotal,
}: Props) {
  return (
    <>
      <SearchBar value={q} onChange={onQChange} />

      <CategoryChips categories={categories} activeId={catId} onChange={onCatChange} />

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
          onChange={(e) => onSortChange(e.target.value as CatalogSortKey)}
          className="min-h-[44px] rounded-[var(--radius-md)] border border-[var(--ink)]/10 bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] shadow-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        >
          {CATALOG_SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>

        <label className="ml-auto inline-flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-[var(--ink)]/70">
          <input
            type="checkbox"
            checked={onlyAvailable}
            onChange={(e) => onAvailableChange(e.target.checked)}
            className="h-5 w-5 shrink-0 rounded accent-brand"
          />
          Hanya yang tersedia
        </label>
      </div>

      <p role="status" aria-live="polite" className="text-xs text-[var(--ink)]/60">
        Menampilkan {resultCount} dari {serverTotal} buku
        {q.trim() && (
          <>
            {' '}
            untuk “<span className="font-semibold text-[var(--ink)]/80">{q.trim()}</span>”
          </>
        )}
      </p>
    </>
  );
}
