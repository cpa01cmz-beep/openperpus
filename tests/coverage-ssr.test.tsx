import { describe, expect, it, beforeEach, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as unknown as { React: unknown }).React = React;

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
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
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

import { resetMockDb, installMockSupabase } from './helpers/supabase-mock';
import { FALLBACK_SETTINGS } from '@/lib/types';
import ClassicHero from '@/components/hero/variants/ClassicHero';
import CenteredHero from '@/components/hero/variants/CenteredHero';
import StackedHero from '@/components/hero/variants/StackedHero';
import SplitHero from '@/components/hero/variants/SplitHero';
import EditorialHero from '@/components/hero/variants/EditorialHero';
import { HeroFallback } from '@/components/hero/variants/HeroFallback';
import ClassicHeader from '@/components/layout/variants/headers/ClassicHeader';
import CenteredHeader from '@/components/layout/variants/headers/CenteredHeader';
import MinimalHeader from '@/components/layout/variants/headers/MinimalHeader';
import TopBarHeader from '@/components/layout/variants/headers/TopBarHeader';
import SplitHeader from '@/components/layout/variants/headers/SplitHeader';
import ClassicFooter from '@/components/layout/variants/footers/ClassicFooter';
import MinimalFooter from '@/components/layout/variants/footers/MinimalFooter';
import StackedFooter from '@/components/layout/variants/footers/StackedFooter';
import Navbar from '@/components/public/Navbar';
import Footer from '@/components/public/Footer';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import StatCard from '@/components/admin/StatCard';
import Pagination from '@/components/ui/Pagination';
import Modal from '@/components/ui/Modal';
import DataTable from '@/components/admin/DataTable';
import LogsTable from '@/components/admin/LogsTable';
import SettingsForm from '@/components/admin/SettingsForm';
import BookForm from '@/components/admin/BookForm';
import ThemeSwitcher from '@/components/admin/ThemeSwitcher';
import BookCard from '@/components/public/BookCard';
import TestimonialCard from '@/components/public/TestimonialCard';
import StatsBar from '@/components/public/StatsBar';
import Breadcrumb from '@/components/public/Breadcrumb';
import CategoryChips from '@/components/public/CategoryChips';
import NotFound from '@/app/not-found';
import AdminLoading from '@/app/admin/loading';
import PublicLoading from '@/app/(public)/loading';

const SETTINGS = { ...FALLBACK_SETTINGS, name: 'Perpustakaan Digital', tagline: 'Membaca Bersama' };

function render(el: React.ReactElement): string {
  return renderToStaticMarkup(el);
}

beforeEach(() => {
  resetMockDb();
  installMockSupabase();
});

describe('hero variants SSR render', () => {
  const banners = [
    {
      id: 'b1',
      title: 'Promo Spesial',
      subtitle: 'Sub judul',
      image_url: 'https://x.supabase.co/a.png',
      link: '/katalog',
      sort_order: 1,
    },
    {
      id: 'b2',
      title: 'Koleksi Baru',
      subtitle: null,
      image_url: 'https://x.supabase.co/b.png',
      link: '/katalog',
      sort_order: 2,
    },
  ];
  const variants = [
    ['ClassicHero', ClassicHero],
    ['CenteredHero', CenteredHero],
    ['StackedHero', StackedHero],
    ['SplitHero', SplitHero],
    ['EditorialHero', EditorialHero],
  ] as const;

  it.each(variants)('%s renders banner titles + carousel controls + fallback', (name, Comp) => {
    const html = render(
      <Comp banners={banners} siteName="Perpustakaan Digital" tagline="Membaca" />
    );
    expect(html).toContain('Promo Spesial');
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-roledescription="carousel"');
    expect(html.length).toBeGreaterThan(200);
    const fallback = render(<Comp banners={[]} siteName="Perpustakaan Digital" />);
    expect(fallback).toContain('Selamat datang di');
    expect(fallback).toContain(name === 'HeroFallback' ? '' : 'Perpustakaan Digital');
  });

  it('HeroFallback renders site name + CTA', () => {
    const html = render(<HeroFallback siteName="Perpus Uji" tagline="Tagline Uji" />);
    expect(html).toContain('Perpus Uji');
    expect(html).toContain('Tagline Uji');
    expect(html).toContain('/katalog');
  });
});

