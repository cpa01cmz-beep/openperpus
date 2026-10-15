import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Category } from '@/lib/types';
import type { CatalogSortKey } from '@/components/public/CatalogControls';
import CatalogExplorerFilters from '@/components/public/CatalogExplorerFilters';

const categories: Pick<Category, 'id' | 'name' | 'slug'>[] = [
  { id: 'c1', name: 'Fiksi', slug: 'fiksi' },
  { id: 'c2', name: 'Sejarah', slug: 'sejarah' },
];

const BASE = {
  initialQ: '',
  initialCategoryId: null as string | null,
  initialSort: 'terbaru' as CatalogSortKey,
  initialAvailableOnly: false,
};

// next/navigation di-mock global (tests/setup.tsx): router.push tidak mengubah
// props, jadi props URL sengaja "tertinggal" dari state lokal seperti pada
// jendela transisi router di aplikasi nyata.
const filtersEl = (over: Partial<typeof BASE> = {}) => (
  <CatalogExplorerFilters
    categories={categories}
    resultCount={1}
    serverTotal={1}
    {...BASE}
    {...over}
  />
);

describe('CatalogExplorerFilters sinkron props URL -> state (review #235)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ganti kategori tidak menimpa teks pencarian yang sedang ditulis', async () => {
    const { rerender } = render(filtersEl());

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'harry' } });

    // Debounce SearchBar 300ms + push URL 400ms sudah lewat: state q = 'harry'
    // sementara prop initialQ masih '' (router.push di-mock).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    // URL berganti karena kategori dipilih — hanya kategori yang berubah.
    rerender(filtersEl({ initialCategoryId: 'c1' }));

    expect(screen.getByRole('searchbox')).toHaveValue('harry');
    expect(screen.getByRole('status')).toHaveTextContent('harry');
  });

  it('ganti sort tidak menimpa teks pencarian yang sedang ditulis', async () => {
    const { rerender } = render(filtersEl());

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'risalah' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    rerender(filtersEl({ initialSort: 'judul' }));

    expect(screen.getByRole('searchbox')).toHaveValue('risalah');
    expect(screen.getByRole('combobox', { name: /urutkan/i })).toHaveValue('judul');
  });

  it('prop q yang benar-benar berubah tetap mengisi kotak pencarian', () => {
    const { rerender } = render(filtersEl());

    expect(screen.getByRole('searchbox')).toHaveValue('');

    rerender(filtersEl({ initialQ: 'bumi' }));

    expect(screen.getByRole('searchbox')).toHaveValue('bumi');
    expect(screen.getByRole('status')).toHaveTextContent('bumi');
  });
});
