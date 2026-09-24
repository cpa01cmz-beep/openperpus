// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';

(globalThis as unknown as { React: unknown }).React = React;

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: Record<string, unknown>) =>
    React.createElement(
      'a',
      { href: typeof href === 'string' ? href : '#', ...rest },
      children as React.ReactNode
    ),
}));
vi.mock('next/image', () => ({
  default: ({ src, alt }: Record<string, unknown>) =>
    React.createElement('img', { src: String(src), alt: String(alt ?? '') }),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('__NEXT_NOT_FOUND__');
  },
  redirect: (url: string) => {
    throw new Error(`__NEXT_REDIRECT__${url}`);
  },
  useRouter: () => nav,
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/dynamic', () => ({
  default: () => {
    const Noop = () => null;
    return Noop;
  },
}));
vi.mock('@/lib/observability', () => ({
  initSentry: vi.fn(),
  captureException: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase),
}));
vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase),
}));

import './helpers/localstorage-polyfill';
import { resetMockDb, installMockSupabase } from './helpers/supabase-mock';
import BookForm from '@/components/admin/BookForm';
import SettingsForm from '@/components/admin/SettingsForm';
import RakPage from '@/app/admin/rak/page';
import MenuPage from '@/app/admin/menu/page';
import KategoriPage from '@/app/admin/kategori/page';
import BannerPage from '@/app/admin/banner/page';
import ArtikelPage from '@/app/admin/artikel/page';
import BukuAdminPage from '@/app/admin/buku/page';
import AnggotaPage from '@/app/admin/anggota/page';
import PeminjamanPage from '@/app/admin/peminjaman/page';
import KontenPage from '@/app/admin/konten/page';
import DendaAdminPage from '@/app/admin/denda/page';
import DendaSayaPage from '@/app/(public)/denda/page';
import DaftarPage from '@/app/daftar/page';
import ClassicHeader from '@/components/layout/variants/headers/ClassicHeader';
import SearchCombobox from '@/components/admin/SearchCombobox';
import UploadInput from '@/components/admin/UploadInput';
import ThemeSwitcher from '@/components/admin/ThemeSwitcher';
import CategoryChips from '@/components/public/CategoryChips';
import FaqAccordion from '@/components/public/FaqAccordion';
import { ReservationCard } from '@/components/public/ReservationCard';
import ErrorPage from '@/app/error';
import GlobalErrorPage from '@/app/global-error';
import PublicErrorPage from '@/app/(public)/error';
import AdminErrorPage from '@/app/admin/error';

type FetchJson = Record<string, unknown>;
let listRows: FetchJson[] = [];

function jsonResponse(status: number, body: FetchJson) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

const defaultFetch = async (input: unknown, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : String((input as { url?: string }).url ?? input);
  const method = (init?.method ?? 'GET').toUpperCase();
  if (url.includes('/api/settings'))
    return jsonResponse(200, { data: { fine_per_day: 1500, name: 'Perpustakaan Digital' } });
  if (method === 'POST' && url.includes('/api/fines'))
    return jsonResponse(200, {
      data: { id: 'f1', amount: 5000, paid_amount: 0, paid_at: '2026-09-24T00:00:00Z' },
    });
  if (method === 'GET') {
    return jsonResponse(200, {
      data: listRows,
      meta: { page: 1, per_page: 20, total: listRows.length },
      pagination: { page: 1, limit: 20, total: listRows.length, totalPages: 1 },
    });
  }
  return jsonResponse(method === 'POST' ? 201 : 200, { data: { id: 'row-new' }, message: 'ok' });
};
const fetchMock = vi.fn(defaultFetch);