describe('layout variants SSR render', () => {
  const headers = [
    ['ClassicHeader', ClassicHeader],
    ['CenteredHeader', CenteredHeader],
    ['MinimalHeader', MinimalHeader],
    ['TopBarHeader', TopBarHeader],
    ['SplitHeader', SplitHeader],
  ] as const;

  it.each(headers)('%s renders site name + nav links', (name, Comp) => {
    const html = render(<Comp siteName={name} tagline="Tag" settings={SETTINGS} />);
    expect(html).toContain('header');
    expect(html).toContain('Katalog');
    expect(html).toContain(name);
  });

  const footers = [
    ['ClassicFooter', ClassicFooter],
    ['MinimalFooter', MinimalFooter],
    ['StackedFooter', StackedFooter],
  ] as const;

  it.each(footers)('%s renders contact links', (name, Comp) => {
    const html = render(<Comp settings={SETTINGS} />);
    expect(html).toContain('footer');
    expect(html).toContain('Katalog');
    expect(name).toBeTruthy();
  });

  it('Navbar + Footer resolve variants by theme', () => {
    expect(
      render(<Navbar siteName="Perpus Uji" settings={SETTINGS} themeId="emerald" />)
    ).toContain('Perpus Uji');
    expect(
      render(<Navbar siteName="Perpus Uji" settings={SETTINGS} themeId="midnight" />)
    ).toContain('Perpus Uji');
    expect(render(<Footer settings={SETTINGS} themeId="emerald" />)).toContain('footer');
    expect(render(<Footer settings={{ ...SETTINGS, active_theme: 'ocean' }} />)).toContain(
      'footer'
    );
  });
});

