import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Kebijakan pinjam dari `library_settings` — issue #74.
 *
 * Sebelumnya angka operasional di-hardcode di kode: lama pinjam `+14 hari`
 * (POST /api/loans + LoanForm), batas perpanjangan `MAX_EXTEND_COUNT`, dan
 * tidak ada biaya ganti rugi untuk buku rusak/hilang. Modul ini memusatkan
 * pembacaan kolom settings supaya pustakawan bisa mengubahnya tanpa deploy.
 *
 * Nama kolom kanonis Inggris (`loan_days`, `max_extensions`,
 * `replacement_fee_damaged`, `replacement_fee_lost`) — lihat issue #71; label
 * Indonesia hanya milik UI (SettingsForm/admin).
 *
 * Kontrak defensif: kolom belum ada / settings belum di-seed / query gagal →
 * nilai default di bawah (checkout tetap jalan, tidak gagal terbuka).
 */

type SupabaseLike = Pick<SupabaseClient, 'from'> & Partial<Pick<SupabaseClient, 'rpc'>>;

/** Lama pinjam default (hari) — sama dengan perilaku sebelum issue #74. */
export const LOAN_DAYS_DEFAULT = 14;
/** Batas perpanjangan default per pinjaman. */
export const MAX_EXTENSIONS_DEFAULT = 2;
/** Biaya ganti rugi default (Rp) — 0 = belum dikonfigurasi pustakawan. */
export const REPLACEMENT_FEE_DEFAULT = 0;

export type LoanPolicy = {
  /** Lama pinjam checkout (hari). */
  loanDays: number;
  /** Batas perpanjangan per pinjaman. */
  maxExtensions: number;
  /** Biaya ganti rugi buku rusak (Rp). */
  replacementFeeDamaged: number;
  /** Biaya ganti rugi buku hilang (Rp). */
  replacementFeeLost: number;
};

export const DEFAULT_LOAN_POLICY: LoanPolicy = {
  loanDays: LOAN_DAYS_DEFAULT,
  maxExtensions: MAX_EXTENSIONS_DEFAULT,
  replacementFeeDamaged: REPLACEMENT_FEE_DEFAULT,
  replacementFeeLost: REPLACEMENT_FEE_DEFAULT,
};

/** Kondisi pengembalian kanonis (kontrak return_loan, migrasi 0011). */
export const RETURN_KONDISI = ['baik', 'rusak', 'hilang'] as const;
export type ReturnKondisi = (typeof RETURN_KONDISI)[number];

export function isReturnKondisi(v: unknown): v is ReturnKondisi {
  return typeof v === 'string' && (RETURN_KONDISI as readonly string[]).includes(v);
}

/** Normalisasi nilai settings apa pun ke integer positif dalam rentang aman. */
function intInRange(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.floor(n);
  if (i < min) return min;
  if (i > max) return max;
  return i;
}

/** Normalisasi rupiah settings ke number >= 0. */
function money(v: unknown, fallback = REPLACEMENT_FEE_DEFAULT): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

/**
 * Keputusan murni (tanpa I/O) — baris `library_settings` (atau mock) menjadi
 * kebijakan pinjam. Kolom yang belum ada dianggap default, bukan error.
 */
export function resolveLoanPolicy(row: Record<string, unknown> | null | undefined): LoanPolicy {
  const r = (row ?? {}) as Record<string, unknown>;
  return {
    loanDays: intInRange(r.loan_days, 1, 365, LOAN_DAYS_DEFAULT),
    maxExtensions: intInRange(r.max_extensions, 0, 10, MAX_EXTENSIONS_DEFAULT),
    replacementFeeDamaged: money(r.replacement_fee_damaged),
    replacementFeeLost: money(r.replacement_fee_lost),
  };
}

/** Biaya ganti rugi untuk satu kondisi (baik = 0). */
export function replacementFeeFor(kondisi: string, policy: LoanPolicy): number {
  if (kondisi === 'hilang') return policy.replacementFeeLost;
  if (kondisi === 'rusak') return policy.replacementFeeDamaged;
  return 0;
}

/**
 * Baca kebijakan pinjang (1 query). Gagal/baris kosong → default.
 * Dipakai POST /api/loans (loan_days) dan extendLoan (max_extensions).
 */
export async function getLoanPolicy(supabase: SupabaseLike): Promise<LoanPolicy> {
  try {
    const { data } = await supabase
      .from('library_settings')
      .select('loan_days,max_extensions,replacement_fee_damaged,replacement_fee_lost')
      .eq('id', 1)
      .single();
    return resolveLoanPolicy((data as Record<string, unknown> | null) ?? null);
  } catch {
    return DEFAULT_LOAN_POLICY;
  }
}

/**
 * Biaya ganti rugi untuk satu kondisi (1 query, hanya dipanggil jalur legacy ketika
 * kondisi ≠ baik; jalur utama RPC `return_loan` membacanya sendiri di DB).
 */
export async function getReplacementFee(supabase: SupabaseLike, kondisi: string): Promise<number> {
  if (kondisi !== 'rusak' && kondisi !== 'hilang') return 0;
  try {
    const { data } = await supabase
      .from('library_settings')
      .select('replacement_fee_damaged,replacement_fee_lost')
      .eq('id', 1)
      .single();
    return replacementFeeFor(kondisi, resolveLoanPolicy(data as Record<string, unknown> | null));
  } catch {
    return 0;
  }
}
