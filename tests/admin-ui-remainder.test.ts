import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** Admin UI remainder: server pagination everywhere, DataTable sort/bulk reusable, anggota UX. */
describe('admin UI remainder — server pagination', () => {
  const lists: [string, string][] = [
    ['src/app/admin/peminjaman/page.tsx', '/api/loans'],
    ['src/app/admin/anggota/page.tsx', '/api/members'],
    ['src/app/admin/kategori/page.tsx', '/api/categories'],
    ['src/app/admin/rak/page.tsx', '/api/racks'],
    ['src/app/admin/menu/page.tsx', '/api/menus'],
    ['src/app/admin/artikel/page.tsx', '/api/articles'],
    ['src/app/admin/konten/page.tsx', '/api/pages'],
  ];
  for (const [file, api] of lists) {
    it(`${file} kirim page param ke ${api}`, () => {
      const src = read(file);
      expect(src.includes('page: String(page)'), `${file} harus kirim page param`).toBe(true);
      expect(src.includes('totalPages'), `${file} harus baca totalPages`).toBe(true);
      expect(src.includes('<Pagination'), `${file} harus render Pagination`).toBe(true);
    });
  }
  it('peminjaman tanpa client rows.sort (server sort)', () => {
    const src = read('src/app/admin/peminjaman/page.tsx');
    expect(src.includes('rows.sort(')).toBe(false);
  });
});

describe('admin UI remainder — DataTable sort/bulk reusable', () => {
  it('DataTable dukung sortable headers + bulk selection + caption', () => {
    const src = read('src/components/admin/DataTable.tsx');
    expect(src.includes('sortable')).toBe(true);
    expect(src.includes('aria-sort')).toBe(true);
    expect(src.includes('selectedKeys')).toBe(true);
    expect(src.includes('onToggleAll')).toBe(true);
    expect(src.includes('caption')).toBe(true);
  });
  it('overflow wrapper tidak berubah', () => {
    const src = read('src/components/admin/DataTable.tsx');
    expect(src.includes('overflow-x-auto rounded-xl border bg-white')).toBe(true);
  });
  it('dipakai di 2 lists (peminjaman + anggota)', () => {
    for (const f of ['src/app/admin/peminjaman/page.tsx', 'src/app/admin/anggota/page.tsx']) {
      const src = read(f);
      expect(src.includes('onSort='), `${f} harus pakai onSort`).toBe(true);
      expect(src.includes('selectedKeys='), `${f} harus pakai selectedKeys`).toBe(true);
    }
  });
});

describe('admin UI remainder — anggota UX', () => {
  it('blocked-delete dijelaskan (409 -> pesan pinjaman berjalan)', () => {
    const src = read('src/app/admin/anggota/page.tsx');
    expect(src.includes('409')).toBe(true);
    expect(src.includes('pinjaman berjalan')).toBe(true);
  });
  it('profile picker/search gantikan paste UUID manual', () => {
    const src = read('src/app/admin/anggota/page.tsx');
    expect(src.includes('role="combobox"')).toBe(true);
    expect(src.includes('anggota-profile-search')).toBe(true);
  });
});
