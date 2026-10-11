'use client';

import type { ReactNode } from 'react';
import EmptyState from '@/components/ui/EmptyState';

export type Column<T> = {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  sortable?: boolean;
};

export type SortDir = 'asc' | 'desc';

export type TableEmptyState = {
  title: string;
  description?: string;
  action?: ReactNode;
};

type Props<T> = {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T, i: number) => string;
  emptyText?: string;
  /** State kosong kaya (judul + deskripsi + CTA) — dipakai bila ada. */
  emptyState?: TableEmptyState;
  caption?: string;
  sortKey?: string;
  sortDir?: SortDir;
  onSort?: (key: string) => void;
  selectedKeys?: Set<string>;
  onToggleRow?: (key: string) => void;
  onToggleAll?: () => void;
  bulkLabel?: (key: string) => string;
};

/** DataTable generik untuk panel admin (tanpa dependensi tambahan). */
export default function DataTable<T>({
  columns,
  rows,
  getRowKey,
  emptyText = 'Belum ada data.',
  emptyState,
  caption = 'Tabel data admin',
  sortKey,
  sortDir,
  onSort,
  selectedKeys,
  onToggleRow,
  onToggleAll,
  bulkLabel,
}: Props<T>) {
  const showBulk = !!selectedKeys && !!onToggleRow;
  const allChecked =
    showBulk &&
    rows.length > 0 &&
    rows.every((r, i) => selectedKeys?.has(getRowKey(r, i)) ?? false);
  if (!rows.length) {
    if (emptyState) {
      return (
        <EmptyState
          title={emptyState.title}
          description={emptyState.description}
          action={emptyState.action}
        />
      );
    }
    return (
      <div
        role="status"
        className="rounded-xl border bg-surface p-8 text-center text-sm text-slate-500"
      >
        {emptyText}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border bg-white max-w-full">
      <table className="hidden w-full min-w-[640px] text-left text-sm sm:table">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 z-20">
          <tr className="border-b bg-slate-50 text-slate-500">
            {showBulk && (
              <th scope="col" className="sticky left-0 z-10 bg-slate-50 px-4 py-3 font-medium">
                <input
                  type="checkbox"
                  aria-label="Pilih semua baris"
                  checked={allChecked}
                  onChange={() => onToggleAll?.()}
                  className="h-5 w-5 accent-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                />
              </th>
            )}
            {columns.map((c, ci) => (
              <th
                key={c.key}
                scope="col"
                aria-sort={
                  c.sortable && sortKey === c.key
                    ? sortDir === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : undefined
                }
                className={`px-4 py-3 font-medium ${ci === 0 && !showBulk ? 'sticky left-0 z-10 bg-slate-50' : ''}`}
              >
                {c.sortable && onSort ? (
                  <button
                    type="button"
                    onClick={() => onSort(c.key)}
                    aria-label={`Urutkan berdasarkan ${c.header}${sortKey === c.key ? (sortDir === 'asc' ? ' (naik)' : ' (turun)') : ''}`}
                    className="inline-flex min-h-[44px] items-center gap-1 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    {c.header}
                    <span aria-hidden="true">
                      {sortKey === c.key ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                  </button>
                ) : (
                  c.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const rk = getRowKey(row, i);
            return (
              <tr key={rk} className="border-b last:border-0 hover:bg-slate-50/60">
                {showBulk && (
                  <td className="sticky left-0 z-10 bg-white px-4 py-3 align-top">
                    <input
                      type="checkbox"
                      aria-label={bulkLabel ? bulkLabel(rk) : `Pilih baris ${rk}`}
                      checked={selectedKeys?.has(rk) ?? false}
                      onChange={() => onToggleRow?.(rk)}
                      className="h-5 w-5 accent-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    />
                  </td>
                )}
                {columns.map((c, ci) => (
                  <td
                    key={c.key}
                    className={`px-4 py-3 align-top ${ci === 0 ? 'max-w-[220px] truncate' : ''} ${ci === 0 && !showBulk ? 'sticky left-0 z-10 bg-white' : ''}`}
                  >
                    {c.render
                      ? c.render(row)
                      : String((row as Record<string, unknown>)[c.key] ?? '-')}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      <ul className="grid gap-2 p-2 sm:hidden">
        {rows.map((row, i) => {
          const rk = getRowKey(row, i);
          const first = columns[0];
          return (
            <li key={rk} className="rounded-xl border bg-white p-3 text-sm">
              {showBulk && (
                <input
                  type="checkbox"
                  aria-label={bulkLabel ? bulkLabel(rk) : `Pilih baris ${rk}`}
                  checked={selectedKeys?.has(rk) ?? false}
                  onChange={() => onToggleRow?.(rk)}
                  className="mb-2 h-5 w-5 accent-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                />
              )}
              <p className="truncate font-medium">
                {first?.render
                  ? first.render(row)
                  : String((row as Record<string, unknown>)[first?.key ?? ''] ?? '-')}
              </p>
              {columns.slice(1).map((c) => (
                <p key={c.key} className="mt-1 flex items-start justify-between gap-2 text-xs">
                  <span className="shrink-0 text-slate-500">{c.header}</span>
                  <span className="min-w-0 truncate text-right">
                    {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? '-')}
                  </span>
                </p>
              ))}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
