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
 * halaman; hook hanya mengurus pemuatan + hasilnya. Saat
 * `params` berubah, request ikut berubah otomatis.
 *
 * Ukuran halaman tunggal: PER_PAGE di src/lib/pagination.ts.
 * Envelope: hanya { data, pagination } (kontrak #61).
 * ============================================================ */

import { useCallback, useEffect, useRef, useState } from 'react';
import { errMsg, messageOf } from '@/lib/admin-errors';
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
  /** Pesan gagal khas halaman ini. */
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
  /** Kosongkan pesan error pemuatan tanpa refetch. */
  clearError: () => void;
};

/**
 * Params -> URLSearchParams yang sudah di-encode benar. Bentuk record
 * dipakai (bukan string "k=v&k=v" yang di-parse ulang) supaya nilai
 * berisi `&`/`=`/`+`/`#` tetap utuh: "C++", "Tom & Jerry", "a=b".
 */
function toQueryParams(params: ListParams | undefined): URLSearchParams {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v === undefined || v === null || v === '') continue;
    qs.set(k, String(v));
  }
  return qs;
}

export function useAdminList<T>(options: UseAdminListOptions): AdminList<T> {
  const {
    path,
    params,
    debounceMs = 0,
    noStore = false,
    errorMessage = 'Gagal memuat data.',
  } = options;

  // Kunci ketergantungan effect: nilai stabil meski objek `params`
  // dibuat ulang tiap render.
  const queryKey = toQueryParams(params).toString();

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
    // Pesan & status daftar dikosongkan saat request baru dimulai (perilaku
    // lama: load() memanggil setError('')/setLoading(true) lebih dulu).
    setLoading(true);
    setError('');
    setMissing(false);
    setDenied(false);

    // Ambil & langsung kosongkan: hanya pemanggilan reload() yang instan.
    const immediate = immediateRef.current;
    immediateRef.current = false;
    // Tandai effect mati: hasil request lama tak boleh menimpa state baru.
    let alive = true;

    const run = async () => {
      const qs = toQueryParams(params);
      if (!qs.has('per_page')) qs.set('per_page', String(PER_PAGE));
      try {
        const res = await fetch(`${path}?${qs}`, noStore ? { cache: 'no-store' } : undefined);
        // Kontrak #61: satu envelope { data, pagination }. Fallback `meta`
        // sengaja TIDAK dibaca (tests/pagination-contract.test.ts).
        const json = (await res.json().catch(() => ({}))) as {
          data?: T[];
          pagination?: { totalPages?: number };
        };
        // Halaman yang tak punya banner 404/401 khusus tetap butuh penjelasan,
        // jadi `error` diisi juga untuk ketiga kasus — bukan tabel kosong.
        if (res.status === 404) {
          if (alive) {
            setMissing(true);
            setRows([]);
            setError(errMsg(json, errorMessage));
          }
          return;
        }
        if (res.status === 401 || res.status === 403) {
          if (alive) {
            setDenied(true);
            setRows([]);
            setError(errMsg(json, errorMessage));
          }
          return;
        }
        if (!res.ok) throw new Error(errMsg(json, errorMessage));
        if (!alive) return;
        setRows(json.data ?? []);
        setTotalPages(json.pagination?.totalPages ?? 1);
      } catch (e) {
        if (alive) setError(messageOf(e));
      } finally {
        if (alive) setLoading(false);
      }
    };

    // Kelalaian baca `error` di halaman tertentu membuat 404/401/403 tampak
    // sebagai "tak ada data" — jadi pesan selalu diisi untuk ketiga kasus.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `params` dipakai via queryKey
  }, [queryKey, path, noStore, errorMessage, debounceMs, nonce]);

  return { rows, loading, error, totalPages, missing, denied, reload, clearError };
}
