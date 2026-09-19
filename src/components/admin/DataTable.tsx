'use client';

import type { ReactNode } from 'react';

export type Column<T> = {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  sortable?: boolean;
};

export type SortDir = 'asc' | 'desc';

type Props<T> = {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T, i: number) => string;
  emptyText?: string;
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
    return (
      <div
        role="status"
        className="rounded-xl border bg-white p-8 text-center text-sm text-slate-500"
      >
        {emptyText}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border bg-white">
      <table className="w-full min-w-[640px] text-left text-sm">
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
                    className={`px-4 py-3 align-top ${ci === 0 && !showBulk ? 'sticky left-0 z-10 bg-white' : ''}`}
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
    </div>
  );
}
