import { describe, expect, it, vi } from 'vitest';

// Review PR #105 — ekspor yang TIDAK lengkap tidak boleh tampak seperti CSV
// rapi berstatus 200. Kasus yang ditutup di sini:
//   1. batas chunk tercapai + masih ada sisa -> baris penanda + log.warn
//      (dan chunk penentu TIDAK lagi dibuang diam-diam),
//   2. kegagalan baca di tengah stream -> baris penanda (header respons sudah
//      terkirim, jadi penandanya masuk ke badan stream),
//   3. scope books memakai filter is_active selaras aplikasi,
//   4. audit ekspor lewat helper kanonis (metadata.requestId terlacak).

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase),
}));

// Chunk kecil (2 baris, maksimal 2 chunk) supaya kasus batas bisa diuji tanpa
// 50.000 baris di memori.
vi.mock('@/lib/report-export', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/report-export')>();
  return { ...actual, EXPORT_CHUNK: 2, EXPORT_MAX_CHUNKS: 2 };
});

import { GET as EXPORT_GET } from '@/app/api/reports/export/route';
import { EXPORT_CHUNK } from '@/lib/report-export';

type Row = Record<string, unknown>;

let eqCalls: { col: string; val: unknown }[] = [];
let auditRows: Row[] = [];

function installMock(rows: Row[], opts: { failChunk?: number } = {}) {
  eqCalls = [];
  auditRows = [];
  (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
    },
    from: (table: string) => {
      if (table === 'profiles') {
        // requireStaff: satu kali baca profil staf.
        return {
          select: () => ({
            eq: () => ({ single: async () => ({ data: { role: 'admin' }, error: null }) }),
          }),
        };
      }
      const chain: Record<string, unknown> = {};
      let from = 0;
      let to = Number.POSITIVE_INFINITY;
      chain.select = () => chain;
      chain.order = () => chain;
      chain.eq = (col: string, val: unknown) => {
        eqCalls.push({ col, val });
        return chain;
      };
      chain.insert = (row: Row) => {
        auditRows.push(row);
        return Promise.resolve({ data: null, error: null });
      };
      chain.range = (f: number, t: number) => {
        from = f;
        to = t;
        return chain;
      };
      (chain as Record<string, unknown>).then = (res: (v: unknown) => unknown) => {
        const idx = from / EXPORT_CHUNK;
        if (opts.failChunk === idx) {
          return Promise.resolve({ data: null, error: { message: 'db down' }, count: null }).then(
            res
          );
        }
        // Urutan deterministik (ORDER BY id DESC) supaya hasil chunk bisa
        // diprediksi di assert.
        const sorted = [...rows].sort((a, b) => String(b.id).localeCompare(String(a.id)));
        return Promise.resolve({
          data: sorted.slice(from, to + 1),
          error: null,
          count: rows.length,
        }).then(res);
      };
      return chain;
    },
    rpc: async () => ({ data: null, error: null }),
  };
}

const bookRows = (ids: string[]): Row[] =>
  ids.map((id) => ({
    id,
    title: `Judul ${id}`,
    author: `Penulis ${id}`,
    categories: { name: 'Fiksi' },
    stock_available: 1,
    stock_total: 1,
  }));

const csvLines = async (res: Response): Promise<string[]> =>
  (await res.text())
    .replace(/^\uFEFF/, '')
    .split('\r\n')
    .filter((l) => l.length > 0);

