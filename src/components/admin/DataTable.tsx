'use client';

import type { CSSProperties, ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

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
        className="kartu p-8 text-center text-sm text-ink/70 rounded-[var(--radius-lg)]"
      >
        {emptyText}
      </div>
    );
  }
  return (
    <div className="kartu overflow-x-auto rounded-[var(--radius-lg)] border border-rule bg-[var(--surface)]">
      <table className="w-full min-w-[640px] text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 z-20">
          <tr className="kartu-kop bg-[var(--surface)] text-ink/70">
            {showBulk && (
              <th
                scope="col"
                className="sticky left-0 z-10 bg-[var(--surface)] py-3 pl-7 pr-4 font-medium"
              >
                <input
                  type="checkbox"
                  aria-label="Pilih semua baris"
                  checked={allChecked}
                  onChange={() => onToggleAll?.()}
                  className="h-5 w-5 accent-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
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
                className={`py-3 pr-4 font-data text-xs font-medium uppercase tracking-[0.08em] ${
                  ci === 0 && !showBulk ? 'sticky left-0 z-10 bg-[var(--surface)] pl-7' : 'pl-4'
                }`}
              >
                {c.sortable && onSort ? (
                  <button
                    type="button"
                    onClick={() => onSort(c.key)}
                    aria-label={`Urutkan berdasarkan ${c.header}${sortKey === c.key ? (sortDir === 'asc' ? ' (naik)' : ' (turun)') : ''}`}
                    className="inline-flex min-h-[44px] items-center gap-1 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    {c.header}
                    <span aria-hidden="true" className="opacity-70">
                      {sortKey === c.key ? (
                        sortDir === 'asc' ? (
                          <ArrowUp className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowDown className="h-3.5 w-3.5" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3.5 w-3.5" />
                      )}
                    </span>
                  </button>
                ) : (
                  c.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        {/* Batang: rod vertikal menembus tiap baris — sel pertama ber-gutter pl-7. */}
        <tbody className="batang relative">
          {rows.map((row, i) => {
            const rk = getRowKey(row, i);
            return (
              <tr
                key={rk}
                className="riffle hover:bg-brand-soft/50"
                style={{ ['--i' as never]: i } as CSSProperties}
              >
                {showBulk && (
                  <td className="sticky left-0 z-10 bg-[var(--surface)] py-3 pl-7 pr-4 align-top">
                    <input
                      type="checkbox"
                      aria-label={bulkLabel ? bulkLabel(rk) : `Pilih baris ${rk}`}
                      checked={selectedKeys?.has(rk) ?? false}
                      onChange={() => onToggleRow?.(rk)}
                      className="h-5 w-5 accent-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    />
                  </td>
                )}
                {columns.map((c, ci) => (
                  <td
                    key={c.key}
                    className={`py-3 align-top ${ci === 0 && !showBulk ? 'sticky left-0 z-10 bg-[var(--surface)] pl-7 pr-4' : 'px-4'}`}
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
