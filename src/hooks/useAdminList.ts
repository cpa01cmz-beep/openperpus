'use client';

/* ============================================================
 * src/hooks/useAdminList.ts — SATU hook daftar admin (issue #62).
 *
 * Sebelumnya setiap halaman admin menulis ulang blok yang sama:
 *   bangun URLSearchParams -> fetch -> res.json() -> setRows +
 *   setTotalPages (+ bedakan 404 "API belum ada" dan 401/403
 *   "bukan petugas"). Belasan salinan, beda penanganan error,
 *   beda per_page. Semuanya kini lewat hook ini.
 *
 * State halaman (page/setPage, filter, sort) TETAP milik
 * halaman; hook hanya mengurus pemuatan + hasilnya. Nanti
 * `params` berubah, request ikut berubah otomatis.
 *
 * Ukuran halaman tunggal: PER_PAGE di src/lib/pagination.ts.
 * ============================================================ */

import { useCallback, useEffect, useRef, useState } from 'react';
import { errMsg } from '@/lib/admin-errors';
import { PER_PAGE } from '@/lib/pagination';

/** Parameter query tambahan (nilai kosong/null diabaikan). */
export type ListParams = Record<string, string | number | null | undefined>;

export type UseAdminListOptions = {
  /** Path resource, mis. '/api/books'. */
  path: string;
  /** Filter/sort/q — di luar page & per_page. */
  params?: ListParams;
  /** Tunda request (ms) — dipakai search-as-you-type. */
  debounceMs?: number;
  /** Paksa cache: 'no-store' (data operasional yang tak boleh basi). */
  noStore?: boolean;
  /** Pesan cadangan bila server tak memberi pesan. */
  errorMessage?: string;
};

export type AdminList<T> = {
  rows: T[];
  loading: boolean;
  /** Pesan error pemuatan (kosong bila sukses). */
  error: string;
  totalPages: number;
  /** 404 — endpoint belum tersedia di backend. */
  missing: boolean;
  /** 401/403 — belum login atau bukan petugas. */
  denied: boolean;
  /** Muat ulang daftar (tombol "Muat ulang" / setelah mutasi). */
  reload: () => void;
  /** Kosongkan pesan error pemuatan tanpa refetch (dipakai sebelum aksi). */
  clearError: () => void;
};

/** Params -> query string stabil (dipakai sebagai dependensi effect). */
function serialize(params: ListParams | undefined): string {
  if (!params) return '';
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${String(v)}`)
    .join('&');
}

export function useAdminList<T>(options: UseAdminListOptions): AdminList<T> {
  const {
    path,
    params,
    debounceMs = 0,
    noStore = false,
    errorMessage = 'Gagal memuat data.',
  } = options;
  const query = serialize(params);

  const [rows, setRows] = useState<T[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [missing, setMissing] = useState(false);
  const [denied, setDenied] = useState(false);
  const [nonce, setNonce] = useState(0);

  // `reload()` dipakai setelah aksi tulis (bayar, hapus, tambah) dan harus
  // menyegarkan daftar SEGERA — bukan tertunda debounce. Flag sekali-pakai:
  // perubahan params biasa tetap ditunda.
  const immediateRef = useRef(false);
  const reload = useCallback(() => {
    immediateRef.current = true;
    setNonce((n) => n + 1);
  }, []);
  const clearError = useCallback(() => setError(''), []);

  useEffect(() => {
    // Ambil & langsung kosongkan: hanya pemanggilan reload() yang instan.
    const immediate = immediateRef.current;
    immediateRef.current = false;
    // Tandai effect mati: hasil request lama tak boleh menimpa state baru.
    let alive = true;

    const run = async () => {
      setLoading(true);
      setError('');
      try {
        const qs = new URLSearchParams(query);
        if (!qs.has('per_page')) qs.set('per_page', String(PER_PAGE));
        const res = await fetch(`${path}?${qs}`, noStore ? { cache: 'no-store' } : undefined);
        if (res.status === 404) {
          if (alive) {
            setMissing(true);
            setRows([]);
          }
          return;
        }
        if (res.status === 401 || res.status === 403) {
          if (alive) {
            setDenied(true);
            setRows([]);
          }
          return;
        }
        // Kontrak #61: satu envelope { data, pagination }. Fallback `meta`
        // sengaja TIDAK dibaca (tests/pagination-contract.test.ts).
        const json = (await res.json().catch(() => ({}))) as {
          data?: T[];
          pagination?: { totalPages?: number };
        };
        if (!res.ok) throw new Error(errMsg(json, errorMessage));
        if (!alive) return;
        setMissing(false);
        setDenied(false);
        setRows(json.data ?? []);
        setTotalPages(json.pagination?.totalPages ?? 1);
      } catch (e) {
        if (alive) setError((e as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    };

    if (immediate || debounceMs <= 0) {
      void run();
      return () => {
        alive = false;
      };
    }
    const timer = setTimeout(() => void run(), debounceMs);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, path, noStore, errorMessage, debounceMs, nonce]);

  return { rows, loading, error, totalPages, missing, denied, reload, clearError };
}
