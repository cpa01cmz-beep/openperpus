'use client';

import Button from '@/components/ui/Button';
import { downloadCSV, toCSV, type CsvCell } from '@/lib/csv-export';

type Props = { filename: string; headers: string[]; rows: CsvCell[][] };

export default function ExportCsvButton({ filename, headers, rows }: Props) {
  // Tanggal lokal (bukan UTC) — ekspor dini hari WIB tidak mendapat tanggal kemarin.
  const stamp = new Date().toLocaleDateString('sv-SE');
  const dated = filename.replace(/\.csv$/, `-${stamp}.csv`);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => downloadCSV(dated, toCSV(headers, rows))}
    >
      Ekspor halaman ini
    </Button>
  );
}