beforeEach(() => {
  resetMockDb();
  installMockSupabase();
  nav.push.mockReset();
  nav.refresh.mockReset();
  nav.replace.mockReset();
  nav.back.mockReset();
  fetchMock.mockReset();
  fetchMock.mockImplementation(defaultFetch);
  listRows = [];
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal(
    'confirm',
    vi.fn(() => true)
  );
  vi.stubGlobal('alert', vi.fn());
  (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => 'blob:test');
  (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('BookForm interactions', () => {
  it('covers every field onChange + submit success + validation branches', async () => {
    const view = render(
      <BookForm
        mode="create"
        categories={[{ id: 'c1', name: 'Fiksi' }]}
        racks={[{ id: 'r1', code: 'A1', name: 'Rak A' }]}
      />
    );
    const set = (id: string, v: string) => {
      const el = view.container.querySelector(`#${id}`) as
        HTMLInputElement | HTMLTextAreaElement | null;
      expect(el, `input #${id} exists`).toBeTruthy();
      fireEvent.change(el!, { target: { value: v } });
    };
    set('book-title', 'Laskar Pelangi');
    set('book-author', 'Andrea Hirata');
    set('book-publisher', 'Bentang');
    set('book-year', '2005');
    set('book-isbn', '978-602-1');
    set('book-language', 'id');
    set('book-stock-total', '10');
    set('book-stock-available', '5');
    set('book-pages', '280');
    set('book-description', 'Novel inspiratif.');
    fireEvent.change(view.container.querySelector('#book-category') as Element, {
      target: { value: 'c1' },
    });
    fireEvent.change(view.container.querySelector('#book-rack') as Element, {
      target: { value: 'r1' },
    });
    fireEvent.click(view.container.querySelector('#book-featured') as Element);
    fireEvent.click(view.container.querySelector('#book-active') as Element);
    const coverInput = view.container.querySelectorAll('input[type="text"]')[0] as HTMLInputElement;
    if (coverInput)
      fireEvent.change(coverInput, {
        target: { value: 'https://demo.supabase.co/storage/v1/object/public/covers/a.png' },
      });
    const form = view.container.querySelector('form')!;
    fireEvent.submit(form);
    await waitFor(
      () =>
        expect(
          fetchMock.mock.calls.some(
            (c) =>
              String(c[0]).includes('/api/books') &&
              (c[1] as RequestInit | undefined)?.method === 'POST'
          )
        ).toBe(true),
      { timeout: 2500 }
    );
    set('book-title', '');
    fireEvent.submit(form);
    await waitFor(() => expect(screen.getByText(/Judul wajib diisi/)).toBeTruthy(), {
      timeout: 2000,
    });
    set('book-title', 'Judul Baru');
    set('book-author', '');
    fireEvent.submit(form);
    await waitFor(() => expect(screen.getByText(/Penulis wajib diisi/)).toBeTruthy(), {
      timeout: 2000,
    });
    set('book-author', 'Penulis');
    set('book-stock-available', '-1');
    fireEvent.submit(form);
    await waitFor(() => expect(screen.getByText(/tidak boleh negatif/)).toBeTruthy(), {
      timeout: 2000,
    });
    set('book-stock-available', '99');
    fireEvent.submit(form);
    await waitFor(() => expect(screen.getByText(/melebihi stock_total/)).toBeTruthy(), {
      timeout: 2000,
    });
  });

  it('server error surfaces via errMsg', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(500, { error: { message: 'Stok tidak cukup di server.' } })
    );
    const view = render(<BookForm mode="create" />);
    fireEvent.change(view.container.querySelector('#book-title') as Element, {
      target: { value: 'Judul' },
    });
    fireEvent.change(view.container.querySelector('#book-author') as Element, {
      target: { value: 'Penulis' },
    });
    fireEvent.submit(view.container.querySelector('form')!);
    await waitFor(() => expect(screen.getByText('Stok tidak cukup di server.')).toBeTruthy(), {
      timeout: 2500,
    });
  });
});

describe('SettingsForm interactions', () => {
  it('change every field + server error via errMsg + recovery submit', async () => {
    const view = render(
      <SettingsForm
        initial={{
          name: 'Perpustakaan Digital',
          fine_per_day: 1500,
          operational_hours: [{ day: 'Senin', open: '08:00', close: '16:00' }],
          socials: { facebook: 'https://facebook.com/x' },
          email: 'a@b.id',
        }}
      />
    );
    const ids = [
      'settings-name',
      'settings-tagline',
      'settings-logo-url',
      'settings-favicon-url',
      'settings-phone',
      'settings-email',
      'settings-address',
      'settings-operational-hours',
      'settings-socials',
      'settings-welcome-text',
      'settings-vision',
      'settings-mission',
      'settings-about',
      'settings-seo-title',
      'settings-seo-desc',
      'settings-announcement',
      'settings-fine-per-day',
    ];
    for (const id of ids) {
      const el = view.container.querySelector(`#${id}`) as
        HTMLInputElement | HTMLTextAreaElement | null;
      if (el) fireEvent.change(el, { target: { value: (el as HTMLInputElement).value || 'X' } });
    }
    fetchMock.mockResolvedValueOnce(
      jsonResponse(500, { error: { message: 'Tema tidak valid di server.' } })
    );
    fireEvent.submit(view.container.querySelector('form')!);
    await waitFor(() => expect(screen.getByText('Tema tidak valid di server.')).toBeTruthy(), {
      timeout: 2500,
    });
    fireEvent.submit(view.container.querySelector('form')!);
    await waitFor(() => expect(screen.getByText(/berhasil disimpan/i)).toBeTruthy(), {
      timeout: 2500,
    });
  });
});

describe('admin list page interactions', () => {
  it('rak: search/add/toggle/delete flows cover handlers', async () => {
    listRows = [
      { id: 'r1', code: 'A1', name: 'Rak A', location: 'Lt 1', capacity: 10, is_active: true },
    ];
    const view = render(<RakPage />);
    await waitFor(
      () => expect(view.container.querySelector('table, [role="status"], h1')).toBeTruthy(),
      { timeout: 2500 }
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Rak' })).toBeTruthy();
    fireEvent.change(view.container.querySelector('#rak-search') as Element, {
      target: { value: 'A1' },
    });
    fireEvent.change(view.container.querySelector('#rak-code') as Element, {
      target: { value: 'B2' },
    });
    fireEvent.change(view.container.querySelector('#rak-name') as Element, {
      target: { value: 'Rak B' },
    });
    fireEvent.click(screen.getByRole('button', { name: /tambah/i }));
    await waitFor(
      () =>
        expect(
          fetchMock.mock.calls.some(
            (c) =>
              String(c[0]).includes('/api/racks') &&
              (c[1] as RequestInit | undefined)?.method === 'POST'
          )
        ).toBe(true),
      { timeout: 2500 }
    );
    // rows load behind a 300ms debounce; wait before querying row actions
    await waitFor(() => expect(screen.getByRole('button', { name: /hapus rak/i })).toBeTruthy(), {
      timeout: 2500,
    });
    fireEvent.click(screen.getByRole('button', { name: /hapus rak/i }));
    await waitFor(
      () =>
        expect(
          fetchMock.mock.calls.some(
            (c) =>
              String(c[0]).includes('/api/racks?id=') &&
              (c[1] as RequestInit | undefined)?.method === 'DELETE'
          )
        ).toBe(true),
      { timeout: 2500 }
    );
    const toggle = screen.getByRole('button', { name: /ubah status rak/i });
    fireEvent.click(toggle);
    await waitFor(
      () =>
        expect(
          fetchMock.mock.calls.some((c) => (c[1] as RequestInit | undefined)?.method === 'PUT')
        ).toBe(true),
      { timeout: 2500 }
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse(500, { error: { message: 'Server rak sedang sibuk.' } })
    );
    fireEvent.click(screen.getByRole('button', { name: /hapus rak/i }));
    await waitFor(
      () =>
        expect(screen.getByText(/Server rak sedang sibuk|tidak bisa dihapus|Gagal/i)).toBeTruthy(),
      { timeout: 2500 }
    );
  });

  it('menu: add + delete flows', async () => {
    listRows = [
      {
        id: 'm1',
        label: 'Beranda',
        url: '/',
        position: 'header',
        target: '_self',
        sort_order: 1,
        is_active: true,
      },
    ];
    const view = render(<MenuPage />);
    await waitFor(
      () => expect(screen.getByRole('heading', { level: 1, name: 'Menu' })).toBeTruthy(),
      { timeout: 2500 }
    );
    fireEvent.change(view.container.querySelector('#menu-label') as Element, {
      target: { value: 'Katalog' },
    });
    fireEvent.change(view.container.querySelector('#menu-url') as Element, {
      target: { value: '/katalog' },
    });
    fireEvent.change(view.container.querySelector('#menu-position') as Element, {
      target: { value: 'footer' },
    });
    fireEvent.change(view.container.querySelector('#menu-search') as Element, {
      target: { value: 'kat' },
    });
    fireEvent.click(view.container.querySelector('form button[type="submit"]')!);
    await waitFor(
      () =>
        expect(
          fetchMock.mock.calls.some(
            (c) =>
              String(c[0]).includes('/api/menus') &&
              (c[1] as RequestInit | undefined)?.method === 'POST'
          )
        ).toBe(true),
      { timeout: 2500 }
    );
    fireEvent.click(screen.getByRole('button', { name: /hapus menu/i }));
    await waitFor(
      () =>
        expect(
          fetchMock.mock.calls.some((c) => (c[1] as RequestInit | undefined)?.method === 'DELETE')
        ).toBe(true),
      { timeout: 2500 }
    );
    const toggle = screen.getByRole('button', { name: /ubah status menu/i });
    fireEvent.click(toggle);
    await waitFor(
      () =>
        expect(
          fetchMock.mock.calls.some((c) => (c[1] as RequestInit | undefined)?.method === 'PUT')
        ).toBe(true),
      { timeout: 2500 }
    );
  });

  it('kategori: search/add/delete flows', async () => {
    listRows = [{ id: 'c1', name: 'Fiksi', slug: 'fiksi', description: null, is_active: true }];
    const view = render(<KategoriPage />);
    await waitFor(
      () => expect(screen.getByRole('heading', { level: 1, name: 'Kategori' })).toBeTruthy(),
      { timeout: 2500 }
    );
    fireEvent.change(view.container.querySelector('#kategori-search') as Element, {
      target: { value: 'fik' },
    });
    fireEvent.change(view.container.querySelector('#kategori-name') as Element, {
      target: { value: 'Novel' },
    });
    const desc = view.container.querySelector('#kategori-description') as Element | null;
    if (desc) fireEvent.change(desc, { target: { value: 'Kategori novel' } });
    fireEvent.click(view.container.querySelector('form button[type="submit"]')!);
    await waitFor(
      () =>
        expect(
          fetchMock.mock.calls.some(
            (c) =>
              String(c[0]).includes('/api/categories') &&
              (c[1] as RequestInit | undefined)?.method === 'POST'
          )
        ).toBe(true),
      { timeout: 2500 }
    );
    fireEvent.click(screen.getByRole('button', { name: /hapus kategori/i }));
    await waitFor(
      () =>
        expect(
          fetchMock.mock.calls.some((c) => (c[1] as RequestInit | undefined)?.method === 'DELETE')
        ).toBe(true),
      { timeout: 2500 }
    );
    const toggle = screen.getByRole('button', { name: /ubah status kategori/i });
    fireEvent.click(toggle);
    await waitFor(
      () =>
        expect(
          fetchMock.mock.calls.some((c) => (c[1] as RequestInit | undefined)?.method === 'PUT')
        ).toBe(true),
      { timeout: 2500 }
    );
  });

  it('banner: sort group + add + toggle + delete', async () => {
    listRows = [
      {
        id: 'b1',
        title: 'Promo',
        image_url: 'https://demo.supabase.co/b.png',
        link: '/katalog',
        sort_order: 1,
        is_active: true,
        created_at: '2026-09-01T00:00:00Z',
      },
    ];
    const view = render(<BannerPage />);
    await waitFor(
      () => expect(screen.getByRole('heading', { level: 1, name: 'Banner' })).toBeTruthy(),
      { timeout: 2500 }
    );
    const sortGroup = screen.getByRole('group', { name: /urutkan banner/i });
    fireEvent.click(within(sortGroup).getByRole('button', { name: /judul/i }));
    await waitFor(
      () =>
        expect(
          fetchMock.mock.calls.some(
            (c) => String(c[0]).includes('sort=title') || String(c[0]).includes('order=')
          )
        ).toBe(true),
      { timeout: 2500 }
    );
    fireEvent.click(within(sortGroup).getByRole('button', { name: /terbaru/i }));
    fireEvent.click(within(sortGroup).getByRole('button', { name: /urutan/i }));
    fireEvent.change(view.container.querySelector('#banner-title') as Element, {
      target: { value: 'Promo Baru' },
    });
    fireEvent.change(view.container.querySelector('#banner-image-url') as Element, {
      target: { value: 'https://demo.supabase.co/x.png' },
    });
    fireEvent.change(view.container.querySelector('#banner-link') as Element, {
      target: { value: '/katalog' },
    });
    fireEvent.change(view.container.querySelector('#banner-subtitle') as Element, {
      target: { value: 'Sub' },
    });
    fireEvent.change(view.container.querySelector('#banner-sort-order') as Element, {
      target: { value: '2' },
    });
    fireEvent.click(view.container.querySelector('form button[type="submit"]')!);
    await waitFor(
      () =>
        expect(
          fetchMock.mock.calls.some((c) => (c[1] as RequestInit | undefined)?.method === 'POST')
        ).toBe(true),
      { timeout: 2500 }
    );
    fireEvent.click(screen.getByRole('button', { name: /aktifkan banner/i }));
    await waitFor(
      () =>
        expect(
          fetchMock.mock.calls.some((c) => (c[1] as RequestInit | undefined)?.method === 'PUT')
        ).toBe(true),
      { timeout: 2500 }
    );
    fireEvent.click(screen.getByRole('button', { name: /hapus banner/i }));
    await waitFor(
      () =>
        expect(
          fetchMock.mock.calls.some((c) => (c[1] as RequestInit | undefined)?.method === 'DELETE')
        ).toBe(true),
      { timeout: 2500 }
    );
  });

  it('artikel: add + delete flows', async () => {
    listRows = [
      {
        id: 'a1',
        title: 'Berita',
        slug: 'berita',
        status: 'draft',
        excerpt: null,
        cover_url: null,
        category: null,
        author_id: null,
        published_at: null,
        views: 0,
        created_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-09-01T00:00:00Z',
      },
    ];
    const view = render(<ArtikelPage />);
    await waitFor(
      () => expect(screen.getByRole('heading', { level: 1, name: 'Artikel' })).toBeTruthy(),
      { timeout: 2500 }
    );
    fireEvent.change(view.container.querySelector('#artikel-title') as Element, {
      target: { value: 'Berita Baru' },
    });
    fireEvent.change(view.container.querySelector('#artikel-content') as Element, {
      target: { value: 'Isi konten lengkap.' },
    });
    fireEvent.change(view.container.querySelector('#artikel-excerpt') as Element, {
      target: { value: 'Ringkas' },
    });
    fireEvent.change(view.container.querySelector('#artikel-cover-url') as Element, {
      target: { value: 'https://demo.supabase.co/c.png' },
    });
    fireEvent.change(view.container.querySelector('#artikel-category') as Element, {
      target: { value: 'Umum' },
    });
    fireEvent.change(view.container.querySelector('#artikel-status') as Element, {
      target: { value: 'published' },
    });
    fireEvent.click(screen.getByRole('button', { name: /tambah/i }));
    await waitFor(
      () =>
        expect(
          fetchMock.mock.calls.some(
            (c) =>
              String(c[0]).includes('/api/articles') &&
              (c[1] as RequestInit | undefined)?.method === 'POST'
          )
        ).toBe(true),
      { timeout: 2500 }
    );
    fireEvent.click(screen.getByRole('button', { name: /hapus artikel/i }));
    await waitFor(
      () =>
        expect(
          fetchMock.mock.calls.some((c) => (c[1] as RequestInit | undefined)?.method === 'DELETE')
        ).toBe(true),
      { timeout: 2500 }
    );
  });

  it('buku: csv export + delete + bulk select', async () => {
    listRows = [
      {
        id: 'b1',
        title: 'Buku A',
        slug: 'buku-a',
        author: 'Ani',
        stock_total: 3,
        stock_available: 2,
        featured: false,
        is_active: true,
        rating_avg: 4,
        created_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-09-01T00:00:00Z',
      },
    ];
    const view = render(<BukuAdminPage />);
    await waitFor(
      () => expect(screen.getByRole('heading', { level: 1, name: 'Buku' })).toBeTruthy(),
      { timeout: 2500 }
    );
    // row checkboxes only exist after the debounced load resolves
    await waitFor(() => expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0), {
      timeout: 2500,
    });
    fireEvent.click(screen.getByRole('button', { name: /ekspor csv/i }));
    await waitFor(
      () =>
        expect(
          (URL as unknown as { createObjectURL: ReturnType<typeof vi.fn> }).createObjectURL
        ).toHaveBeenCalled(),
      { timeout: 2000 }
    );
    const selectAll = view.container.querySelector(
      'thead input[type="checkbox"]'
    ) as HTMLInputElement | null;
    if (selectAll) fireEvent.click(selectAll);
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.click(screen.getByRole('button', { name: /hapus buku/i }));
    await waitFor(
      () =>
        expect(
          fetchMock.mock.calls.some((c) => (c[1] as RequestInit | undefined)?.method === 'DELETE')
        ).toBe(true),
      { timeout: 2500 }
    );
    fireEvent.click(screen.getByRole('button', { name: /pilih/i }));
  });
});

describe('anggota + peminjaman interactions', () => {
  it('anggota: profile picker + sort + select-all + delete + add', async () => {
    listRows = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        member_code: 'AG-1',
        user_id: 'u-9',
        phone: '0812',
        address: 'Jl. A',
        status: 'active',
        created_at: '2026-09-01T00:00:00Z',
        profiles: { full_name: 'Budi Santoso' },
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        member_code: 'AG-2',
        user_id: 'u-8',
        phone: '0813',
        address: 'Jl. B',
        status: 'active',
        created_at: '2026-09-02T00:00:00Z',
        profiles: { full_name: 'Cici Rambut' },
      },
    ];
    const view = render(<AnggotaPage />);
    await waitFor(
      () => expect(screen.getByRole('heading', { level: 1, name: 'Anggota' })).toBeTruthy(),
      { timeout: 2500 }
    );
    const picker = screen.getByRole('combobox', {
      name: /pencarian profil|cari anggota|profil anggota/i,
    }) as HTMLInputElement;
    fireEvent.change(picker, { target: { value: 'Budi' } });
    await waitFor(
      () =>
        expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/members'))).toBe(true),
      { timeout: 2500 }
    );
    // picker results are role=option <li> items picked via mousedown, not buttons
    const pickOpt = await screen.findByRole('option', { name: /budi/i }, { timeout: 2500 });
    fireEvent.mouseDown(pickOpt);
    // wait for table rows (debounced load) before row-level actions
    await waitFor(
      () =>
        expect(screen.getAllByRole('button', { name: /hapus anggota/i }).length).toBeGreaterThan(0),
      { timeout: 2500 }
    );
    const sortBtn = screen.getAllByRole('button', { name: /urutkan berdasarkan/i })[0];
    if (sortBtn) fireEvent.click(sortBtn);
    const selectAll = view.container.querySelector(
      'thead input[type="checkbox"]'
    ) as HTMLInputElement | null;
    if (selectAll) fireEvent.click(selectAll);
    fireEvent.click(screen.getAllByRole('button', { name: /hapus anggota/i })[0]);
    await waitFor(
      () =>
        expect(
          fetchMock.mock.calls.some((c) => (c[1] as RequestInit | undefined)?.method === 'DELETE')
        ).toBe(true),
      { timeout: 2500 }
    );
    fireEvent.change(view.container.querySelector('#anggota-user-id') as Element, {
      target: { value: '11111111-1111-4111-8111-111111111111' },
    });
    fireEvent.change(view.container.querySelector('#anggota-member-code') as Element, {
      target: { value: 'AG-99' },
    });
    fireEvent.change(view.container.querySelector('#anggota-phone') as Element, {
      target: { value: '0899' },
    });
    fireEvent.change(view.container.querySelector('#anggota-address') as Element, {
      target: { value: 'Jl. Baru' },
    });
    fetchMock.mockResolvedValueOnce(
      jsonResponse(500, { error: { message: 'Server anggota penuh.' } })
    );
    fireEvent.click(view.container.querySelector('form button[type="submit"]')!);
    // add failure surfaces through alert(), not inline text
    await waitFor(
      () =>
        expect(
          (globalThis as unknown as { alert: ReturnType<typeof vi.fn> }).alert
        ).toHaveBeenCalledWith(expect.stringMatching(/Server anggota penuh|Gagal menambah/i)),
      { timeout: 2500 }
    );
  });

  it('peminjaman: row actions, modals, filters, bulk select', async () => {
    listRows = [
      {
        id: 'L-1',
        status: 'borrowed',
        due_at: '2026-09-01T00:00:00Z',
        borrowed_at: '2026-08-20T00:00:00Z',
        fine_amount: 0,
        returned_at: null,
        members: { id: 'm1', member_code: 'AG-1', full_name: 'Budi' },
        books: { id: 'b1', title: 'Buku A', slug: 'buku-a', stock_available: 1, stock_total: 3 },
      },
    ];
    const view = render(<PeminjamanPage />);
    await waitFor(
      () => expect(screen.getByRole('heading', { level: 1, name: 'Peminjaman' })).toBeTruthy(),
      { timeout: 2500 }
    );
    const overdueBtn = screen.getByRole('button', { name: /terlambat|overdue/i });
    fireEvent.click(overdueBtn);
    fireEvent.click(overdueBtn);
    const sortBtn = screen.getAllByRole('button', { name: /urutkan berdasarkan/i })[0];
    if (sortBtn) fireEvent.click(sortBtn);
    const selectAll = view.container.querySelector(
      'thead input[type="checkbox"]'
    ) as HTMLInputElement | null;
    if (selectAll) fireEvent.click(selectAll);
    const rowCheck = screen.getAllByRole('checkbox').at(-1);
    if (rowCheck) fireEvent.click(rowCheck);
    fireEvent.change(view.container.querySelector('#peminjaman-status') as Element, {
      target: { value: 'borrowed' },
    });
    await waitFor(
      () => expect(screen.getByRole('button', { name: /kembalikan pinjaman/i })).toBeTruthy(),
      { timeout: 2500 }
    );
    fireEvent.click(screen.getByRole('button', { name: /kembalikan pinjaman/i }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy(), { timeout: 2500 });
    fireEvent.click(screen.getByRole('button', { name: /batal/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 2500 });
    fireEvent.click(screen.getByRole('button', { name: /perpanjang pinjaman/i }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy(), { timeout: 2500 });
    const daysSelect = screen.getByLabelText(/lama perpanjangan/i);
    fireEvent.change(daysSelect, { target: { value: '14' } });
    fetchMock.mockResolvedValueOnce(
      jsonResponse(500, { error: { message: 'Gagal memperpanjang.' } })
    );
    fireEvent.click(screen.getByRole('button', { name: /ya, perpanjang/i }));
    await waitFor(() => expect(screen.getByText(/Gagal memperpanjang/)).toBeTruthy(), {
      timeout: 2500,
    });
    // confirmExtend closes the modal optimistically before the fetch resolves
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 2500 });
    fireEvent.click(screen.getByRole('button', { name: /kembalikan pinjaman/i }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy(), { timeout: 2500 });
    fetchMock.mockResolvedValueOnce(
      jsonResponse(500, { error: { message: 'Gagal mengembalikan.' } })
    );
    fireEvent.click(screen.getByRole('button', { name: /ya, kembalikan/i }));
    await waitFor(() => expect(screen.getByText(/Gagal mengembalikan/)).toBeTruthy(), {
      timeout: 2500,
    });
  });
});

describe('denda flows (admin + member) + konten reload', () => {
  it('denda saya: pay modal, receipt print/copy/close, status filter', async () => {
    listRows = [
      {
        id: 'f1',
        loan_id: 'L-1',
        member_id: 'm1',
        amount: 10000,
        paid_amount: 0,
        status: 'unpaid',
        issued_at: '2026-09-01T00:00:00Z',
        paid_at: null,
        notes: null,
        due_at: '2026-09-10T00:00:00Z',
        books: { title: 'Buku A' },
      },
    ];
    const view = render(<DendaSayaPage />);
    await waitFor(
      () =>
        expect(
          screen.getAllByRole('heading', { level: 1 }).some((h) => h.textContent === 'Denda Saya')
        ).toBe(true),
      { timeout: 2500 }
    );
    const selects = view.container.querySelectorAll('select');
    if (selects[0]) fireEvent.change(selects[0], { target: { value: 'paid' } });
    if (selects[1]) fireEvent.change(selects[1], { target: { value: 'qris' } });
    // rows (and the Bayar button) render only after loading finishes
    await waitFor(() => expect(screen.getByRole('button', { name: /^bayar$/i })).toBeTruthy(), {
      timeout: 2500,
    });
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: { message: 'Pembayaran gagal.' } }));
    fireEvent.click(screen.getByRole('button', { name: /^bayar$/i }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy(), { timeout: 2500 });
    fireEvent.click(screen.getByRole('button', { name: /ya, bayar/i }));
    await waitFor(() => expect(screen.getByText(/Pembayaran gagal/)).toBeTruthy(), {
      timeout: 2500,
    });
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        data: { id: 'f1', amount: 10000, paid_amount: 10000, paid_at: '2026-09-24T10:00:00Z' },
      })
    );
    await waitFor(() => expect(screen.getByRole('button', { name: /^bayar$/i })).toBeTruthy(), {
      timeout: 2500,
    });
    fireEvent.click(screen.getByRole('button', { name: /^bayar$/i }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy(), { timeout: 2500 });
    const payConfirm = screen.getAllByRole('button', { name: /ya, bayar/i }).at(-1);
    if (payConfirm) fireEvent.click(payConfirm);
    const cetak = await screen.findByRole('button', { name: /cetak/i }, { timeout: 2500 });
    fireEvent.click(cetak);
    fireEvent.click(screen.getByRole('button', { name: /salin bukti/i }));
    fireEvent.click(screen.getByRole('button', { name: /^tutup$/i }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /cetak/i })).toBeNull(), {
      timeout: 2500,
    });
  });

  it('denda admin: status filter + pay modal open', async () => {
    listRows = [
      {
        id: 'f1',
        loan_id: 'L-1',
        member_id: 'm1',
        amount: 5000,
        paid_amount: 0,
        status: 'unpaid',
        issued_at: '2026-09-01T00:00:00Z',
        paid_at: null,
        notes: null,
        due_at: '2026-09-05T00:00:00Z',
        books: { title: 'Buku A' },
        members: { member_code: 'AG-1' },
      },
    ];
    const view = render(<DendaAdminPage />);
    await waitFor(
      () => expect(screen.getByRole('heading', { level: 1, name: 'Denda' })).toBeTruthy(),
      { timeout: 2500 }
    );
    const selects = view.container.querySelectorAll('select');
    if (selects[0]) fireEvent.change(selects[0], { target: { value: 'paid' } });
    if (selects[1]) fireEvent.change(selects[1], { target: { value: 'cash' } });
    // admin pay flow uses window.confirm() + POST /pay — there is no modal on this page
    const payBtn = await screen.findByRole(
      'button',
      { name: /bayar denda anggota/i },
      { timeout: 2500 }
    );
    fireEvent.click(payBtn);
    await waitFor(
      () =>
        expect(
          fetchMock.mock.calls.some(
            (c) =>
              String(c[0]).includes('/pay') && (c[1] as RequestInit | undefined)?.method === 'POST'
          )
        ).toBe(true),
      { timeout: 2500 }
    );
  });

  it('konten page reload button refetches', async () => {
    const view = render(<KontenPage />);
    await waitFor(() => expect(screen.getByText('Konten')).toBeTruthy(), { timeout: 2500 });
    fireEvent.click(screen.getByRole('button', { name: /muat ulang/i }));
    // initial load (3 fetches) + reload (3 fetches)
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(6), {
      timeout: 2500,
    });
    // tab switches swap panels without refetching — assert panel content instead
    fireEvent.click(screen.getByRole('tab', { name: 'FAQ' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /tambah faq/i })).toBeTruthy(), {
      timeout: 2500,
    });
    expect(screen.getByRole('tab', { name: 'FAQ' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('tab', { name: 'Testimoni' }));
    expect(screen.getByRole('tab', { name: 'Testimoni' }).getAttribute('aria-selected')).toBe(
      'true'
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Halaman' }));
    expect(screen.getByRole('tab', { name: 'Halaman' }).getAttribute('aria-selected')).toBe('true');
    expect(view.container).toBeTruthy();
  });
});

