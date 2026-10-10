/**
 * SATU SUMBER KEBENARAN status terlambat (issue #57).
 *
 * Definisi terlambat (overdue) adalah TURUNAN, bukan kolom yang di-backfill:
 *
 *   overdue ⇔ status IN ('borrowed','overdue') AND due_at < NOW()
 *
 * Aplikasi tidak pernah menulis loans.status='overdue' — insert checkout selalu
 * 'borrowed' (src/app/api/loans/route.ts) dan return menulis 'returned'/'lost'.
 * Anggota DB 'overdue' (CHECK 0001_core.sql:152) hanya kompatibilitas baris lama.
 * Semua pembaca (SQL maupun UI) WAJIB memakai helper ini supaya satu loan
 * punya satu status di dashboard, halaman peminjaman, dan denda:
 *   - SQL: CASE ... END AS is_overdue / effective_status (route GET /api/loans)
 *   - DB RPC: get_overdue_count (0012) + get_dashboard_stats (0017) — sama.
 *   - UI: effectiveLoanStatus()/isLoanOverdue() di bawah.
 */

/** Nilai kolom loans.status (CHECK 0001_core.sql:152). */
export const LOAN_STATUSES = ['borrowed', 'returned', 'overdue', 'lost'] as const;
export type LoanStatus = (typeof LOAN_STATUSES)[number];

/** Status yang masih berjalan (kandidat terlambat). */
export const ACTIVE_LOAN_STATUSES = ['borrowed', 'overdue'] as const;

/** Bentuk minimum baris loans yang dibutuhkan helper ini. */
export type LoanLike = {
  status?: string | null;
  due_at?: string | null;
};

export function isLoanStatus(value: unknown): value is LoanStatus {
  return typeof value === 'string' && (LOAN_STATUSES as readonly string[]).includes(value);
}

/** Loan masih berjalan (belum dikembalikan / belum hilang). */
export function isActiveLoanStatus(status: string | null | undefined): boolean {
  return typeof status === 'string' && (ACTIVE_LOAN_STATUSES as readonly string[]).includes(status);
}

/**
 * true bila loan masih berjalan DAN sudah melewati jatuh tempo pada `now`.
 * Baris returned/lost tidak pernah terlambat.
 */
export function isLoanOverdue(loan: LoanLike, now: Date = new Date()): boolean {
  if (!isActiveLoanStatus(loan.status)) return false;
  if (!loan.due_at) return false;
  const due = new Date(loan.due_at);
  if (Number.isNaN(due.getTime())) return false;
  return due.getTime() < now.getTime();
}

/**
 * Status yang DITAMPILKAN: 'overdue' bila turunan terlambat, selain itu nilai
 * kolom status apa adanya. Inilah status tunggal untuk semua halaman.
 */
export function effectiveLoanStatus(loan: LoanLike, now: Date = new Date()): string {
  return isLoanOverdue(loan, now) ? 'overdue' : (loan.status ?? '');
}

export type LoansListFilter = {
  /** Filter kolom status eksplisit (nilai selain 'overdue'). */
  status?: LoanStatus;
  /** true → filter turunan terlambat: aktif AND due_at < now. */
  overdue?: boolean;
};

/**
 * Peta query param list loans → filter kanonik.
 *
 * `?status=overdue` dan `?overdue=1` adalah SATU hal: keduanya memakai
 * definisi turunan, sehingga keduanya mustahil lagi beda hasil dengan
 * tombol "Terlambat saja" di UI admin.
 */
export function loansListFilter(params: {
  status?: string | null;
  overdue?: string | null;
}): LoansListFilter {
  const status = (params.status ?? '').trim();
  const overdue = (params.overdue ?? '').trim();
  if (status === 'overdue' || overdue === '1') return { overdue: true };
  if (status) return { status: status as LoanStatus };
  return {};
}
