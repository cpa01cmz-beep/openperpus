'use client';

/* ============================================================
 * src/hooks/useAdminSubmit.ts — SATU hook aksi tulis (issue #62).
 *
 * Hampir setiap aksi admin menulis blok yang sama:
 *   setLoading(true) -> setError('') -> fetch -> throw errMsg
 *   -> catch setError -> finally setLoading(false)
 *
 * Hook ini memusatkan pola itu: `run(task)` mengurus status sibuk,
 * mengosongkan pesan lama, dan menangkap error. Halaman tinggal
 * menulis logikanya sendiri dan memakai `busy` untuk tombol.
 * ============================================================ */

import { useCallback, useState } from 'react';

export type UseAdminSubmitResult = {
  /** Sedang ada aksi berjalan. */
  busy: boolean;
  /** Pesan error aksi terakhir (kosong bila belum ada). */
  error: string;
  /** Kosongkan pesan error secara manual (mis. saat modal dibuka). */
  clearError: () => void;
  /** Jalankan aksi; error apa pun ditangkap dan ditampilkan. */
  run: (task: () => Promise<void>) => Promise<void>;
};

export function useAdminSubmit(): UseAdminSubmitResult {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const clearError = useCallback(() => setError(''), []);

  const run = useCallback(async (task: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await task();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, error, clearError, run };
}