describe('daftar network paths', () => {
  it('network throw surfaces jaringan error', async () => {
    render(<DaftarPage />);
    fetchMock.mockRejectedValueOnce(new Error('net down'));
    fireEvent.change(screen.getByLabelText(/nama lengkap/i), { target: { value: 'Budi' } });
    fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: 'b@x.id' } });
    fireEvent.change(screen.getByLabelText(/kata sandi/i), { target: { value: 'rahasia1' } });
    fireEvent.submit(screen.getByLabelText(/nama lengkap/i).closest('form')!);
    await waitFor(() => expect(screen.getByText(/kesalahan jaringan/i)).toBeTruthy(), {
      timeout: 2500,
    });
  });

  it('server rejection surfaces message', async () => {
    render(<DaftarPage />);
    fetchMock.mockResolvedValueOnce(
      jsonResponse(409, { error: { message: 'Email sudah terdaftar.' } })
    );
    fireEvent.change(screen.getByLabelText(/nama lengkap/i), { target: { value: 'Budi' } });
    fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: 'dupe@x.id' } });
    fireEvent.change(screen.getByLabelText(/kata sandi/i), { target: { value: 'rahasia1' } });
    fireEvent.submit(screen.getByLabelText(/nama lengkap/i).closest('form')!);
    await waitFor(() => expect(screen.getByText('Email sudah terdaftar.')).toBeTruthy(), {
      timeout: 2500,
    });
  });
});

