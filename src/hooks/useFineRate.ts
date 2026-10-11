'use client';

/* ============================================================
 * src/hooks/useFineRate.ts — SATU hook kebijakan pinjam (issue #62).
 *
 * Sebelumnya tiap halaman menyalin fetch('/api/settings') +
 * normalisasi fine_per_day/loan_days/... sendiri-sendiri:
 *   src/app/admin/peminjaman/page.tsx
 *   src/app/admin/denda/page.tsx
 *   src/app/(public)/denda/page.tsx
 * Ketiganya kini memakai hook ini. Default & tenggat validasi
 * mengikuti aturan lama (bahkan nilai tak valid jatuh ke default,
 * jadi perilaku tampilan tidak berubah).
 * ============================================================ */

import { useEffect, useState } from 'react';
import { FINE_PER_DAY } from '@/lib/finecalc';
import { num } from '@/lib/format';

export type LoanPolicy = {
  /** Tarif denda per hari telat (library_settings.fine_per_day). */
  finePerDay: number;
  /** Lama pinjam default hari (library_settings.loan_days). */
  loanDays: number;
  /** Maksimum perpanjangan per pinjaman (library_settings.max_extensions). */
  maxExtensions: number;
  /** Biaya ganti rugi rusak/hilang (library_settings.replacement_fee_*). */
  replacementFees: { rusak: number; hilang: number };
};

export const DEFAULT_LOAN_POLICY: LoanPolicy = {
  finePerDay: FINE_PER_DAY,
  loanDays: 14,
  maxExtensions: 2,
  replacementFees: { rusak: 0, hilang: 0 },
};

export type UseFineRateResult = LoanPolicy & {
  /**
   * Pesan non-fatal bila pengaturan gagal dimuat. Tarif default
   * dipakai, jadi UI tetap jalan — state ini khusus ditampilkan.
   */
  notice: string;
};

/** Normalisasi payload settings -> kebijakan pinjam (nilai invalid -> default). */
export function normalizeLoanPolicy(data: Record<string, unknown> | undefined): LoanPolicy {
  const fine = num(data?.fine_per_day);
  const days = num(data?.loan_days);
  const maxExt = num(data?.max_extensions);
  const rusak = num(data?.replacement_fee_damaged);
  const hilang = num(data?.replacement_fee_lost);
  return {
    finePerDay: Number.isFinite(fine) && fine > 0 ? fine : DEFAULT_LOAN_POLICY.finePerDay,
    loanDays: Number.isFinite(days) && days > 0 ? days : DEFAULT_LOAN_POLICY.loanDays,
    maxExtensions:
      Number.isFinite(maxExt) && maxExt >= 0 ? maxExt : DEFAULT_LOAN_POLICY.maxExtensions,
    replacementFees: {
      rusak: Number.isFinite(rusak) && rusak > 0 ? rusak : 0,
      hilang: Number.isFinite(hilang) && hilang > 0 ? hilang : 0,
    },
  };
}

const NOTICE = 'Gagal memuat tarif denda; memakai tarif default.';

export function useFineRate(): UseFineRateResult {
  const [policy, setPolicy] = useState<LoanPolicy>(DEFAULT_LOAN_POLICY);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    // Tandai komponen mati agar setState setelah unmount tak memicu warning.
    let alive = true;
    fetch('/api/settings')
      .then((r) => {
        if (!r.ok) throw new Error(NOTICE);
        return r.json().catch(() => {
          throw new Error(NOTICE);
        }) as Promise<{ data?: Record<string, unknown> }>;
      })
      .then((j) => {
        if (alive) setPolicy(normalizeLoanPolicy(j.data));
      })
      .catch((e: Error) => {
        if (alive) setNotice(e.message || NOTICE);
      });
    return () => {
      alive = false;
    };
  }, []);

  return { ...policy, notice };
}
