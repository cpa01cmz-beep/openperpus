import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Isu #56 — gate kelayakan checkout (pinjam/reservasi).
 *
 * POST /loans & POST /reservations sebelumnya hanya cek member status=active,
 * sehingga anggota berdenda/terlambat/over-limit tetap bisa checkout. Modul ini
 * memusatkan aturannya: satu sumber benar untuk API (+ UI memakai ringkasan
 * yang sama via getMembersLoanSummaries).
 *
 * Keputusan desain:
 * - Denda terbuka diambil via RPC get_fines_total (migrasi 0018, SECURITY
 *   DEFINER) dengan fallback query langsung ke tabel fines (RLS mengizinkan
 *   staf/member sendiri membaca). Rupiah berupa NUMERIC di Postgres —
 *   dikonversi defensif ke number.
 * - Saat verifikasi TIDAK bisa diselesaikan (query gagal), gate fail-closed
 *   (500 MEMBER_CHECK_FAILED): lebih baik checkout gagal terbuka daripada
 *   meloloskan anggota bermasalah tanpa bukti.
 * - Batas pinjaman aktif dari library_settings.max_active_loans (migrasi
 *   0023), default MAX_ACTIVE_LOANS_DEFAULT bila kolom belum ada.
 */

export type SupabaseLike = Pick<SupabaseClient, 'from'> & Partial<Pick<SupabaseClient, 'rpc'>>;

/** Default batas loan aktif per anggota (library_settings.max_active_loans). */
export const MAX_ACTIVE_LOANS_DEFAULT = 3;

/** Kode blokir checkout (409) — dipetakan ke jsonError oleh route. */
export type MemberBlockCode = 'MEMBER_HAS_FINES' | 'MEMBER_OVERDUE' | 'MEMBER_LOAN_LIMIT';

export type MemberLoanSummary = {
  /** Loan berstatus borrowed/overdue. */
  activeLoans: number;
  /** Loan aktif yang sudah melewati due_at. */
  overdueLoans: number;
  /** Total denda belum lunas (unpaid+partial). null = tak bisa ditentukan. */
  openFines: number | null;
  /** false bila ada query gagal — pemanggil harus fail-closed. */
  complete: boolean;
};

const ACTIVE_LOAN_STATUSES = ['borrowed', 'overdue'] as const;
const OPEN_FINE_STATUSES = ['unpaid', 'partial'] as const;

function toNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Format rupiah ringkas untuk pesan blokir (id-ID). */
export function formatRp(v: number): string {
  return `Rp${Math.round(v).toLocaleString('id-ID')}`;
}

/**
 * Keputusan murni (tanpa I/O) — inti aturan #56, siap diuji unit.
 * Urutan prioritas: denda > keterlambatan > batas jumlah.
 */
export function evaluateLoanEligibility(
  summary: Pick<MemberLoanSummary, 'activeLoans' | 'overdueLoans' | 'openFines'>,
  maxActiveLoans: number = MAX_ACTIVE_LOANS_DEFAULT
): { eligible: true } | { eligible: false; code: MemberBlockCode; message: string } {
  const max =
    Number.isFinite(maxActiveLoans) && maxActiveLoans > 0
      ? Math.floor(maxActiveLoans)
      : MAX_ACTIVE_LOANS_DEFAULT;

  if (summary.openFines !== null && summary.openFines > 0) {
    return {
      eligible: false,
      code: 'MEMBER_HAS_FINES',
      message: `Anggota memiliki tagihan denda ${formatRp(summary.openFines)} yang belum lunas. Lunasi tagihan sebelum meminjam atau memesan buku.`,
    };
  }
  if (summary.overdueLoans > 0) {
    return {
      eligible: false,
      code: 'MEMBER_OVERDUE',
      message: `Anggota memiliki ${summary.overdueLoans} peminjaman terlambat. Kembalikan buku yang terlambat sebelum meminjam atau memesan buku.`,
    };
  }
  if (summary.activeLoans >= max) {
    return {
      eligible: false,
      code: 'MEMBER_LOAN_LIMIT',
      message: `Anggota sudah meminjam ${summary.activeLoans} buku (batas ${max}). Kembalikan salah satu buku sebelum meminjam lagi.`,
    };
  }
  return { eligible: true };
}

export type LoanEligibility =
  | { eligible: true; summary: MemberLoanSummary }
  | {
      eligible: false;
      code: MemberBlockCode | 'MEMBER_CHECK_FAILED';
      message: string;
      status: 409 | 500;
      summary: MemberLoanSummary;
    };

/**
 * Total denda terbuka satu anggota: RPC dulu, fallback query tabel fines.
 * null = tak bisa ditentukan (fail-closed di pemanggil).
 */
