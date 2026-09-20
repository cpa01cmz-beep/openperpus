'use client';

import Button from '@/components/ui/Button';
import { downloadCSV, toCSV, type CsvCell } from '@/lib/csv-export';

type Props = { filename: string; headers: string[]; rows: CsvCell[][] };

export default function ExportCsvButton({ filename, headers, rows }: Props) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => downloadCSV(filename, toCSV(headers, rows))}
    >
      Ekspor CSV
    </Button>
  );
}