describe('#105 ekspor: kegagalan/truncation tidak menyamar jadi sukses', () => {
  it('batas chunk tercapai + masih ada sisa -> baris penanda TIDAK LENGKAP', async () => {
    // 5 baris, chunk 2 -> chunk0+b1, chunk1+b2, lalu chunk penentu masih
    // mengembalikan 1 baris (b1) -> ekspor ditandai tidak lengkap.
    installMock(bookRows(['b1', 'b2', 'b3', 'b4', 'b5']));
    const res = await EXPORT_GET(new Request('http://localhost/api/reports/export?scope=books'));
    expect(res.status).toBe(200);
    const lines = await csvLines(res);
    expect(lines.length, 'header + 4 baris + penanda').toBe(6);
    const ids = lines.slice(1, 5).map((l) => l.split(',')[0]);
    expect(ids, 'hanya 2 chunk pertama yang ditulis').toEqual(['b5', 'b4', 'b3', 'b2']);
    expect(lines[5]).toMatch(/ekspor TIDAK LENGKAP/);
    expect(lines[5]).toContain('batas 4'); // EXPORT_MAX_CHUNKS * EXPORT_CHUNK
    expect(lines[5]).toContain('terunduh 4');
    expect(lines.join('\n')).not.toContain('b1,'); // baris sisa tidak ditulis diam-diam
  });

  it('kegagalan baca di tengah stream -> baris penanda TIDAK LENGKAP', async () => {
    installMock(bookRows(['b1', 'b2', 'b3']), { failChunk: 1 });
    const res = await EXPORT_GET(new Request('http://localhost/api/reports/export?scope=books'));
    expect(res.status).toBe(200); // header sudah terkirim; penandanya di badan
    const lines = await csvLines(res);
    expect(lines.length, 'header + 2 baris + penanda').toBe(4);
    expect(lines.slice(1, 3).map((l) => l.split(',')[0])).toEqual(['b3', 'b2']);
    expect(lines[3]).toMatch(/pembacaan data gagal di tengah proses/);
  });

  it('tabel habis sebelum batas -> TIDAK ada penanda (tanpa false alarm)', async () => {
    installMock(bookRows(['b1', 'b2', 'b3']));
    const res = await EXPORT_GET(new Request('http://localhost/api/reports/export?scope=books'));
    const lines = await csvLines(res);
    expect(lines.length).toBe(4); // header + 3 baris, tanpa penanda
    expect(lines.some((l) => l.startsWith('#'))).toBe(false);
  });

  it('chunk penentu hanya diambil saat chunk terakhir PENUH (tanpa fetch sia-sia)', async () => {
    // 4 baris = tepat 2 chunk penuh, chunk penentu kosong -> tidak ada
    // penanda, tapi query penentu memang dijalankan (bukan chunk yang dibuang).
    installMock(bookRows(['b1', 'b2', 'b3', 'b4']));
    const res = await EXPORT_GET(new Request('http://localhost/api/reports/export?scope=books'));
    const lines = await csvLines(res);
    expect(lines.length, 'header + 4 baris').toBe(5);
    expect(lines.some((l) => l.startsWith('#'))).toBe(false);
  });

  it('scope books menyaring is_active=true; loans/fines tidak', async () => {
    installMock(bookRows(['b1']));
    await EXPORT_GET(new Request('http://localhost/api/reports/export?scope=books'));
    expect(eqCalls, 'books wajib selaras dengan tampilan aplikasi').toContainEqual({
      col: 'is_active',
      val: true,
    });

    eqCalls = [];
    installMock([]);
    await EXPORT_GET(new Request('http://localhost/api/reports/export?scope=loans'));
    expect(eqCalls.filter((e) => e.col === 'is_active')).toEqual([]);
  });

  it('audit ekspor lewat helper kanonis + metadata.requestId terlacak', async () => {
    installMock(bookRows(['b1']));
    const res = await EXPORT_GET(
      new Request('http://localhost/api/reports/export?scope=books', {
        headers: { 'x-request-id': 'req-123' },
      })
    );
    expect(res.status).toBe(200);
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({
      user_id: 'user-1',
      action: 'reports.export',
      entity_type: 'reports',
      entity_id: 'books',
    });
    expect((auditRows[0] as { metadata: { requestId?: string } }).metadata.requestId).toBe(
      'req-123'
    );
  });
});
