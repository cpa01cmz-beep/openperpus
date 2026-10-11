/**
 * src/lib/enums.ts — SATU sumber enum domain (issue #71 kanonis EN,
 * issue #79 label Indonesia + tone tampilan).
 *
 * Kontrak:
 * - `value` = nilai kanonis DB/API (English, tidak diterjemahkan).
 * - `label` = label tampilan Bahasa Indonesia.
 * - `tone`  = tone Badge (union sama dengan components/ui/Badge Tone,
 *   diduplikasi sebagai literal agar lib tidak bergantung pada
 *   komponen React).
 *
 * Semua dropdown status (filter admin) DAN badge status (StatusBadge,
 * ReservationCard, halaman publik) membaca dari sini — tidak ada kamus
 * label kedua di aplikasi.
 */

export type EnumTone = 'emerald' | 'amber' | 'rose' | 'slate' | 'sky';

export type EnumEntry = { value: string; label: string; tone: EnumTone };

export const LOAN_STATUS: EnumEntry[] = [
  { value: 'borrowed', label: 'Dipinjam', tone: 'sky' },
  { value: 'overdue', label: 'Terlambat', tone: 'rose' },
  { value: 'returned', label: 'Dikembalikan', tone: 'emerald' },
  { value: 'lost', label: 'Hilang', tone: 'rose' },
];

export const RESERVATION_STATUS: EnumEntry[] = [
  { value: 'pending', label: 'Menunggu', tone: 'amber' },
  { value: 'ready', label: 'Siap diambil', tone: 'sky' },
  { value: 'completed', label: 'Selesai', tone: 'emerald' },
  { value: 'cancelled', label: 'Dibatalkan', tone: 'slate' },
  { value: 'expired', label: 'Kedaluwarsa', tone: 'rose' },
];

export const FINE_STATUS: EnumEntry[] = [
  { value: 'unpaid', label: 'Belum lunas', tone: 'rose' },
  { value: 'partial', label: 'Sebagian', tone: 'amber' },
  { value: 'paid', label: 'Lunas', tone: 'emerald' },
  { value: 'waived', label: 'Dibebaskan', tone: 'slate' },
];

export const MEMBER_STATUS: EnumEntry[] = [
  { value: 'active', label: 'Aktif', tone: 'emerald' },
  { value: 'suspended', label: 'Ditangguhkan', tone: 'amber' },
  { value: 'expired', label: 'Kedaluwarsa', tone: 'rose' },
  { value: 'pending', label: 'Menunggu', tone: 'amber' },
];

export const ARTICLE_STATUS: EnumEntry[] = [
  { value: 'draft', label: 'Draf', tone: 'slate' },
  { value: 'published', label: 'Terbit', tone: 'emerald' },
  { value: 'archived', label: 'Arsip', tone: 'slate' },
];

/** Semua enum status tampilan (badge + dropdown) dalam satu daftar. */
export const ALL_STATUS: EnumEntry[] = [
  ...LOAN_STATUS,
  ...RESERVATION_STATUS,
  ...FINE_STATUS,
  ...MEMBER_STATUS,
  ...ARTICLE_STATUS,
];
