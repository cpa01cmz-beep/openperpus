'use client';

import Button from '@/components/ui/Button';
import { downloadCSV, toCSV, type CsvCell } from '@/lib/csv-export';

type Props = { filename: string; headers: string[]; rows: CsvCell[][] };

export default function ExportCsvButton({ filename, headers, rows }: Props) {
  const stamp = new Date().toISOString().slice(0, 10);
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
