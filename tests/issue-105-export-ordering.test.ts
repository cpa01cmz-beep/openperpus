import { describe, expect, it, vi } from 'vitest';

// Review PR #105 — "non-unique ORDER BY makes range() chunking unstable:
// rows can be dropped or duplicated". Ekspor seluruh data menarik baris
// per-chunk dengan `range()` (offset). Kalau ORDER BY tidak punya tiebreaker
// UNIK, Postgres boleh mengembalikan baris ber-key-sama dalam urutan berbeda
// di tiap eksekusi (offset/rencana berbeda), sehingga chunk yang saling
// bertumpuk bisa mengirim baris yang SAMA dua kali sambil MELEWATKAN baris
// lain — tanpa error apa pun, CSV-nya saja yang salah.

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase),
}));

import { GET as EXPORT_GET } from '@/app/api/reports/export/route';
import { EXPORT_CHUNK, REPORTS, REPORT_SCOPES } from '@/lib/report-export';

type Row = Record<string, unknown>;

/** Setiap .order() yang dikirim route — bukti kontrak ORDER BY. */
let orderCalls: { col: string; ascending: boolean }[] = [];

/** Angka dari id "b<nnn>" — dipakai meniru urutan tie yang bergeser. */
function rowNum(id: string): number {
  return Number(id.replace(/^b/, '')) || 0;
}

/**
 * Mock sadar-urutan: mengurutkan dataset PERSIS seperti yang diminta route,
 * lalu memotongnya dengan range(). Bila route TIDAK mengirim tiebreaker unik,
 * mock meniru Postgres — baris ber-key-sama datang dengan urutan yang
 * BERGESER per query (offset berbeda -> urutan tie boleh berbeda). Dengan
 * tiebreaker `id`, urutan penuh jadi deterministik dan setiap chunk stabil.
 */
function installOrderingMock(rows: Row[], primaryCol: string) {
  orderCalls = [];
  const client = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
    },
    from: (table: string) => {
      if (table === 'profiles') {
        // requireStaff: satu kali baca profil.
        return {
          select: () => ({
            eq: () => ({ single: async () => ({ data: { role: 'admin' }, error: null }) }),
          }),
        };
      }
      const chain: Record<string, unknown> = {};
      let fromIdx = 0;
      let toIdx = Number.POSITIVE_INFINITY;
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.insert = async () => ({ data: null, error: null });
      chain.order = (col: string, opts?: { ascending?: boolean }) => {
        orderCalls.push({ col, ascending: opts?.ascending ?? true });
        return chain;
      };
      chain.range = (f: number, t: number) => {
        fromIdx = f;
        toIdx = t;
        return chain;
      };
      (chain as Record<string, unknown>).then = (res: (v: unknown) => unknown) => {
        const tieStable = orderCalls.some((o) => o.col === 'id');
        const sorted = [...rows].sort((a, b) => {
          const ka = String(a[primaryCol] ?? '');
          const kb = String(b[primaryCol] ?? '');
          if (ka !== kb) return ka < kb ? 1 : -1; // DESC, sama seperti produksi
          if (tieStable) {
            // Tiebreaker UNIK: urutan penuh deterministik -> chunk stabil.
            const ia = String(a.id ?? '');
            const ib = String(b.id ?? '');
            return ia < ib ? 1 : -1;
          }
          // Tanpa tiebreaker: urutan tie bergeser mengikuti offset query ini.
          const shift = Math.floor(Math.max(fromIdx, 0) / EXPORT_CHUNK);
          const na = (rowNum(String(a.id ?? '')) + shift) % rows.length;
          const nb = (rowNum(String(b.id ?? '')) + shift) % rows.length;
          return nb - na;
        });
        return Promise.resolve({
          data: sorted.slice(fromIdx, toIdx + 1),
          error: null,
          count: rows.length,
        }).then(res);
      };
      return chain;
    },
    rpc: async () => ({ data: null, error: null }),
  };
  (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase = client;
}

