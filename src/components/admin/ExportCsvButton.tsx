'use client';

import Button from '@/components/ui/Button';
import { formatStamp } from '@/lib/format';
import { downloadCSV, toCSV, type CsvCell } from '@/lib/csv-export';
import type { ReportScope } from '@/lib/report-export';

type Props = {
  filename: string;
  headers: string[];
  rows: CsvCell[][];
  /** Scope ekspor seluruh-data server-side (GET /api/reports/export?scope=). */
  scope: ReportScope;
};

export default function ExportCsvButton({ filename, headers, rows, scope }: Props) {
  // Tanggal lokal (bukan UTC) — ekspor dini hari WIB tidak mendapat tanggal kemarin.
  const stamp = formatStamp();
  const dated = filename.replace(/\.csv$/, `-${stamp}.csv`);
  return (
    <>
      {/* Ekspor SELURUH data dari server (streaming CSV) — bukan hanya baris
          halaman aktif (issue #78). Anchor same-origin + download attribute:
          browser mengunduh tanpa pindah halaman. */}
      <a
        href={`/api/reports/export?scope=${scope}`}
        download
        className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-brand/30 bg-white px-3 py-2 text-sm font-semibold text-brand transition hover:border-brand hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        Ekspor seluruh data
      </a>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => downloadCSV(dated, toCSV(headers, rows))}
      >
        Ekspor halaman ini
      </Button>
    </>
  );
}
