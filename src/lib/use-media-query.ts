'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * useMediaQuery — true bila media query cocok (mis. breakpoint mobile).
 *
 * Dipakai DataTable untuk memilih SATU representasi baris (tabel desktop vs
 * kartu mobile) alih-alih mengandalkan utility `hidden`/`sm:hidden` saja:
 * Tailwind CSS tidak dimuat di jsdom, sehingga kedua pohon DOM (tabel + kartu)
 * dirender bersamaan dan setiap baris tombol/checkbox muncul dua kali.
 * Dengan render bersyarat, hanya satu representasi yang ada di DOM.
 *
 * useSyncExternalStore: getServerSnapshot dipakai saat SSR dan render klien
 * pertama (keduanya `false` = desktop) supaya tidak ada hydration mismatch;
 * store baru dibuat hanya di klien.
 *
 * jsdom mengembalikan `matches: false` untuk setiap query; lingkungan tanpa
 * window (SSR/pure node) juga jatuh ke default `false`.
 */
export function useMediaQuery(query: string): boolean {
  const getSnapshot = useCallback(
    () =>
      typeof window === 'undefined' || typeof window.matchMedia !== 'function'
        ? false
        : window.matchMedia(query).matches,
    [query]
  );
  const getServerSnapshot = useCallback(() => false, []);
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return () => {};
      }
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query]
  );

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Breakpoint mobile admin (<640px, setara `sm` Tailwind). */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 639px)');
}
