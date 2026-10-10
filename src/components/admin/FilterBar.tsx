'use client';

import type { ReactNode } from 'react';
import { RotateCw } from 'lucide-react';

export interface FilterBarSearch {
  id: string;
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
}

export interface FilterBarProps {
  /** Kotak pencarian teks (debounce ditangani pemanggil). */
  search?: FilterBarSearch;
  /** Filter select tambahan (status, metode, dll). */
  children?: ReactNode;
  /** Tombol aksi: ekspor CSV, aksi massal, dll. */
  actions?: ReactNode;
  /** Bila diisi, tombol "Muat ulang" dirender di ujung kanan. */
  onReload?: () => void;
  reloadLabel?: string;
}

/**
 * Baris filter standar panel admin: pencarian + select + aksi/ekspor + muat ulang.
 * Tinggi kontrol 44px (target sentuh mobile), fokus terlihat, label selalu terhubung.
 */
export default function FilterBar({
  search,
  children,
  actions,
  onReload,
  reloadLabel = 'Muat ulang',
}: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-end gap-2 text-sm">
      {search && (
        <div className="grid gap-1">
          <label htmlFor={search.id} className="text-sm font-semibold text-slate-700">
            {search.label}
          </label>
          <input
            id={search.id}
            type="search"
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            placeholder={search.placeholder}
            className="h-11 min-h-[44px] w-full max-w-sm rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 transition hover:border-slate-300 focus:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1"
          />
        </div>
      )}
      {children}
      {actions}
      {onReload && (
        <button
          type="button"
          onClick={onReload}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 font-semibold text-slate-700 transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <RotateCw className="h-4 w-4" aria-hidden="true" />
          {reloadLabel}
        </button>
      )}
    </div>
  );
}
