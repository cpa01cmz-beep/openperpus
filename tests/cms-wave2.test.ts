import { describe, expect, it, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase),
}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

import {
  resetMockDb,
  installMockSupabase,
  setTable,
  setAuthUser,
  jsonReq,
  req,
  errCode,
} from './helpers/supabase-mock';

import { GET as SVC_GET, POST as SVC_POST } from '@/app/api/services/route';
import { POST as PAGE_POST, PUT as PAGE_PUT } from '@/app/api/pages/route';
import { toNavItems } from '@/lib/menus';

function readSrc(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

beforeEach(() => {
  resetMockDb();
  installMockSupabase();
});

// ---------------------------------------------------------------------------
// 1. services API — pola mock coverage-api-crud (setTable/setAuthUser +
//    mock '@/lib/supabase/server' createClient + mock next/cache di atas).
// ---------------------------------------------------------------------------
describe('wave2: GET /api/services publik', () => {
  it('200 tanpa login (mock tabel services list)', async () => {
    setAuthUser(null);
    setTable('services', {
      list: { data: [{ id: 's1', title: 'Layanan A', is_active: true }], count: 1 },
    });
    const res = await SVC_GET(req('/api/services'));
    expect(res.status).toBe(200);
    const j = (await res.json()) as { data: unknown[]; pagination: { total: number } };
    expect(j.data).toHaveLength(1);
    expect(j.pagination.total).toBe(1);
  });
});

describe('wave2: POST /api/services guard + validasi', () => {
  it('tanpa login -> 401/403 (guard requireStaff)', async () => {
    setAuthUser(null);
    const res = await SVC_POST(jsonReq('POST', '/api/services', { title: 'X' }));
    expect([401, 403]).toContain(res.status);
  });

  it('invalid icon -> 422 (staf login)', async () => {
    const res = await SVC_POST(
      jsonReq('POST', '/api/services', { title: 'Layanan Baru', icon: 'rocket-bogus' })
    );
    expect(res.status).toBe(422);
    expect(await errCode(res)).toBe('VALIDATION');
  });

  it('staf login + mock insert -> 201', async () => {
    const res = await SVC_POST(
      jsonReq('POST', '/api/services', {
        title: 'Layanan Baru',
        description: 'Deskripsi singkat.',
        icon: 'book',
        urutan: '1',
      })
    );
    expect(res.status).toBe(201);
    const j = (await res.json()) as { data: { id: string; title: string } };
    expect(j.data.id).toBeDefined();
    expect(j.data.title).toBe('Layanan Baru');
  });
});

// ---------------------------------------------------------------------------
// 2. pages reserved slug — slug sistem ditolak 422 dengan pesan rute sistem.
// ---------------------------------------------------------------------------
describe('wave2: pages reserved slug', () => {
  it("POST title 'Tentang' (slug 'tentang') -> 422 + /rute sistem/", async () => {
    const res = await PAGE_POST(
      jsonReq('POST', '/api/pages', { title: 'Tentang', content_md: 'Isi halaman.' })
    );
    expect(res.status).toBe(422);
    const j = (await res.json()) as { error: { message: string } };
    expect(j.error.message).toMatch(/rute sistem/);
  });

  it("POST slug eksplisit 'layanan' -> 422 + /rute sistem/", async () => {
    const res = await PAGE_POST(
      jsonReq('POST', '/api/pages', {
        title: 'Judul Bebas',
        content_md: 'Isi halaman.',
        slug: 'layanan',
      })
    );
    expect(res.status).toBe(422);
    const j = (await res.json()) as { error: { message: string } };
    expect(j.error.message).toMatch(/rute sistem/);
  });

  it("PUT slug 'kontak' -> 422", async () => {
    const res = await PAGE_PUT(
      jsonReq('PUT', '/api/pages?id=p1', { title: 'Judul Aman', slug: 'kontak' })
    );
    expect(res.status).toBe(422);
    const j = (await res.json()) as { error: { message: string } };
    expect(j.error.message).toMatch(/rute sistem/);
  });
});

// ---------------------------------------------------------------------------
// 3. sitemap — string assert saja.
//     Alasan: memanggil sitemap() mengeksekusi fetchBooks/fetchArticles/
//     fetchPages (network + next/cache + env Supabase) sehingga hasilnya
//     nondeterministik di unit; yang dijaga wave2 adalah keberadaan filter
//     RESERVED_SLUGS agar halaman dinamis tak menduplikat rute statis.
// ---------------------------------------------------------------------------
describe('wave2: sitemap memfilter slug reserved (string assert)', () => {
  it('src/app/sitemap.ts mengandung filter RESERVED_SLUGS', () => {
    const src = readSrc('src/app/sitemap.ts');
    expect(src).toContain('RESERVED_SLUGS');
    expect(src).toContain('!(RESERVED_SLUGS as readonly string[]).includes(p.slug)');
  });
});

// ---------------------------------------------------------------------------
// 4. menus show_in_menu — appendMenuPages tidak diekspor, jadi perilaku
//    integrasinya dijaga via string assert; toNavItems (diekspor, murni)
//    diuji langsung sebagai unit.
//    fetchMenuPages tidak diuji via mock supabase public di sini: rantai
//    query + cachedFetch/unstable_cache membuatnya rapuh sebagai unit;
//    string assert di bawah jujur mendokumentasikan kontrak yang dijaga.
// ---------------------------------------------------------------------------
describe('wave2: toNavItems (unit murni)', () => {
  it('memetakan label/url + normalisasi target', () => {
    const items = toNavItems([
      {
        id: 'm1',
        label: ' Beranda ',
        url: ' / ',
        position: 'header',
        parent_id: null,
        sort_order: 0,
        is_active: true,
        target: '_blank',
      },
      {
        id: 'm2',
        label: 'Katalog',
        url: '/katalog',
        position: 'header',
        parent_id: null,
        sort_order: 1,
        is_active: true,
        target: null,
      },
    ]);
    expect(items).toEqual([
      { href: '/', label: 'Beranda', target: '_blank' },
      { href: '/katalog', label: 'Katalog', target: '_self' },
    ]);
  });

  it('mengabaikan baris tanpa label/url', () => {
    const items = toNavItems([
      {
        id: 'm1',
        label: '   ',
        url: '/x',
        position: 'header',
        parent_id: null,
        sort_order: 0,
        is_active: true,
        target: null,
      },
      {
        id: 'm2',
        label: 'Ok',
        url: '  ',
        position: 'header',
        parent_id: null,
        sort_order: 0,
        is_active: true,
        target: null,
      },
    ]);
    expect(items).toEqual([]);
  });
});

describe('wave2: menus show_in_menu digabung via fetchMenuPages (string assert, jujur)', () => {
  it('src/lib/menus.ts memakai fetchMenuPages dan prefix /halaman/', () => {
    const src = readSrc('src/lib/menus.ts');
    expect(src).toContain('fetchMenuPages');
    expect(src).toContain('/halaman/');
  });
});

// ---------------------------------------------------------------------------
// 5. layanan publik — dirender dinamis dari DB, bukan konstanta statis.
// ---------------------------------------------------------------------------
describe('wave2: halaman /layanan dinamis', () => {
  it('tidak memakai DEFAULT_SERVICES dan memanggil fetchServices', () => {
    const src = readSrc('src/app/(public)/layanan/page.tsx');
    expect(src).not.toContain('DEFAULT_SERVICES');
    expect(src).toContain('fetchServices');
  });
});

// ---------------------------------------------------------------------------
// 6. migrasi 0021 — tabel services + RLS + 4 seed.
// ---------------------------------------------------------------------------
describe('wave2: migrasi 0021_services.sql', () => {
  it('ada CREATE TABLE services + RLS + 4 seed title', () => {
    const sql = readSrc('supabase/migrations/0021_services.sql');
    expect(sql).toContain('CREATE TABLE');
    expect(sql).toContain('services');
    expect(sql).toContain('ROW LEVEL SECURITY');
    for (const title of [
      'Peminjaman & Pengembalian',
      'Katalog Daring (OPAC)',
      'Keanggotaan',
      'Reservasi & Antrean',
    ]) {
      expect(sql.includes(title), `seed title hilang: ${title}`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 7. manifest — PWA dinamis dari settings + tema aktif.
// ---------------------------------------------------------------------------
describe('wave2: manifest dinamis', () => {
  it('async + fetchSettings + theme_color dinamis', () => {
    const src = readSrc('src/app/manifest.ts');
    expect(src).toContain('async function manifest');
    expect(src).toContain('fetchSettings');
    expect(src).toMatch(/getTheme|tokens\.brand/);
    expect(src).toContain('theme_color');
  });
});

// ---------------------------------------------------------------------------
// 8. admin guard — layout memakai predikat staf kanonis.
// ---------------------------------------------------------------------------
describe('wave2: admin layout guard', () => {
  it("src/app/admin/layout.tsx memakai 'isStaffRole'", () => {
    expect(readSrc('src/app/admin/layout.tsx')).toContain('isStaffRole');
  });
});
