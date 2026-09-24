// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

(globalThis as unknown as { React: unknown }).React = React;

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: Record<string, unknown>) =>
    React.createElement(
      'a',
      { href: typeof href === 'string' ? href : '#', ...rest },
      children as React.ReactNode
    ),
}));
vi.mock('next/image', () => ({
  default: ({ src, alt, ...rest }: Record<string, unknown>) => {
    void rest;
    return React.createElement('img', { src: String(src), alt: String(alt ?? '') });
  },
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
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => (globalThis as unknown as { __mockSupabase: unknown }).__mockSupabase),
}));
vi.mock('@/lib/supabase/client', () => ({
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

import {
  resetMockDb,
  installMockSupabase,
  setTable,
  setSignInResult,
} from './helpers/supabase-mock';
import MenuPage from '@/app/admin/menu/page';
import RakPage from '@/app/admin/rak/page';
import KategoriPage from '@/app/admin/kategori/page';
import BannerPage from '@/app/admin/banner/page';
import ArtikelPage from '@/app/admin/artikel/page';
import BukuAdminPage from '@/app/admin/buku/page';
import AnggotaPage from '@/app/admin/anggota/page';
import PeminjamanPage from '@/app/admin/peminjaman/page';
import ReservasiAdminPage from '@/app/admin/reservasi/page';
import KontenPage from '@/app/admin/konten/page';
import DendaAdminPage from '@/app/admin/denda/page';
import EditArtikelPage from '@/app/admin/artikel/edit/[id]/page';
import EditBannerPage from '@/app/admin/banner/edit/[id]/page';
import DendaSayaPage from '@/app/(public)/denda/page';
import ReservasiSayaPage from '@/app/(public)/reservasi-saya/page';
import LoginPage from '@/app/login/page';
import DaftarPage from '@/app/daftar/page';
import SettingsForm from '@/components/admin/SettingsForm';
import ThemeSwitcher from '@/components/admin/ThemeSwitcher';
import Modal from '@/components/ui/Modal';
import Pagination from '@/components/ui/Pagination';
import WishlistButton from '@/components/public/WishlistButton';
import OnboardingBanner from '@/components/public/OnboardingBanner';
import ReserveButton from '@/components/public/ReserveButton';

const lsStore = new Map<string, string>();
const lsShim = {
  getItem: (k: string) => lsStore.get(k) ?? null,
  setItem: (k: string, v: string) => {
    lsStore.set(k, String(v));
  },
  removeItem: (k: string) => {
    lsStore.delete(k);
  },
  clear: () => {
    lsStore.clear();
  },
  key: (i: number) => [...lsStore.keys()][i] ?? null,
  get length() {
    return lsStore.size;
  },
};
function installLocalStorage(target: object): void {
  try {
    Object.defineProperty(target, 'localStorage', {
      value: lsShim,
      configurable: true,
      writable: true,
    });
  } catch {
    /* keep whatever the environment provides */
  }
}
installLocalStorage(globalThis);
if (typeof window !== 'undefined') installLocalStorage(window);

type FetchJson = Record<string, unknown>;

const baseList: FetchJson = {
  data: [],
  meta: { page: 1, per_page: 20, total: 0 },
  pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
};

function jsonResponse(status: number, body: FetchJson) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

const defaultFetch = async (input: unknown, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : String((input as { url?: string }).url ?? input);
  const method = (init?.method ?? 'GET').toUpperCase();
  if (url.includes('/api/register'))
    return jsonResponse(201, { data: { id: 'm-new', member_code: 'AG-9' } });
  if (url.includes('/api/settings'))
    return jsonResponse(200, { data: { fine_per_day: 1500, name: 'Perpustakaan Digital' } });
  if (url.includes('/api/fines'))
    return jsonResponse(200, { data: [], meta: { totalPages: 1 }, pagination: { totalPages: 1 } });
  if (method === 'GET') return jsonResponse(200, baseList);
  return jsonResponse(method === 'POST' ? 201 : 200, { data: { id: 'row-new' }, message: 'ok' });
};
const fetchMock = vi.fn(defaultFetch);

beforeEach(() => {
  resetMockDb();
  installMockSupabase();
  nav.push.mockReset();
  nav.refresh.mockReset();
  fetchMock.mockReset();
  fetchMock.mockImplementation(defaultFetch);
  vi.stubGlobal('fetch', fetchMock);
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function renderAndSettle(ui: React.ReactElement, heading?: string) {
  const view = render(ui);
  if (heading) {
    await waitFor(
      () => expect(screen.getAllByRole('heading', { level: 1 }).length).toBeGreaterThan(0),
      { timeout: 3000 }
    );
    expect(
      screen.getAllByRole('heading', { level: 1 }).some((h) => h.textContent === heading)
    ).toBe(true);
  } else {
    await waitFor(() => expect(fetchMock).toHaveBeenCalled(), { timeout: 3000 });
  }
  return view;
}

describe('admin list pages (client, loaded state)', () => {
  it('menu page loads + heading', async () => {
    await renderAndSettle(<MenuPage />, 'Menu');
    await waitFor(
      () =>
        expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/menus'))).toBe(true),
      { timeout: 2500 }
    );
  });

  it('rak page loads + heading', async () => {
    await renderAndSettle(<RakPage />, 'Rak');
    await waitFor(
      () =>
        expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/racks'))).toBe(true),
      { timeout: 2500 }
    );
  });

  it('kategori page loads + heading', async () => {
    await renderAndSettle(<KategoriPage />, 'Kategori');
    await waitFor(
      () =>
        expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/categories'))).toBe(
          true
        ),
      { timeout: 2500 }
    );
  });

  it('banner page loads + heading', async () => {
    await renderAndSettle(<BannerPage />, 'Banner');
    await waitFor(
      () =>
        expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/banners'))).toBe(true),
      { timeout: 2500 }
    );
  });

  it('artikel page loads + heading', async () => {
    await renderAndSettle(<ArtikelPage />, 'Artikel');
    await waitFor(
      () =>
        expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/articles'))).toBe(true),
      { timeout: 2500 }
    );
  });

  it('buku page loads + heading', async () => {
    await renderAndSettle(<BukuAdminPage />, 'Buku');
    await waitFor(
      () =>
        expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/books'))).toBe(true),
      { timeout: 2500 }
    );
  });

  it('anggota page loads + heading', async () => {
    await renderAndSettle(<AnggotaPage />, 'Anggota');
    await waitFor(
      () =>
        expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/members'))).toBe(true),
      { timeout: 2500 }
    );
  });

  it('peminjaman page loads + heading', async () => {
    await renderAndSettle(<PeminjamanPage />, 'Peminjaman');
    await waitFor(
      () =>
        expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/loans'))).toBe(true),
      { timeout: 2500 }
    );
  });

  it('reservasi admin page loads + heading', async () => {
    await renderAndSettle(<ReservasiAdminPage />, 'Reservasi');
    await waitFor(
      () =>
        expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/reservations'))).toBe(
          true
        ),
      { timeout: 2500 }
    );
  });

  it('denda admin page loads + heading', async () => {
    await renderAndSettle(<DendaAdminPage />, 'Denda');
    await waitFor(
      () =>
        expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/fines'))).toBe(true),
      { timeout: 2500 }
    );
  });

  it('konten page loads, tab switch hits faqs + testimonials', async () => {
    const view = render(<KontenPage />);
    await waitFor(
      () => expect(screen.getAllByRole('heading', { level: 1 }).length).toBeGreaterThan(0),
      { timeout: 3000 }
    );
    expect(screen.getByText('Konten')).toBeTruthy();
    const faqTab = screen.getByRole('tab', { name: 'FAQ' });
    fireEvent.click(faqTab);
    await waitFor(
      () => expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/faqs'))).toBe(true),
      { timeout: 3000 }
    );
    const testimoniTab = screen.getByRole('tab', { name: 'Testimoni' });
    fireEvent.click(testimoniTab);
    await waitFor(
      () =>
        expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/testimonials'))).toBe(
          true
        ),
      { timeout: 3000 }
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Halaman' }));
    await waitFor(
      () =>
        expect(
          view.container.querySelector('table, form, [role="tab"][aria-selected="true"]')
        ).toBeTruthy(),
      { timeout: 3000 }
    );
  });
});

describe('edit pages loaded + missing', () => {
  it('artikel edit loads form from supabase single', async () => {
    setTable('articles', {
      single: {
        data: {
          id: 'a1',
          title: 'Judul',
          slug: 'judul',
          content_md: 'isi',
          status: 'draft',
          excerpt: '',
          cover_url: '',
          category: '',
        },
      },
    });
    const view = render(<EditArtikelPage params={{ id: 'a1' }} />);
    await waitFor(() => expect(view.container.querySelector('form')).toBeTruthy(), {
      timeout: 3000,
    });
    expect(
      screen.getAllByRole('heading', { level: 1 }).some((h) => h.textContent === 'Edit Artikel')
    ).toBe(true);
    expect(
      Array.from(view.container.querySelectorAll('input')).some(
        (i) => (i as HTMLInputElement).value === 'Judul'
      )
    ).toBe(true);
  });

  it('artikel edit missing row shows error', async () => {
    setTable('articles', { single: { data: null, error: { message: 'nf' } } });
    render(<EditArtikelPage params={{ id: 'zz' }} />);
    await waitFor(() => expect(screen.getByText(/tidak ditemukan/i)).toBeTruthy(), {
      timeout: 3000,
    });
  });

  it('banner edit loads form from supabase single', async () => {
    setTable('banners', {
      single: {
        data: {
          id: 'bn1',
          title: 'Promo',
          subtitle: '',
          image_url: 'https://x.supabase.co/a.png',
          link: '/katalog',
          sort_order: 1,
          is_active: true,
        },
      },
    });
    const view = render(<EditBannerPage params={{ id: 'bn1' }} />);
    await waitFor(() => expect(view.container.querySelector('form')).toBeTruthy(), {
      timeout: 3000,
    });
    expect(
      screen.getAllByRole('heading', { level: 1 }).some((h) => h.textContent === 'Edit Banner')
    ).toBe(true);
    expect(
      Array.from(view.container.querySelectorAll('input')).some(
        (i) => (i as HTMLInputElement).value === 'Promo'
      )
    ).toBe(true);
  });

  it('banner edit missing row shows error', async () => {
    setTable('banners', { single: { data: null, error: { message: 'nf' } } });
    render(<EditBannerPage params={{ id: 'zz' }} />);
    await waitFor(() => expect(screen.getByText(/tidak ditemukan/i)).toBeTruthy(), {
      timeout: 3000,
    });
  });
});

describe('public client pages', () => {
  it('denda saya loads fines + settings', async () => {
    const view = render(<DendaSayaPage />);
    await waitFor(
      () =>
        expect(
          screen.getAllByRole('heading', { level: 1 }).some((h) => h.textContent === 'Denda Saya')
        ).toBe(true),
      { timeout: 3000 }
    );
    await waitFor(
      () =>
        expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/settings'))).toBe(true),
      { timeout: 2500 }
    );
    await waitFor(
      () =>
        expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/fines'))).toBe(true),
      { timeout: 2500 }
    );
    expect(view.container).toBeTruthy();
  });

  it('denda saya 401 -> login prompt branch', async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'Silakan login.' } })
    );
    render(<DendaSayaPage />);
    await waitFor(() => expect(screen.getByText(/silakan login|login/i)).toBeTruthy(), {
      timeout: 3000,
    });
  });

  it('reservasi-saya loads own reservations + loans', async () => {
    render(<ReservasiSayaPage />);
    await waitFor(
      () =>
        expect(
          screen
            .getAllByRole('heading', { level: 1 })
            .some((h) => h.textContent.includes('Reservasi'))
        ).toBe(true),
      { timeout: 3000 }
    );
    await waitFor(
      () =>
        expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/reservations'))).toBe(
          true
        ),
      { timeout: 2500 }
    );
    await waitFor(
      () =>
        expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/loans'))).toBe(true),
      { timeout: 2500 }
    );
  });

  it('reservasi-saya offline -> offline branch', async () => {
    fetchMock.mockImplementation(async () => {
      throw new Error('network down');
    });
    render(<ReservasiSayaPage />);
    await waitFor(() => expect(screen.getByText(/offline/i)).toBeTruthy(), { timeout: 3000 });
  });

  it('login form validation + success push + failure message', async () => {
    render(<LoginPage />);
    expect(screen.getByText(/Masuk Anggota/i)).toBeTruthy();
    const email = screen.getByLabelText(/email/i);
    const pass = screen.getByLabelText(/kata sandi/i);
    fireEvent.change(email, { target: { value: '' } });
    fireEvent.submit(email.closest('form')!);
    await waitFor(() => expect(screen.getByText(/wajib diisi/i)).toBeTruthy(), { timeout: 2000 });
    fireEvent.change(email, { target: { value: 'a@b.c' } });
    fireEvent.change(pass, { target: { value: 'rahasia1' } });
    fireEvent.submit(email.closest('form')!);
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/admin'), { timeout: 3000 });
  });

  it('login failure shows wrong credentials', async () => {
    setSignInResult({ data: { user: null }, error: { message: 'invalid' } });
    render(<LoginPage />);
    const email = screen.getByLabelText(/email/i);
    const pass = screen.getByLabelText(/kata sandi/i);
    fireEvent.change(email, { target: { value: 'a@b.c' } });
    fireEvent.change(pass, { target: { value: 'salah' } });
    fireEvent.submit(email.closest('form')!);
    await waitFor(() => expect(screen.getByText(/salah|gagal|incorrect/i)).toBeTruthy(), {
      timeout: 3000,
    });
    setSignInResult({ data: { user: { id: 'u1' } }, error: null });
  });

  it('daftar: client validation then 201 success', async () => {
    render(<DaftarPage />);
    expect(screen.getByText('Daftar Anggota')).toBeTruthy();
    const nama = screen.getByLabelText(/nama lengkap/i);
    fireEvent.submit(nama.closest('form')!);
    await waitFor(() => expect(screen.getByText(/wajib diisi/i)).toBeTruthy(), { timeout: 2000 });
    fireEvent.change(nama, { target: { value: 'Budi Santoso' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'budi@mail.id' } });
    fireEvent.change(screen.getByLabelText(/kata sandi/i), { target: { value: 'rahasia1' } });
    fireEvent.submit(nama.closest('form')!);
    await waitFor(() => expect(screen.getByText(/Pendaftaran diterima/i)).toBeTruthy(), {
      timeout: 3000,
    });
    await waitFor(
      () =>
        expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/register'))).toBe(true),
      { timeout: 2500 }
    );
  });
});

