import { describe, expect, it, beforeEach, vi } from 'vitest';

// Issue #78 — ekspor CSV SELURUH data (bukan hanya halaman aktif) via
// GET /api/reports/export?scope=books|loans|fines (pustakawan+).

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase),
}));

import {
  resetMockDb,
  installMockSupabase,
  setTable,
  setAuthUser,
  req,
  errCode,
} from './helpers/supabase-mock';

import { GET as EXPORT_GET } from '@/app/api/reports/export/route';
import {
  CSV_BOM,
  EXPORT_CHUNK,
  EXPORT_MAX_CHUNKS,
  REPORTS,
  REPORT_SCOPES,
  chunkRange,
  headerLine,
  isReportScope,
} from '@/lib/report-export';

beforeEach(() => {
  resetMockDb();
  installMockSupabase();
});

describe('#78 guard + validasi scope', () => {
  it('tanpa login -> 401 UNAUTHORIZED', async () => {
    setAuthUser(null);
    const res = await EXPORT_GET(req('/api/reports/export?scope=books'));
    expect(res.status).toBe(401);
    expect(await errCode(res)).toBe('UNAUTHORIZED');
  });

  it('scope kosong -> 422 VALIDATION', async () => {
    const res = await EXPORT_GET(req('/api/reports/export'));
    expect(res.status).toBe(422);
    expect(await errCode(res)).toBe('VALIDATION');
  });

  it('scope tak dikenal -> 422 VALIDATION', async () => {
    const res = await EXPORT_GET(req('/api/reports/export?scope=rahasia'));
    expect(res.status).toBe(422);
    expect(await errCode(res)).toBe('VALIDATION');
  });
});

