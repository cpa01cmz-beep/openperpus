import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearWishlist, getWishlist, isSaved, toggleWishlist } from '@/lib/wishlist';

// S-roi11 Wishlist Simpanku — pure client localStorage, no DB.
// RED first: src/lib/wishlist.ts belum ada saat tes ini ditulis.

function stubLocalStorage() {
  let store: Record<string, string> = {};
  const mock = {
    getItem: vi.fn((k: string) => (k in store ? store[k] : null)),
    setItem: vi.fn((k: string, v: string) => {
      store[k] = v;
    }),
    removeItem: vi.fn((k: string) => {
      delete store[k];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
  vi.stubGlobal('localStorage', mock);
  return {
    mock,
    snapshot: () => ({ ...store }),
    restore: (s: Record<string, string>) => (store = { ...s }),
  };
}

describe('roi11 wishlist (localStorage)', () => {
  let ls: ReturnType<typeof stubLocalStorage>;

  beforeEach(() => {
    vi.unstubAllGlobals();
    ls = stubLocalStorage();
    vi.stubGlobal('window', {});
  });

  it('empty -> [] saat belum ada data', () => {
    expect(getWishlist()).toEqual([]);
  });

  it('toggle menambah slug lalu toggle lagi menghapus', () => {
    expect(toggleWishlist('buku-a')).toEqual(['buku-a']);
    expect(isSaved('buku-a')).toBe(true);
    expect(toggleWishlist('buku-a')).toEqual([]);
    expect(isSaved('buku-a')).toBe(false);
  });

  it('isSaved true/false per slug', () => {
    toggleWishlist('buku-a');
    expect(isSaved('buku-a')).toBe(true);
    expect(isSaved('buku-lain')).toBe(false);
  });

  it('getWishlist persists across reload (baca ulang dari localStorage)', () => {
    toggleWishlist('buku-a');
    toggleWishlist('buku-b');
    const snap = ls.snapshot();
    ls.restore({}); // simulasi memori modul kosong — state hanya di storage
    ls.mock.getItem.mockImplementation((k: string) => (k in snap ? snap[k] : null));
    expect(getWishlist()).toEqual(['buku-a', 'buku-b']);
  });

  it('corrupt JSON -> [] tanpa throw', () => {
    ls.mock.getItem.mockReturnValue('{corrupt');
    expect(() => getWishlist()).not.toThrow();
    expect(getWishlist()).toEqual([]);
    expect(isSaved('buku-a')).toBe(false);
    expect(() => toggleWishlist('buku-a')).not.toThrow();
  });

  it('clearWishlist mengosongkan daftar', () => {
    toggleWishlist('buku-a');
    clearWishlist();
    expect(getWishlist()).toEqual([]);
  });
});
