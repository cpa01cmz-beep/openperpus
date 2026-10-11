'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import { downloadBlob, downloadCSV, toCSV, type CsvCell } from '@/lib/csv-export';
import { errMsg } from '@/lib/admin-errors';
import { formatStamp } from '@/lib/format';
import type { ReportScope } from '@/lib/report-export';

type Props = {
  filename: string;
  headers: string[];
  rows: CsvCell[][];
  /** Scope ekspor seluruh-data server-side (GET /api/reports/export?scope=). */
  scope: ReportScope;
};

/**
 * Nama berkas dari header Content-Disposition server (stempel WIB kanonis,
 * isu #133 item 2) — dukungan bentuk `filename="…"` dan RFC 5987
 * `filename*=UTF-8''…`. Fallback ke nama bertanggal klien bila header absen
 * atau tak terpakai; decodeURIComponent dijaga karena header dari jaringan
 * bisa mengandung percent-encoding rusak (URIError) — ekspor yang SUKSES
 * tidak boleh gagal gara-gara nama berkas. Nama dari header juga tidak
 * dipercaya mentah: hanya basename yang dipakai, karakter kontrol dibuang,
 * dan akhiran `.csv` diwajibkan — header tidak bisa menentukan path/ekstensi
 * berkas yang disimpan pustakawan (sisa review #136/#137).
 */
function filenameFromHeader(header: string | null, fallback: string): string {
  const utf8 = header?.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8?.[1]) {
    try {
      const decoded = decodeURIComponent(utf8[1]).trim();
      if (decoded) {
        const safe = safeDownloadName(decoded);
        if (safe) return safe;
      }
    } catch {
      // percent-encoding rusak — jatuh ke bentuk lain di bawah.
    }
  }
  const match = header?.match(/filename="([^"]*)"|filename=([^;]+)/i);
  const plain = safeDownloadName((match?.[1] ?? match?.[2])?.trim());
  return plain ?? fallback;
}

/**
 * Nama unduhan dari nilai header: ambil basename dulu (seperti browser —
 * `../../buku.csv` jadi `buku.csv`, tanpa artefak `....`), buang karakter
 * kontrol + dot-run di depan, dan wajibkan akhiran `.csv`. Null = nilai tak
 * layak pakai (kosong/whitespace/salah ekstensi) sehingga pemanggil jatuh ke
 * fallback. Spasi & huruf non-ASCII dipertahankan (`laporan pustakawan.csv`).
 */
function safeDownloadName(raw: string | undefined): string | null {
  const base = (raw ?? '').split(/[/\\]/).pop() ?? '';
  const name = base
    .split('')
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code > 0x1f && code !== 0x7f;
    })
    .join('')
    .trim()
    .replace(/^\.+/, '');
  return name.toLowerCase().endsWith('.csv') ? name : null;
}

export default function ExportCsvButton({ filename, headers, rows, scope }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Tanggal lokal (bukan UTC) — ekspor dini hari WIB tidak mendapat tanggal kemarin.
  const stamp = formatStamp();
  const dated = filename.replace(/\.csv$/, `-${stamp}.csv`);

  // Ekspor SELURUH data dari server (streaming CSV) — bukan hanya baris
  // halaman aktif (issue #78). fetch + credentials 'same-origin', BUKAN
  // anchor dengan atribut download: respons error endpoint (401 sesi habis,
  // 422 scope tak dikenal, 500) dulu tersimpan browser sebagai berkas tak
  // terbaca tanpa pesan apa pun. Sekarang error diperiksa SEBELUM blob
  // dibuat: 401 dialihkan ke login, sisanya tampil sebagai pesan (#133).
  async function exportAll() {
    setExporting(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/export?scope=${scope}`, {
        credentials: 'same-origin',
      });
      if (res.status === 401) {
        router.push(`/login?next=${encodeURIComponent(pathname)}`);
        return;
      }
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(errMsg(json, 'Gagal mengekspor seluruh data.'));
      }
      const blob = await res.blob();
      downloadBlob(filenameFromHeader(res.headers.get('content-disposition'), dated), blob);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mengekspor seluruh data.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        loading={exporting}
        onClick={() => void exportAll()}
      >
        Ekspor seluruh data
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setError(null);
          downloadCSV(dated, toCSV(headers, rows));
        }}
      >
        Ekspor halaman ini
      </Button>
      {error && (
        <span role="alert" className="w-full text-sm font-medium text-rose-700">
          {error}
        </span>
      )}
    </>
  );
}