describe('#78 ekspor books', () => {
  it('200 text/csv + attachment + BOM + header + baris data', async () => {
    setTable('books', {
      list: {
        data: [
          {
            id: 'b1',
            title: 'Laskar Pelangi',
            author: 'Andrea Hirata',
            categories: { name: 'Fiksi' },
            stock_available: 3,
            stock_total: 5,
          },
        ],
        count: 1,
      },
    });
    const res = await EXPORT_GET(req('/api/reports/export?scope=books'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('content-disposition')).toMatch(
      /^attachment; filename="buku-\d{4}-\d{2}-\d{2}\.csv"$/
    );
    expect(res.headers.get('cache-control')).toBe('no-store');

    const text = await res.text();
    expect(text.startsWith(CSV_BOM)).toBe(true);
    const lines = text.replace(CSV_BOM, '').split('\r\n');
    expect(lines[0]).toBe('ID,Judul,Penulis,Kategori,Tersedia,Total');
    expect(lines[1]).toBe('b1,Laskar Pelangi,Andrea Hirata,Fiksi,3,5');
  });

  it('escaping CSV: nilai dengan koma/kutip tidak merusak kolom', async () => {
    setTable('books', {
      list: {
        data: [
          {
            id: 'b2',
            title: 'Buku, "Edisi Khusus"',
            author: null,
            categories: null,
            stock_available: 0,
            stock_total: 1,
          },
        ],
        count: 1,
      },
    });
    const res = await EXPORT_GET(req('/api/reports/export?scope=books'));
    const text = await res.text();
    expect(text.replace(CSV_BOM, '').split('\r\n')[1]).toBe('b2,"Buku, ""Edisi Khusus""",,,0,1');
  });

  it('error DB pada chunk pertama -> 500 FETCH_FAILED (bukan stream rusak)', async () => {
    setTable('books', { list: { data: null, error: { message: 'db down' } } });
    const res = await EXPORT_GET(req('/api/reports/export?scope=books'));
    expect(res.status).toBe(500);
    expect(await errCode(res)).toBe('FETCH_FAILED');
  });
});

describe('#78 ekspor loans + fines', () => {
  it('loans: status pakai definisi turunan (borrowed + tempo lewat -> overdue)', async () => {
    setTable('loans', {
      list: {
        data: [
          {
            id: 'l1',
            borrowed_at: '2026-01-01T00:00:00.000Z',
            due_at: '2026-01-08T00:00:00.000Z',
            status: 'borrowed',
            fine_amount: 0,
            members: { member_code: 'AG-001' },
            books: { title: 'Laskar Pelangi' },
          },
        ],
        count: 1,
      },
    });
    const res = await EXPORT_GET(req('/api/reports/export?scope=loans'));
    expect(res.status).toBe(200);
    const text = await res.text();
    const lines = text.replace(CSV_BOM, '').split('\r\n');
    expect(lines[0]).toBe('ID,Anggota,Buku,Pinjam,Tempo,Status,Denda');
    expect(lines[1]).toBe(
      'l1,AG-001,Laskar Pelangi,2026-01-01T00:00:00.000Z,2026-01-08T00:00:00.000Z,overdue,0'
    );
  });

  it('fines: nominal dinormalkan + kwitansi terbaru dari payments', async () => {
    setTable('fines', {
      list: {
        data: [
          {
            id: 'f1',
            amount: '25000',
            paid_amount: null,
            status: 'partial',
            issued_at: '2026-02-01T00:00:00.000Z',
            members: { member_code: 'AG-002' },
            payments: [{ receipt_no: 'KW-001' }, { receipt_no: null }, { receipt_no: 'KW-003' }],
          },
        ],
        count: 1,
      },
    });
    const res = await EXPORT_GET(req('/api/reports/export?scope=fines'));
    const text = await res.text();
    const lines = text.replace(CSV_BOM, '').split('\r\n');
    expect(lines[0]).toBe('ID,Anggota,Tagihan,Dibayar,Status,No. struk,Terbit');
    expect(lines[1]).toBe('f1,AG-002,25000,0,partial,KW-003,2026-02-01T00:00:00.000Z');
  });
});

describe('#78 helper murni report-export', () => {
  it('isReportScope hanya menerima scope terdaftar', () => {
    expect(isReportScope('books')).toBe(true);
    expect(isReportScope('loans')).toBe(true);
    expect(isReportScope('fines')).toBe(true);
    expect(isReportScope('members')).toBe(false);
    expect(isReportScope(null)).toBe(false);
  });

  it('headerLine membawa BOM + kolom scope + CRLF penutup', () => {
    expect(headerLine(['A', 'B'])).toBe(`${CSV_BOM}A,B\r\n`);
  });

  it('chunkRange berurutan tanpa tumpang tindih', () => {
    expect(chunkRange(0, 1000)).toEqual([0, 999]);
    expect(chunkRange(1, 1000)).toEqual([1000, 1999]);
    expect(chunkRange(2, 1000)).toEqual([2000, 2999]);
  });

  it('konstanta chunk + batas aman loop', () => {
    expect(EXPORT_CHUNK).toBe(1000);
    expect(EXPORT_MAX_CHUNKS).toBe(50);
    expect(REPORT_SCOPES).toEqual(['books', 'loans', 'fines']);
  });

  it('kolom CSV identik dengan ekspor halaman-aktif yang lama di admin', () => {
    // Paritas dengan headers lama: admin/buku, admin/peminjaman, admin/denda.
    expect(REPORTS.books.headers).toEqual([
      'ID',
      'Judul',
      'Penulis',
      'Kategori',
      'Tersedia',
      'Total',
    ]);
    expect(REPORTS.loans.headers).toEqual([
      'ID',
      'Anggota',
      'Buku',
      'Pinjam',
      'Tempo',
      'Status',
      'Denda',
    ]);
    expect(REPORTS.fines.headers).toEqual([
      'ID',
      'Anggota',
      'Tagihan',
      'Dibayar',
      'Status',
      'No. struk',
      'Terbit',
    ]);
  });

  it('mapper books menangani embed kategori null', () => {
    const row = REPORTS.books.row({
      id: 'b9',
      title: null,
      author: null,
      categories: null,
      stock_available: null,
      stock_total: null,
    });
    expect(row).toEqual(['b9', '', '', '', 0, 0]);
  });
});