export async function getMemberOpenFines(
  supabase: SupabaseLike,
  memberId: string
): Promise<number | null> {
  if (typeof supabase.rpc === 'function') {
    try {
      const { data, error } = await supabase.rpc('get_fines_total', { p_member_id: memberId });
      if (!error && data !== null && data !== undefined) {
        const n = Number(data);
        if (Number.isFinite(n)) return n;
      }
    } catch {
      /* jatuh ke fallback query di bawah */
    }
  }
  try {
    const { data, error } = await supabase
      .from('fines')
      .select('amount,paid_amount')
      .eq('member_id', memberId)
      .in('status', [...OPEN_FINE_STATUSES])
      .limit(500);
    if (error) return null;
    const rows = (data ?? []) as { amount?: unknown; paid_amount?: unknown }[];
    return rows.reduce((sum, r) => sum + (toNumber(r.amount) - toNumber(r.paid_amount)), 0);
  } catch {
    return null;
  }
}

/** Ringkasan pinjaman satu anggota: hitung aktif + terlambat. */
export async function getMemberLoanSummary(
  supabase: SupabaseLike,
  memberId: string,
  now: Date = new Date()
): Promise<MemberLoanSummary> {
  let activeLoans = 0;
  let overdueLoans = 0;
  let loansComplete = false;
  try {
    const { data, error } = await supabase
      .from('loans')
      .select('due_at')
      .eq('member_id', memberId)
      .in('status', [...ACTIVE_LOAN_STATUSES])
      .limit(200);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as { due_at?: unknown }[];
    activeLoans = rows.length;
    overdueLoans = rows.filter((r) => new Date(String(r.due_at)).getTime() < now.getTime()).length;
    loansComplete = true;
  } catch {
    loansComplete = false;
  }
  const openFines = await getMemberOpenFines(supabase, memberId);
  return { activeLoans, overdueLoans, openFines, complete: loansComplete && openFines !== null };
}

/**
 * Gate utama: KOSONGKAN summary -> keputusan. Fail-closed (500
 * MEMBER_CHECK_FAILED) bila verifikasi tidak bisa diselesaikan.
 */
export async function checkMemberLoanEligibility(
  supabase: SupabaseLike,
  memberId: string,
  opts: { maxActiveLoans?: number; now?: Date } = {}
): Promise<LoanEligibility> {
  const now = opts.now ?? new Date();
  let maxActiveLoans = opts.maxActiveLoans;
  if (maxActiveLoans === undefined) {
    try {
      const { data } = await supabase
        .from('library_settings')
        .select('max_active_loans')
        .eq('id', 1)
        .single();
      maxActiveLoans = toNumber((data as { max_active_loans?: unknown } | null)?.max_active_loans);
    } catch {
      maxActiveLoans = 0; // -> default di evaluateLoanEligibility
    }
  }

  const summary = await getMemberLoanSummary(supabase, memberId, now);
  if (!summary.complete) {
    return {
      eligible: false,
      code: 'MEMBER_CHECK_FAILED',
      message:
        'Gagal memverifikasi kelayakan anggota (tagihan/peminjaman). Coba lagi atau hubungi administrator.',
      status: 500,
      summary,
    };
  }
  const verdict = evaluateLoanEligibility(summary, maxActiveLoans ?? MAX_ACTIVE_LOANS_DEFAULT);
  if (verdict.eligible) return { eligible: true, summary };
  return { ...verdict, status: 409, summary };
}

/**
 * Ringkasan untuk daftar anggota (GET /api/members) — agregat 2 query
 * (loans + fines) untuk seluruh id di halaman, bukan N+1 per anggota.
 * Best-effort: kegagalan query -> nilai 0, GET tidak boleh gagal karena
 * info tampilan ini.
 */
export async function getMembersLoanSummaries(
  supabase: SupabaseLike,
  memberIds: string[],
  now: Date = new Date()
): Promise<Record<string, { fines_total: number; active_loans: number; overdue_loans: number }>> {
  const out: Record<string, { fines_total: number; active_loans: number; overdue_loans: number }> =
    {};
  for (const id of memberIds) out[id] = { fines_total: 0, active_loans: 0, overdue_loans: 0 };
  if (memberIds.length === 0) return out;

  try {
    const { data } = await supabase
      .from('loans')
      .select('member_id,due_at')
      .in('member_id', memberIds)
      .in('status', [...ACTIVE_LOAN_STATUSES])
      .limit(1000);
    for (const r of (data ?? []) as { member_id?: unknown; due_at?: unknown }[]) {
      const id = String(r.member_id ?? '');
      const bucket = out[id];
      if (!bucket) continue;
      bucket.active_loans += 1;
      if (new Date(String(r.due_at)).getTime() < now.getTime()) bucket.overdue_loans += 1;
    }
  } catch {
    /* best-effort: tampilan saja */
  }

  try {
    const { data } = await supabase
      .from('fines')
      .select('member_id,amount,paid_amount')
      .in('member_id', memberIds)
      .in('status', [...OPEN_FINE_STATUSES])
      .limit(1000);
    for (const r of (data ?? []) as {
      member_id?: unknown;
      amount?: unknown;
      paid_amount?: unknown;
    }[]) {
      const id = String(r.member_id ?? '');
      const bucket = out[id];
      if (!bucket) continue;
      bucket.fines_total += toNumber(r.amount) - toNumber(r.paid_amount);
    }
  } catch {
    /* best-effort: tampilan saja */
  }

  return out;
}