describe('small components: chips, faq, header, search, upload, csv, theme, card', () => {
  it('CategoryChips toggles selection', () => {
    const onChange = vi.fn();
    render(
      <CategoryChips
        categories={[
          { id: 'c1', name: 'Fiksi', slug: 'fiksi' },
          { id: 'c2', name: 'Sains', slug: 'sains' },
        ]}
        activeId="c1"
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Fiksi' }));
    expect(onChange).toHaveBeenCalledWith(null);
    fireEvent.click(screen.getByRole('button', { name: 'Sains' }));
    expect(onChange).toHaveBeenCalledWith('c2');
    fireEvent.click(screen.getByRole('button', { name: 'Semua' }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('FaqAccordion clear + chip toggle + reset', () => {
    const view = render(
      <FaqAccordion
        faqs={[
          { id: '1', question: 'Q1?', answer: 'A1', category: 'Umum' },
          { id: '2', question: 'Q2?', answer: 'A2', category: 'Umum' },
        ]}
      />
    );
    const search = screen.getByRole('searchbox', { name: /cari pertanyaan/i });
    fireEvent.change(search, { target: { value: 'Q1' } });
    fireEvent.click(screen.getByRole('button', { name: /hapus pencarian/i }));
    expect((search as HTMLInputElement).value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Umum' }));
    fireEvent.click(screen.getByRole('button', { name: 'Umum' }));
    fireEvent.change(search, { target: { value: 'zzz-tidak-ada' } });
    fireEvent.click(screen.getByRole('button', { name: /atur ulang filter/i }));
    expect(
      (screen.getByRole('searchbox', { name: /cari pertanyaan/i }) as HTMLInputElement).value
    ).toBe('');
    expect(view.container).toBeTruthy();
  });

  it('ClassicHeader MenuButton toggles panel', () => {
    render(<ClassicHeader siteName="PerpusTest" settings={undefined} />);
    const toggle = screen.getByRole('button', { expanded: false });
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('SearchCombobox debounced search picks option', async () => {
    listRows = [
      {
        id: 'm1',
        member_code: 'AG-1',
        profiles: { full_name: 'Budi' },
        status: 'active',
        created_at: '2026-09-01T00:00:00Z',
      },
    ];
    const onPick = vi.fn();
    render(
      <SearchCombobox
        kind="members"
        label="Anggota"
        placeholder="Cari anggota"
        value=""
        onPick={onPick}
      />
    );
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'Budi' } });
    await waitFor(
      () =>
        expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/members'))).toBe(true),
      { timeout: 2500 }
    );
    const option = await screen.findByText(/Budi/i, {}, { timeout: 2500 });
    // options pick via onMouseDown (prevents input blur before selection)
    fireEvent.mouseDown(option);
    expect(onPick).toHaveBeenCalled();
  });

  it('UploadInput paste + file validation paths', async () => {
    const onUploaded = vi.fn();
    const view = render(
      <UploadInput onUploaded={onUploaded} folder="covers" label="Upload cover" />
    );
    const paste = view.container.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(paste, {
      target: { value: 'https://demo.supabase.co/storage/v1/object/public/covers/x.png' },
    });
    expect(onUploaded).toHaveBeenCalledWith(
      'https://demo.supabase.co/storage/v1/object/public/covers/x.png'
    );
    fireEvent.change(paste, { target: { value: 'javascript:alert(1)' } });
    expect(view.container.textContent).toContain('URL tidak diizinkan');
    const fileInput = view.container.querySelector('input[type="file"]') as HTMLInputElement;
    const bigFile = new File(['x'], 'big.png', { type: 'image/png' });
    Object.defineProperty(bigFile, 'size', { value: 20 * 1024 * 1024 });
    Object.defineProperty(fileInput, 'files', { value: [bigFile], configurable: true });
    fireEvent.change(fileInput);
    expect(view.container.textContent).toContain('maksimal 10MB');
    const svgFile = new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' });
    Object.defineProperty(fileInput, 'files', { value: [svgFile], configurable: true });
    fireEvent.change(fileInput);
    expect(view.container.textContent).toContain('Tipe file tidak didukung');
    const okFile = new File(['img'], 'ok.png', { type: 'image/png' });
    Object.defineProperty(fileInput, 'files', { value: [okFile], configurable: true });
    fireEvent.change(fileInput);
    await waitFor(
      () => expect(onUploaded).toHaveBeenCalledWith(expect.stringContaining('covers/')),
      { timeout: 2500 }
    );
    // controlled `value` prop: remount with a URL so clearing to '' actually fires onChange
    view.rerender(
      <UploadInput
        onUploaded={onUploaded}
        folder="covers"
        label="Upload cover"
        value="https://demo.supabase.co/storage/v1/object/public/covers/x.png"
      />
    );
    const paste2 = view.container.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(paste2, { target: { value: '' } });
    expect(onUploaded).toHaveBeenLastCalledWith('');
  });

  it('ThemeSwitcher early-returns on active theme', async () => {
    render(<ThemeSwitcher current="emerald" />);
    fetchMock.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /emerald/i }));
    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled(), { timeout: 500 });
    expect(screen.getByText('Tema saat ini')).toBeTruthy();
  });

  it('ReservationCard confirm/cancel paths', () => {
    const onCancel = vi.fn();
    const view = render(
      <ReservationCard
        row={{
          id: 'r1',
          status: 'pending',
          expires_at: '2026-10-01T00:00:00Z',
          books: { id: 'b1', title: 'Buku A', slug: 'buku-a' },
        }}
        cancelling={false}
        onCancel={onCancel}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /batal/i }));
    fireEvent.click(screen.getByRole('button', { name: /urungkan/i }));
    fireEvent.click(screen.getByRole('button', { name: /batal/i }));
    fireEvent.click(screen.getByRole('button', { name: /ya, batalkan/i }));
    expect(onCancel).toHaveBeenCalledWith('r1');
    expect(view.container).toBeTruthy();
  });

  it('error boundaries: retry + reset callbacks', async () => {
    vi.useFakeTimers();
    const reset1 = vi.fn();
    render(<ErrorPage error={new Error('Ledakan')} reset={reset1} />);
    fireEvent.click(screen.getAllByRole('button')[0]);
    await vi.advanceTimersByTimeAsync(15000);
    expect(reset1).toHaveBeenCalled();
    vi.useRealTimers();
    cleanup();

    const reset2 = vi.fn();
    render(<GlobalErrorPage error={new Error('Global')} reset={reset2} />);
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: /coba lagi/i }));
    await vi.advanceTimersByTimeAsync(15000);
    expect(reset2).toHaveBeenCalled();
    vi.useRealTimers();
    cleanup();

    const reset3 = vi.fn();
    render(<PublicErrorPage error={new Error('Publik')} reset={reset3} />);
    fireEvent.click(screen.getByRole('button', { name: /coba lagi/i }));
    expect(reset3).toHaveBeenCalled();
    cleanup();

    const reset4 = vi.fn();
    render(<AdminErrorPage error={new Error('Admin')} reset={reset4} />);
    fireEvent.click(screen.getByRole('button', { name: /coba lagi/i }));
    expect(reset4).toHaveBeenCalled();
  });
});