/** Dua chunk penuh baris yang SEMUANYA ber-key-sama (kasus terburuk). */
const ROWS: Row[] = Array.from({ length: EXPORT_CHUNK * 2 }, (_, i) => {
  const n = String(i + 1).padStart(4, '0');
  return {
    id: `b${n}`,
    title: `Judul ${n}`,
    author: `Penulis ${n}`,
    created_at: '2026-01-01T00:00:00.000Z',
    categories: { name: 'Fiksi' },
    stock_available: 1,
    stock_total: 1,
  };
});

const exportUrl = (scope: string) => `http://localhost/api/reports/export?scope=${scope}`;

describe('#105 ORDER BY deterministik untuk chunking ekspor', () => {
  it('kontrak ScopeDef: kolom utama + tiebreaker UNIK (id) di setiap scope', () => {
    for (const scope of REPORT_SCOPES) {
      const order = REPORTS[scope].order;
      expect(order.length, `${scope}: wajib kolom utama + tiebreaker`).toBeGreaterThan(1);
      expect(order[order.length - 1], `${scope}: tiebreaker wajib kolom UNIK (id)`).toBe('id');
    }
  });

  it('route mengirim ORDER BY utama + id, keduanya DESC', async () => {
    installOrderingMock([ROWS[0] as Row], 'created_at');
    const res = await EXPORT_GET(new Request(exportUrl('books')));
    expect(res.status).toBe(200);
    // hanya satu chunk (1 baris < EXPORT_CHUNK) -> dua .order() terangkat.
    expect(orderCalls.map((o) => o.col)).toEqual(['created_at', 'id']);
    expect(orderCalls.every((o) => o.ascending === false)).toBe(true);
  });

  it('ekspor 2 chunk dengan SEMUA baris ber-key-sama: setiap id muncul TEPAT sekali', async () => {
    installOrderingMock(ROWS, 'created_at');
    const res = await EXPORT_GET(new Request(exportUrl('books')));
    expect(res.status).toBe(200);
    const text = await res.text();
    const lines = text
      .replace(/^\uFEFF/, '')
      .split('\r\n')
      .filter((l) => l.length > 0);
    expect(lines.length, 'header + seluruh baris dataset, tidak kurang tidak lebih').toBe(
      ROWS.length + 1
    );
    const ids = lines.slice(1).map((l) => l.split(',')[0] ?? '');
    expect(new Set(ids).size, 'tidak boleh ada id ganda antar chunk').toBe(ids.length);
    expect([...new Set(ids)].sort()).toEqual(ROWS.map((r) => String(r.id)).sort());
  });

  it('bukti mock TIDAK vacuous: ORDER BY hanya kolom non-unik memang menggandakan/melewatkan baris', async () => {
    // Sanity check untuk test di atas: kalau ORDER BY dikembalikan ke satu
    // kolom non-unik (perilaku sebelum perbaikan), mock yang meniru Postgres
    // harus gagal mempertahankan semua baris. Kalau ini lolos, test ekspor di
    // atas tidak menjaga apa pun.
    installOrderingMock(ROWS, 'created_at');
    const booksDef = REPORTS.books as { order: string[] };
    const original = booksDef.order;
    booksDef.order = ['created_at'];
    try {
      const res = await EXPORT_GET(new Request(exportUrl('books')));
      expect(res.status).toBe(200);
      const ids = (await res.text())
        .replace(/^\uFEFF/, '')
        .split('\r\n')
        .filter((l) => l.length > 0)
        .slice(1)
        .map((l) => l.split(',')[0] ?? '');
      const unique = new Set(ids);
      expect(
        unique.size,
        'ORDER BY non-unik harus terbukti membuat baris hilang berganda'
      ).toBeLessThan(ROWS.length);
      expect(ids.length).toBeGreaterThan(unique.size);
    } finally {
      booksDef.order = original;
    }
  });
});
