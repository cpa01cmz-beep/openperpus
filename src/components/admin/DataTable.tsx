'use client';

import type { ReactNode } from 'react';

export type Column<T> = {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
};

type Props<T> = {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T, i: number) => string;
  emptyText?: string;
};

/** DataTable generik untuk panel admin (tanpa dependensi tambahan). */
export default function DataTable<T>({
  columns,
  rows,
  getRowKey,
  emptyText = 'Belum ada data.',
}: Props<T>) {
  if (!rows.length) {
    return (
      <div className="rounded-xl border bg-white p-8 text-center text-sm text-slate-500">
        {emptyText}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border bg-white">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b bg-slate-50 text-slate-500">
            {columns.map((c, ci) => (
              <th
                key={c.key}
                className={`px-4 py-3 font-medium ${ci === 0 ? 'sticky left-0 z-10 bg-slate-50' : ''}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={getRowKey(row, i)} className="border-b last:border-0 hover:bg-slate-50/60">
              {columns.map((c, ci) => (
                <td
                  key={c.key}
                  className={`px-4 py-3 align-top ${ci === 0 ? 'sticky left-0 z-10 bg-white' : ''}`}
                >
                  {c.render
                    ? c.render(row)
                    : String((row as Record<string, unknown>)[c.key] ?? '-')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
