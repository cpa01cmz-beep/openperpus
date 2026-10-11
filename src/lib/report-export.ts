/**
 * Definisi ekspor CSV seluruh-data (issue #78) — dipakai endpoint
 * GET /api/reports/export dan tombol "Ekspor seluruh data" di admin.
 *
 * Masalah yang diselesaikan: ExportCsvButton lama hanya mengekspor baris
 * halaman AKTIF (10-20 baris) dari client, sehingga pengguna mengira itu
 * laporan penuh. Modul ini memisahkan bagian MURNI (kolom + mapper + chunk)
 * dari pengambilan data supaya bisa diuji tanpa Supabase.
 */

import { toCSV, type CsvCell } from './csv-export';
import { effectiveLoanStatus } from './loans-overdue';

/** BOM UTF-8 — Excel di Windows butuh BOM untuk merender huruf non-ASCII. */
export const CSV_BOM = '\uFEFF';

/** Baris per chunk `range()` — di bawah batas max_rows PostgREST. */
export const EXPORT_CHUNK = 1000;

/** Pengaman loop ekspor: maksimal jumlah chunk (50 × 1000 = 50.000 baris). */
export const EXPORT_MAX_CHUNKS = 50;

export const REPORT_SCOPES = ['books', 'loans', 'fines'] as const;
export type ReportScope = (typeof REPORT_SCOPES)[number];

export function isReportScope(v: unknown): v is ReportScope {
  return typeof v === 'string' && (REPORT_SCOPES as readonly string[]).includes(v);
}

type Row = Record<string, unknown>;

interface BookExportRow {
  id: string;
  title: string | null;
  author: string | null;
  categories: { name: string } | null;
  stock_available: number | null;
  stock_total: number | null;
}

interface LoanExportRow {
  id: string;
  borrowed_at: string | null;
  due_at: string | null;
  status: string | null;
  fine_amount: number | null;
  members: { member_code: string } | null;
  books: { title: string } | null;
}

interface FineExportRow {
  id: string;
  amount: number | null;
  paid_amount: number | null;
  status: string | null;
  issued_at: string | null;
  members: { member_code: string } | null;
  payments: { receipt_no: string | null }[] | null;
}

export type ScopeDef = {
  /** Tabel Supabase sumber. */
  table: string;
  /** Nama file dasar (tanpa tanggal). */
  filename: string;
  /** Kolom select — HEADS UP: sama dengan kolom yang dipakai mapper. */
  select: string;
  /** Kolom ORDER BY wajib deterministik supaya range() stabil. */
  order: string;
  headers: string[];
  row: (r: Row) => CsvCell[];
};

const num = (v: unknown): number => Number(v ?? 0) || 0;

/** Header CSV (dengan BOM) — satu baris kolom + CRLF, tanpa baris data. */
export function headerLine(headers: string[]): string {
  return CSV_BOM + toCSV(headers, []) + '\r\n';
}

/** Offset range() untuk chunk ke-n (0-based). */
export function chunkRange(chunkIndex: number, perChunk = EXPORT_CHUNK): [number, number] {
  const from = Math.max(0, chunkIndex) * perChunk;
  return [from, from + perChunk - 1];
}

/**
 * Definisi per scope. Kolom CSV sengaja SAMA dengan ekspor halaman-aktif
 * yang sudah ada di admin supaya pengguna tidak perlu memetakan ulang.
 */
export const REPORTS: Record<ReportScope, ScopeDef> = {
  books: {
    table: 'books',
    filename: 'buku.csv',
    select: 'id,title,author,categories(name),stock_available,stock_total',
    order: 'created_at',
    headers: ['ID', 'Judul', 'Penulis', 'Kategori', 'Tersedia', 'Total'],
    row: (r: Row) => {
      const b = r as unknown as BookExportRow;
      return [
        b.id,
        b.title ?? '',
        b.author ?? '',
        b.categories?.name ?? '',
        b.stock_available ?? 0,
        b.stock_total ?? 0,
      ];
    },
  },
  loans: {
    table: 'loans',
    filename: 'peminjaman.csv',
    select: 'id,borrowed_at,due_at,status,fine_amount,members(member_code),books(title)',
    order: 'borrowed_at',
    headers: ['ID', 'Anggota', 'Buku', 'Pinjam', 'Tempo', 'Status', 'Denda'],
    row: (r: Row) => {
      const l = r as unknown as LoanExportRow;
      return [
        l.id,
        l.members?.member_code ?? '',
        l.books?.title ?? '',
        l.borrowed_at ?? '',
        l.due_at ?? '',
        effectiveLoanStatus({ status: l.status, due_at: l.due_at }),
        l.fine_amount ?? 0,
      ];
    },
  },
  fines: {
    table: 'fines',
    filename: 'denda.csv',
    select: 'id,amount,paid_amount,status,issued_at,members(member_code),payments(receipt_no)',
    order: 'issued_at',
    headers: ['ID', 'Anggota', 'Tagihan', 'Dibayar', 'Status', 'No. struk', 'Terbit'],
    row: (r: Row) => {
      const f = r as unknown as FineExportRow;
      const payments = f.payments ?? [];
      return [
        f.id,
        f.members?.member_code ?? '',
        num(f.amount),
        num(f.paid_amount),
        f.status ?? '',
        payments.length > 0 ? (payments[payments.length - 1]?.receipt_no ?? '') : '',
        f.issued_at ?? '',
      ];
    },
  },
};
