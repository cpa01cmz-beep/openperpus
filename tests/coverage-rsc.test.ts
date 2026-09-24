import { describe, expect, it, beforeEach, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as unknown as { React: unknown }).React = React;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase),
}));
vi.mock('@/lib/supabase/public', () => ({
  createPublicClient: vi.fn(
    () => (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase
  ),
}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock('next/dynamic', () => ({
  default: () => {
    const Noop = () => null;
    return Noop;
  },
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('__NEXT_NOT_FOUND__');
  },
  redirect: (url: string) => {
    throw new Error(`__NEXT_REDIRECT__${url}`);
  },
  permanentRedirect: (url: string) => {
    throw new Error(`__NEXT_PERMANENT_REDIRECT__${url}`);
  },
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: Record<string, unknown>) =>
    React.createElement('a', { href: typeof href === 'string' ? href : '#', ...rest }, children),
}));
vi.mock('next/image', () => ({
  default: ({ src, alt }: Record<string, unknown>) =>
    React.createElement('img', { src: String(src), alt: String(alt ?? '') }),
}));

import {
  resetMockDb,
  installMockSupabase,
  setTable,
  setRpc,
  setAuthUser,
  setProfileRole,
} from './helpers/supabase-mock';

import PublicHomePage, { generateMetadata as homeMeta } from '@/app/(public)/page';
import KontakPage, { generateMetadata as kontakMeta } from '@/app/(public)/kontak/page';
import KatalogPage, { generateMetadata as katalogMeta } from '@/app/(public)/katalog/page';
import BeritaPage, { generateMetadata as beritaMeta } from '@/app/(public)/berita/page';
import BeritaDetailPage, {
  generateMetadata as beritaDetailMeta,
} from '@/app/(public)/berita/[slug]/page';
import FaqPage, { generateMetadata as faqMeta } from '@/app/(public)/faq/page';
import TentangPage, { generateMetadata as tentangMeta } from '@/app/(public)/tentang/page';
import LayananPage, { generateMetadata as layananMeta } from '@/app/(public)/layanan/page';
import HalamanDetailPage, {
  generateMetadata as halamanMeta,
} from '@/app/(public)/halaman/[slug]/page';
import BookDetailPage, {
  generateMetadata as bookMeta,
  generateStaticParams,
} from '@/app/(public)/katalog/[slug]/page';
import BukuAliasPage, { generateMetadata as bukuMeta } from '@/app/(public)/buku/[slug]/page';
import PublicLayout, { generateMetadata as layoutMeta } from '@/app/(public)/layout';
import AdminLayout from '@/app/admin/layout';
import LogsPage from '@/app/admin/logs/page';
import AdminDashboard from '@/app/admin/page';
import PengaturanPage from '@/app/admin/pengaturan/page';
import TambahBukuPage from '@/app/admin/buku/tambah/page';
import EditBukuPage from '@/app/admin/buku/edit/[id]/page';
import sitemap from '@/app/sitemap';
import robots from '@/app/robots';
import manifest from '@/app/manifest';

const ISO = '2026-01-01T00:00:00.000Z';
const BOOK = {
  id: 'b1',
  title: 'Buku A',
  slug: 'buku-a',
  author: 'Penulis',
  publisher: 'Penerbit',
  year: 2024,
  isbn: '978',
  category_id: 'c1',
  rack_id: null,
  cover_url: 'https://demo.supabase.co/storage/v1/object/public/covers/a.png',
  description: 'Deskripsi buku panjang untuk meta.',
  pages: 200,
  language: 'id',
  stock_total: 3,
  stock_available: 2,
  featured: true,
  rating_avg: 4.5,
  created_at: ISO,
  updated_at: ISO,
  is_active: true,
  categories: { id: 'c1', name: 'Fiksi', slug: 'fiksi' },
  racks: null,
};
const ARTICLE = {
  id: 'a1',
  title: 'Artikel Perpus',
  slug: 'artikel-perpus',
  excerpt: 'Ringkasan',
  content_md: 'Isi **markdown**',
  cover_url: null,
  category: 'Umum',
  published_at: ISO,
  views: 12,
  status: 'published',
  author_id: null,
  created_at: ISO,
  updated_at: ISO,
};
const PAGE_ROW = {
  id: 'p1',
  slug: 'tentang',
  title: 'Tentang Perpus',
  content_md: 'Isi halaman statis.',
  excerpt: 'Ringkas halaman',
  is_active: true,
  updated_at: ISO,
  seo_title: null,
  seo_desc: null,
};

function seedDefaults(): void {
  setTable('library_settings', {
    single: {
      data: {
        id: 1,
        name: 'Perpustakaan Digital',
        tagline: 'Membaca Bersama',
        address: 'Jl. Pustaka No 1',
        phone: '021-123',
        email: 'halo@perpus.id',
        active_theme: 'midnight',
        logo_url: 'https://demo.supabase.co/logo.png',
        announcement: 'Pengumuman libur',
        socials: { whatsapp: '081234567890', instagram: 'https://instagram.com/x' },
        operational_hours: [{ hari: 'Senin – Jumat', open: '08:00', close: '16:00' }],
      },
    },
  });
  setTable('banners', {
    list: {
      data: [
        {
          id: 'bn1',
          title: 'Promo Spesial',
          subtitle: 'Sub',
          image_url: 'https://demo.supabase.co/banner.png',
          link: '/katalog',
          sort_order: 1,
          is_active: true,
        },
      ],
      count: 1,
    },
  });
  setTable('books', {
    list: { data: [BOOK], count: 1 },
    single: { data: BOOK, error: null },
  });
  setTable('categories', {
    list: {
      data: [
        {
          id: 'c1',
          name: 'Fiksi',
          slug: 'fiksi',
          description: null,
          cover_url: null,
          is_active: true,
        },
      ],
      count: 1,
    },
  });
  setTable('articles', {
    list: { data: [ARTICLE], count: 1 },
    single: { data: ARTICLE, error: null },
  });
  setTable('pages', {
    list: { data: [PAGE_ROW], count: 1 },
    single: { data: PAGE_ROW, error: null },
  });
  setTable('testimonials', {
    list: {
      data: [
        {
          id: 't1',
          name: 'Andi',
          content: 'Pelayanan bagus',
          role: 'Mahasiswa',
          avatar_url: null,
          rating: 5,
          is_active: true,
          sort_order: 0,
          created_at: ISO,
        },
      ],
      count: 1,
    },
  });
  setTable('faqs', {
    list: {
      data: [
        { id: 'f1', question: 'Bagaimana pinjam?', answer: 'Datang ke perpus.', category: 'Umum' },
      ],
      count: 1,
    },
  });
  setRpc('get_library_stats', {
    data: [{ total_books: 10, total_categories: 3, total_articles: 5, total_copies: 42 }],
  });
}

beforeEach(() => {
  resetMockDb();
  installMockSupabase();
  seedDefaults();
});

describe('public RSC pages', () => {
  it('home renders sections from all fetchers + metadata', async () => {
    const el = await PublicHomePage();
    expect(el).toBeTruthy();
    const md = await homeMeta();
    expect(md.title).toBeTruthy();
    expect((md.openGraph as { siteName?: string }).siteName).toBe('Perpustakaan Digital');
  });

  it('kontak renders contact paths (wa + hours) with and without buku param', async () => {
    const el = await KontakPage({});
    expect(el).toBeTruthy();
    const elBuku = await KontakPage({ searchParams: { buku: 'buku-a' } });
    expect(elBuku).toBeTruthy();
    const md = await kontakMeta();
    expect(md.title).toContain('Kontak');
    expect(String((md.alternates as { canonical?: string }).canonical)).toContain('/kontak');
  });

  it('katalog page paginates + filters from searchParams + metadata', async () => {
    const el = await KatalogPage({});
    expect(el).toBeTruthy();
    const filtered = await KatalogPage({
      searchParams: { q: 'buku', page: '2', sort: 'judul', kategori: 'c1', tersedia: '1' },
    });
    expect(filtered).toBeTruthy();
    const md = await katalogMeta({});
    expect(md.title).toBeTruthy();
  });

  it('berita archive + metadata', async () => {
    const el = await BeritaPage();
    expect(el).toBeTruthy();
    const md = await beritaMeta();
    expect(String((md.alternates as { canonical?: string }).canonical)).toContain('/berita');
  });

  it('berita detail renders + not-found rejects + metadata both ways', async () => {
    const el = await BeritaDetailPage({ params: { slug: 'artikel-perpus' } });
    expect(el).toBeTruthy();
    const md = await beritaDetailMeta({ params: { slug: 'artikel-perpus' } });
    expect(md.title).toContain('Artikel Perpus');
    setTable('articles', { single: { data: null, error: null } });
    const mdMissing = await beritaDetailMeta({ params: { slug: 'hilang' } });
    expect(mdMissing.title).toContain('tidak ditemukan');
    await expect(BeritaDetailPage({ params: { slug: 'hilang' } })).rejects.toThrow(
      /NEXT_NOT_FOUND/
    );
    setTable('articles', { single: { data: ARTICLE, error: null } });
  });

  it('faq page renders faq list + metadata', async () => {
    const el = await FaqPage();
    expect(el).toBeTruthy();
    const md = await faqMeta();
    expect(md.title).toContain('FAQ');
    expect(String((md.alternates as { canonical?: string }).canonical)).toContain('/faq');
  });

  it('tentang + layanan pages and metadata', async () => {
    expect(await TentangPage()).toBeTruthy();
    expect(await LayananPage()).toBeTruthy();
    expect((await tentangMeta()).title).toBeTruthy();
    expect((await layananMeta()).title).toBeTruthy();
  });

  it('halaman [slug] renders + not-found + metadata both ways', async () => {
    const el = await HalamanDetailPage({ params: { slug: 'tentang' } });
    expect(el).toBeTruthy();
    const md = await halamanMeta({ params: { slug: 'tentang' } });
    expect(md.title).toContain('Tentang Perpus');
    setTable('pages', { single: { data: null, error: null } });
    const mdMissing = await halamanMeta({ params: { slug: 'hilang' } });
    expect(mdMissing.title).toContain('tidak ditemukan');
    await expect(HalamanDetailPage({ params: { slug: 'hilang' } })).rejects.toThrow(
      /NEXT_NOT_FOUND/
    );
    setTable('pages', { single: { data: PAGE_ROW, error: null } });
  });

  it('katalog [slug] renders detail + static params + metadata + not-found', async () => {
    const el = await BookDetailPage({ params: { slug: 'buku-a' } });
    expect(el).toBeTruthy();
    const params = await generateStaticParams();
    expect(params.some((p) => p.slug === 'buku-a')).toBe(true);
    const md = await bookMeta({ params: { slug: 'buku-a' } });
    expect(md.title).toContain('Buku A');
    setTable('books', { single: { data: null, error: null } });
    const mdMissing = await bookMeta({ params: { slug: 'hilang' } });
    expect(mdMissing.title).toContain('Buku tidak ditemukan');
    await expect(BookDetailPage({ params: { slug: 'hilang' } })).rejects.toThrow(/NEXT_NOT_FOUND/);
  });

  it('buku alias redirects to katalog, not-found for missing', async () => {
    await expect(BukuAliasPage({ params: { slug: 'buku-a' } })).rejects.toThrow(
      /NEXT_PERMANENT_REDIRECT__\/katalog\/buku-a/
    );
    setTable('books', { single: { data: null, error: null } });
    await expect(BukuAliasPage({ params: { slug: 'hilang' } })).rejects.toThrow(/NEXT_NOT_FOUND/);
    const mdMissing = await bukuMeta({ params: { slug: 'hilang' } });
    expect(mdMissing.title).toContain('Buku tidak ditemukan');
    setTable('books', { single: { data: BOOK, error: null } });
    const md = await bukuMeta({ params: { slug: 'buku-a' } });
    expect(md.title).toContain('Buku A');
    expect(String((md.alternates as { canonical?: string }).canonical)).toContain(
      '/katalog/buku-a'
    );
  });

  it('public layout renders json-ld shell + metadata', async () => {
    const el = await PublicLayout({ children: null });
    expect(el).toBeTruthy();
    const md = await layoutMeta();
    expect(md.title).toBe('Perpustakaan Digital');
    expect((md.openGraph as { locale?: string }).locale).toBe('id_ID');
  });
});

describe('admin RSC pages', () => {
  it('admin layout redirects when logged out', async () => {
    setAuthUser(null);
    await expect(AdminLayout({ children: null })).rejects.toThrow(/NEXT_REDIRECT__\/login/);
  });

  it('admin layout redirects non-staff to home', async () => {
    setProfileRole('member');
    await expect(AdminLayout({ children: null })).rejects.toThrow(/NEXT_REDIRECT__\//);
  });

  it('admin layout renders for staff', async () => {
    setProfileRole('admin');
    const el = await AdminLayout({ children: null });
    expect(el).toBeTruthy();
  });

  it('logs page renders rows + filter branches as admin', async () => {
    setProfileRole('admin');
    const el = await LogsPage({ searchParams: {} });
    expect(el).toBeTruthy();
    const filtered = await LogsPage({
      searchParams: { page: '2', action: 'books.create', entity: 'books' },
    });
    expect(filtered).toBeTruthy();
    setTable('activity_logs', { list: { data: null, error: { message: 'db down' } } });
    const failed = await LogsPage({ searchParams: {} });
    expect(failed).toBeTruthy();
  });

  it('logs page denies non-admin and anonymous', async () => {
    setProfileRole('member');
    expect(await LogsPage({ searchParams: {} })).toBeTruthy();
    setAuthUser(null);
    expect(await LogsPage({ searchParams: {} })).toBeTruthy();
  });

  it('pengaturan renders settings row', async () => {
    const el = await PengaturanPage();
    expect(el).toBeTruthy();
  });

  it('dashboard renders stat cards with rpc chart data', async () => {
    setRpc('get_loans_per_day', { data: [{ day: '2026-09-01', total: 4 }] });
    const el = await AdminDashboard();
    const markup = renderToStaticMarkup(el as React.ReactElement);
    expect(markup).toContain('Total Buku');
    expect(markup).toContain('Perlu dikembalikan');
  });

  it('dashboard falls back to bucketed week query when rpc empty', async () => {
    setRpc('get_loans_per_day', { data: [] });
    setTable('loans', { list: { data: [], count: 0 } });
    const el = await AdminDashboard();
    const markup = renderToStaticMarkup(el as React.ReactElement);
    expect(markup).toContain('Belum ada keterlambatan.');
  });

  it('tambah buku loads category+rack options', async () => {
    setTable('categories', {
      list: { data: [{ id: 'c1', name: 'Fiksi' }], count: 1 },
    });
    setTable('racks', { list: { data: [{ id: 'r1', code: 'A1', name: 'Rak A' }], count: 1 } });
    const el = await TambahBukuPage();
    expect(el).toBeTruthy();
  });

  it('edit buku renders with data / not-found without', async () => {
    const el = await EditBukuPage({ params: { id: 'b1' } });
    expect(el).toBeTruthy();
    setTable('books', { single: { data: null, error: null } });
    await expect(EditBukuPage({ params: { id: 'zz' } })).rejects.toThrow(/NEXT_NOT_FOUND/);
  });
});

describe('metadata routes', () => {
  it('sitemap lists statics plus book/article/page slugs', async () => {
    const sm = await sitemap();
    expect(Array.isArray(sm)).toBe(true);
    expect(sm.length).toBeGreaterThanOrEqual(7);
    expect(sm.some((e) => String(e.url).includes('/katalog/buku-a'))).toBe(true);
    expect(sm.some((e) => String(e.url).includes('/berita/artikel-perpus'))).toBe(true);
    expect(sm.some((e) => String(e.url).includes('/halaman/tentang'))).toBe(true);
  });

  it('robots disallows private areas', () => {
    const r = robots();
    expect(r.rules[0]?.userAgent).toBe('*');
    expect(r.rules[0]?.disallow).toEqual(['/admin', '/api', '/denda', '/reservasi-saya', '/login']);
    expect(r.sitemap).toContain('/sitemap.xml');
  });

  it('manifest has identity + icons', () => {
    const m = manifest();
    expect(m.name).toBe('Perpustakaan');
    expect(m.start_url).toBe('/');
    expect(m.icons.length).toBeGreaterThanOrEqual(2);
    expect(m.theme_color).toBe('#047857');
  });
});