describe('ui primitives SSR render', () => {
  it('Button variants render with classes and loading state', () => {
    for (const variant of ['primary', 'amber', 'outline', 'ghost', 'danger'] as const) {
      const html = render(<Button variant={variant}>Klik</Button>);
      expect(html).toContain('Klik');
      expect(html).toContain('min-h-[44px]');
    }
    const loading = render(<Button loading>Simpan</Button>);
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain('disabled');
    expect(render(<Button fullWidth>Lebar</Button>)).toContain('w-full');
  });

  it('Input renders label + error + hint wiring', () => {
    const withError = render(
      <Input label="Judul" error="Wajib diisi" hint="Petunjuk" id="judul" />
    );
    expect(withError).toContain('Wajib diisi');
    expect(withError).toContain('aria-invalid="true"');
    expect(withError).toContain('aria-describedby');
    expect(render(<Input label="Penulis" hint="PEN" />)).toContain('PEN');
  });

  it('Badge/EmptyState/StatCard render content', () => {
    expect(render(<Badge tone="emerald">Tersedia</Badge>)).toContain('Tersedia');
    expect(render(<Badge>Habis</Badge>)).toContain('Habis');
    const es = render(
      <EmptyState title="Belum ada" description="Kosong dulu" action={<span>A</span>} />
    );
    expect(es).toContain('Belum ada');
    expect(es).toContain('role="status"');
    expect(render(<StatCard label="Buku" value={42} hint="h" />)).toContain('42');
  });

  it('Pagination renders pages + href links', () => {
    const html = render(<Pagination page={3} totalPages={10} hrefForPage={(p) => `/k?p=${p}`} />);
    expect(html).toContain('Halaman 3');
    expect(html).toContain('/k?p=9');
    expect(html).toContain('/k?p=4');
    expect(html).toContain('aria-current="page"');
    expect(render(<Pagination page={1} totalPages={1} />)).toBe('');
  });

  it('Pagination with onPageChange renders buttons', () => {
    const html = render(<Pagination page={1} totalPages={3} onPageChange={() => {}} />);
    expect(html).toContain('<button');
    expect(html).toContain('Halaman 2');
  });

  it('Modal closed -> null; open -> dialog', () => {
    expect(
      render(
        <Modal open={false} onClose={() => {}} title="X">
          y
        </Modal>
      )
    ).toBe('');
    const html = render(
      <Modal
        open
        onClose={() => {}}
        title="Judul Modal"
        description="Desc"
        footer={<button>OK</button>}
      >
        <p>Isi</p>
      </Modal>
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('Judul Modal');
    expect(html).toContain('Tutup dialog');
    expect(html).toContain('Isi');
  });

  it('DataTable renders rows/caption/sort/bulk controls', () => {
    type Row = { id: string; title: string; slug: string };
    const columns = [
      { key: 'title', header: 'Judul', sortable: true },
      { key: 'slug', header: 'Slug' },
    ];
    const html = render(
      <DataTable<Row>
        columns={columns}
        rows={[{ id: '1', title: 'Buku A', slug: 'buku-a' }]}
        caption="Tabel uji"
        sortKey="title"
        sortDir="asc"
        onSort={() => {}}
        selectedKeys={new Set(['1'])}
        onToggleRow={() => {}}
        onToggleAll={() => {}}
        getRowKey={(r: Row, i: number) => r.id ?? String(i)}
      />
    );
    expect(html).toContain('Buku A');
    expect(html).toContain('Tabel uji');
    expect(html).toContain('aria-sort');
    const empty = render(
      <DataTable<Row>
        columns={columns}
        rows={[]}
        caption="Kosong"
        getRowKey={(r: Row, i: number) => r.id ?? String(i)}
      />
    );
    expect(empty).toContain('role="status"');
  });

  it('LogsTable renders wrapped DataTable with columns', () => {
    const html = render(
      <LogsTable
        rows={[
          {
            id: 'l1',
            action: 'books.create',
            entity_type: 'books',
            entity_id: 'b1',
            user_id: null,
            metadata: {},
            created_at: '2026-01-01T00:00:00Z',
          },
        ]}
        caption="Log aktivitas halaman 1"
      />
    );
    expect(html).toContain('books.create');
    expect(html).toContain('Log aktivitas halaman 1');
  });

  it('SettingsForm renders initial values + status region', () => {
    const html = render(
      <SettingsForm
        initial={{ name: 'Perpustakaan Digital', fine_per_day: 1500, email: 'a@b.c' }}
      />
    );
    expect(html).toContain('Perpustakaan Digital');
    expect(html).toContain('1500');
    expect(html).toContain('settings-form-status');
    expect(html).toContain('Pengaturan');
  });

  it('BookForm create + edit modes with category/rack options', () => {
    const create = render(
      <BookForm
        mode="create"
        categories={[{ id: 'c1', name: 'Fiksi' }]}
        racks={[{ id: 'r1', code: 'A1', name: 'Rak A' }]}
      />
    );
    expect(create).toContain('Judul');
    expect(create).toContain('Fiksi');
    expect(create).toContain('Rak A');
    const edit = render(
      <BookForm mode="edit" initial={{ id: 'b1', title: 'Buku Lama', author: 'Penulis' }} />
    );
    expect(edit).toContain('Buku Lama');
  });

  it('ThemeSwitcher renders theme cards + active badge', () => {
    const html = render(<ThemeSwitcher current="emerald" />);
    expect(html).toContain('Tema Tampilan');
    expect(html).toContain('Midnight Premium');
    expect(html).toContain('Tema saat ini');
    expect(html).toContain('Aktifkan tema ini');
  });

  it('public cards render', () => {
    const book = {
      id: 'b1',
      title: 'Buku A',
      slug: 'buku-a',
      author: 'Ani',
      cover_url: null,
      stock_total: 3,
      stock_available: 1,
      rating_avg: 4,
      featured: false,
      categories: { id: 'c1', name: 'Fiksi', slug: 'fiksi' },
    } as never;
    expect(render(<BookCard book={book} />)).toContain('Buku A');
    expect(
      render(<StatsBar totalBooks={10} totalCopies={40} totalCategories={3} totalArticles={7} />)
    ).toContain('Judul Buku');
    expect(
      render(<Breadcrumb items={[{ label: 'Beranda', href: '/' }, { label: 'Katalog' }]} />)
    ).toContain('Beranda');
    expect(
      render(
        <CategoryChips
          categories={[{ id: 'c1', name: 'Fiksi', slug: 'fiksi' }]}
          activeId="c1"
          onChange={() => {}}
        />
      )
    ).toContain('Fiksi');
    expect(
      render(
        <TestimonialCard
          item={{
            id: 't1',
            name: 'Andi',
            content: 'Mantap',
            role: 'Mahasiswa',
            avatar_url: null,
            rating: 5,
            is_active: true,
            sort_order: 0,
            created_at: '2026-01-01T00:00:00Z',
          }}
        />
      )
    ).toContain('Mantap');
  });

  it('error + not-found + loading boundaries render', () => {
    expect(render(<NotFound />)).toContain('nf-title');
    expect(render(<AdminLoading />)).toContain('animate-pulse');
    expect(render(<PublicLoading />)).toContain('animate-pulse');
  });
});
