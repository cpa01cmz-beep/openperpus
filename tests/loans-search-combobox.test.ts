import { describe, expect, it, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sanitizeIlike } from '@/lib/search';

// US-01: Search-as-you-type server-side untuk dropdown Admin Sirkulasi.
// Form /admin/peminjaman harus bisa memilih anggota ke-21+ dan buku ke-25+
// via pencarian server (GET /api/members?q=&per_page=10, GET /api/books?q=).
// RED: "@/components/admin/SearchCombobox" belum ada -> import FAIL.

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(handler: (url: string) => unknown) {
  const fn = vi.fn(async (input: unknown) => handler(String(input)) as Response);
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('US-01 loans search combobox', () => {
  it('happy anggota ke-21+: GET /api/members?q=SULHI&per_page=10 -> opsi AG-025-SULHI', async () => {
    const { fetchSearchOptions } = await import('@/components/admin/SearchCombobox');
    const seen: string[] = [];
    stubFetch((url) => {
      seen.push(url);
      return {
        ok: true,
        json: async () => ({
          data: [{ id: 'm-25', member_code: 'AG-025-SULHI', profiles: { full_name: 'Sulhi' } }],
        }),
      };
    });
    const opts = await fetchSearchOptions('members', 'SULHI');
    expect(seen).toHaveLength(1);
    const u = new URL(seen[0] as string, 'http://localhost');
    expect(u.pathname).toBe('/api/members');
    expect(u.searchParams.get('q')).toBe('SULHI');
    expect(u.searchParams.get('per_page')).toBe('10');
    expect(opts).toEqual([{ id: 'm-25', label: 'Sulhi', sub: 'AG-025-SULHI' }]);
  });

  it('happy buku ke-25+: GET /api/books?q=Go Lanjut&per_page=10 -> opsi + stok', async () => {
    const { fetchSearchOptions } = await import('@/components/admin/SearchCombobox');
    stubFetch(() => ({
      ok: true,
      json: async () => ({
        data: [{ id: 'b-25', title: 'Go Lanjut', stock_available: 3 }],
      }),
    }));
    const opts = await fetchSearchOptions('books', 'Go Lanjut');
    expect(opts).toEqual([{ id: 'b-25', label: 'Go Lanjut', stock: 3 }]);
  });

  it('edge: q liar disanitasi + q kosong tanpa fetch + pesan kosong', async () => {
    const { fetchSearchOptions, EMPTY_TEXT } = await import('@/components/admin/SearchCombobox');
    const seen: string[] = [];
    const spy = stubFetch((url) => {
      seen.push(url);
      return { ok: true, json: async () => ({ data: [] }) };
    });
    const wild = '100%_();DROP';
    await fetchSearchOptions('members', wild);
    expect(seen).toHaveLength(1);
    const sent = new URL(seen[0] as string, 'http://localhost').searchParams.get('q') ?? '';
    expect(sent).toBe(sanitizeIlike(wild));
    expect(sent).not.toMatch(/[%_();,[\]\\]/);
    // q kosong: tanpa fetch, opsi kosong
    vi.clearAllMocks();
    const empty = await fetchSearchOptions('books', '   ');
    expect(empty).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
    // pesan kosong observabel
    expect(EMPTY_TEXT).toBe('Tidak ditemukan — coba kata kunci lain.');
  });

  it('edge race a->ab->abc: hanya hasil terakhir yang dipakai (stale dibuang)', async () => {
    const { createSearchSession } = await import('@/components/admin/SearchCombobox');
    const resolvers = new Map<string, () => void>();
    stubFetch((raw) => {
      const q = new URL(raw, 'http://localhost').searchParams.get('q') ?? '';
      return new Promise((resolve) =>
        resolvers.set(q, () =>
          resolve({
            ok: true,
            json: async () => ({
              data: [
                { id: `m-${q}`, member_code: `AG-${q}`, profiles: { full_name: `Nama ${q}` } },
              ],
            }),
          })
        )
      );
    });
    const session = createSearchSession();
    const p1 = session.search('members', 'a');
    const p2 = session.search('members', 'ab');
    const p3 = session.search('members', 'abc');
    (resolvers.get('abc') as () => void)();
    (resolvers.get('ab') as () => void)();
    (resolvers.get('a') as () => void)();
    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    expect(r1).toBeNull();
    expect(r2).toBeNull();
    expect(r3?.[0]?.sub).toBe('AG-abc');
  });

  it('regresi checkout CONC-01: LoanForm pakai SearchCombobox + validasi + POST /api/loans', () => {
    const src = read('src/components/admin/LoanForm.tsx');
    expect(src.includes('SearchCombobox'), 'LoanForm harus me-render SearchCombobox').toBe(true);
    expect(src.includes('<select'), '2 <select> statis harus sudah diganti').toBe(false);
    expect(src.includes('Pilih anggota.')).toBe(true);
    expect(src.includes('Pilih buku.')).toBe(true);
    expect(src.includes('Stok buku habis.')).toBe(true);
    expect(src.includes('/api/loans')).toBe(true);
  });

  it('a11y + debounce: combobox/listbox/option + aria-expanded + AbortController + 300ms', () => {
    const src = read('src/components/admin/SearchCombobox.tsx');
    for (const s of [
      'role="combobox"',
      'role="listbox"',
      'role="option"',
      'aria-expanded',
      'AbortController',
      '300',
    ]) {
      expect(src.includes(s), `SearchCombobox harus memuat ${s}`).toBe(true);
    }
  });
});