describe('interactive components (effects + handlers)', () => {
  it('SettingsForm rejects short name then PUTs valid payload', async () => {
    const view = render(<SettingsForm initial={{ name: 'Ab', fine_per_day: 1500 }} />);
    const form = view.container.querySelector('form')!;
    fireEvent.submit(form);
    await waitFor(() => expect(screen.getByText(/minimal 3 karakter/i)).toBeTruthy(), {
      timeout: 2000,
    });
    const nameInput = view.container.querySelector('#settings-name') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Perpustakaan Digital' } });
    fireEvent.submit(form);
    await waitFor(() => expect(screen.getByText(/berhasil disimpan/i)).toBeTruthy(), {
      timeout: 3000,
    });
    expect(
      fetchMock.mock.calls.some(
        (c) => String(c[0]).includes('/api/settings') && c[1]?.method === 'PUT'
      )
    ).toBe(true);
  });

  it('ThemeSwitcher switches theme via PUT + refresh', async () => {
    render(<ThemeSwitcher current="emerald" />);
    const paper = screen.getByRole('button', { name: /Paper Minimal/i });
    fireEvent.click(paper);
    await waitFor(() => expect(nav.refresh).toHaveBeenCalled(), { timeout: 3000 });
    expect(
      fetchMock.mock.calls.some(
        (c) => c[1]?.method === 'PUT' && String(c[1]?.body).includes('paper')
      )
    ).toBe(true);
  });

  it('Modal escape + close button + overlay click', () => {
    const onClose = vi.fn();
    const view = render(
      <Modal open onClose={onClose} title="Konfirmasi">
        <p>Body</p>
      </Modal>
    );
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Tutup dialog/i }));
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.mouseDown(view.container.firstChild as Element);
    expect(onClose).toHaveBeenCalledTimes(3);
    cleanup();
    const closed = render(
      <Modal open={false} onClose={vi.fn()} title="X">
        y
      </Modal>
    );
    expect(closed.container.firstChild).toBeNull();
  });

  it('Pagination onPageChange fires', () => {
    const onPg = vi.fn();
    render(<Pagination page={2} totalPages={5} onPageChange={onPg} />);
    fireEvent.click(screen.getByRole('button', { name: 'Halaman 5' }));
    expect(onPg).toHaveBeenCalledWith(5);
    fireEvent.click(screen.getByRole('button', { name: 'Halaman sebelumnya' }));
    expect(onPg).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole('button', { name: 'Halaman berikutnya' }));
    expect(onPg).toHaveBeenCalledWith(3);
  });

  it('WishlistButton toggles persisted state', async () => {
    render(<WishlistButton slug="buku-a" title="Buku A" />);
    expect(screen.getByRole('button', { name: /simpan ke wishlist/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /simpan ke wishlist/i }));
    await waitFor(
      () => expect(screen.getByRole('button', { name: /hapus dari wishlist/i })).toBeTruthy(),
      { timeout: 2000 }
    );
    expect(localStorage.getItem('openperpus:wishlist:v1')).toContain('buku-a');
    cleanup();
    render(<WishlistButton slug="buku-a" />);
    await waitFor(
      () => expect(screen.getByRole('button', { name: /hapus dari wishlist/i })).toBeTruthy(),
      { timeout: 2000 }
    );
  });

  it('OnboardingBanner dismiss persists', async () => {
    render(<OnboardingBanner />);
    await waitFor(() => expect(screen.getByRole('region', { name: /panduan/i })).toBeTruthy(), {
      timeout: 2000,
    });
    fireEvent.click(screen.getByRole('button', { name: /tutup panduan/i }));
    await waitFor(() => expect(screen.queryByRole('region', { name: /panduan/i })).toBeNull(), {
      timeout: 2000,
    });
    expect(localStorage.getItem('openperpus:onboarding-dismissed')).toBe('1');
    cleanup();
    render(<OnboardingBanner />);
    expect(screen.queryByRole('region', { name: /panduan/i })).toBeNull();
  });

  it('ReserveButton 201 -> done status; 401 -> login push', async () => {
    render(<ReserveButton bookId="b1" slug="buku-a" title="Buku A" waHref={null} />);
    fireEvent.click(screen.getByRole('button', { name: /Reservasi 1-klik/i }));
    await waitFor(() => expect(screen.getByText(/tercatat/i)).toBeTruthy(), { timeout: 3000 });
    cleanup();
    fetchMock.mockImplementationOnce(async () =>
      jsonResponse(401, { error: { code: 'UNAUTHORIZED' } })
    );
    render(<ReserveButton bookId="b1" slug="buku-a" title="Buku A" waHref={null} />);
    fireEvent.click(screen.getByRole('button', { name: /Reservasi 1-klik/i }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith(expect.stringContaining('/login')), {
      timeout: 3000,
    });
  });

  it('ReserveButton 500 -> error + WA fallback', async () => {
    fetchMock.mockImplementationOnce(async () =>
      jsonResponse(500, { message: 'Reservasi penuh.' })
    );
    render(<ReserveButton bookId="b1" slug="buku-a" title="Buku A" waHref="https://wa.me/62812" />);
    fireEvent.click(screen.getByRole('button', { name: /Reservasi 1-klik/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy(), { timeout: 3000 });
    expect(screen.getByRole('link', { name: /via WA/i })).toBeTruthy();
  });
});
