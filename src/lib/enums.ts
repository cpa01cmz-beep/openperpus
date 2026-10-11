export type EnumEntry = { value: string; label: string };

export const LOAN_STATUS: EnumEntry[] = [
  { value: 'borrowed', label: 'Dipinjam' },
  { value: 'overdue', label: 'Terlambat' },
  { value: 'returned', label: 'Dikembalikan' },
  { value: 'lost', label: 'Hilang' },
];

export const RESERVATION_STATUS: EnumEntry[] = [
  { value: 'pending', label: 'Menunggu' },
  { value: 'ready', label: 'Siap diambil' },
  { value: 'completed', label: 'Selesai' },
  { value: 'cancelled', label: 'Dibatalkan' },
  { value: 'expired', label: 'Kedaluwarsa' },
];

export const FINE_STATUS: EnumEntry[] = [
  { value: 'unpaid', label: 'Belum lunas' },
  { value: 'partial', label: 'Sebagian' },
  { value: 'paid', label: 'Lunas' },
  { value: 'waived', label: 'Dibebaskan' },
];

export const MEMBER_STATUS: EnumEntry[] = [
  { value: 'active', label: 'Aktif' },
  { value: 'suspended', label: 'Ditangguhkan' },
  { value: 'expired', label: 'Kedaluwarsa' },
  { value: 'pending', label: 'Menunggu' },
];

export const ARTICLE_STATUS: EnumEntry[] = [
  { value: 'draft', label: 'Draf' },
  { value: 'published', label: 'Terbit' },
  { value: 'archived', label: 'Arsip' },
];
