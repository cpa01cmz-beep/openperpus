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

export const PAYMENT_METHOD: EnumEntry[] = [
  { value: 'tunai', label: 'Tunai' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'qris', label: 'QRIS' },
];

export const SERVICE_ICON: EnumEntry[] = [
  { value: 'book', label: 'Buku' },
  { value: 'catalog', label: 'Katalog' },
  { value: 'users', label: 'Anggota' },
  { value: 'clock', label: 'Jam' },
  { value: 'info', label: 'Info' },
  { value: 'star', label: 'Bintang' },
];

export const MENU_POSITION: EnumEntry[] = [
  { value: 'header', label: 'Kepala' },
  { value: 'footer', label: 'Kaki' },
  { value: 'sidebar', label: 'Sisi' },
];

export const MENU_TARGET: EnumEntry[] = [
  { value: '_self', label: 'Tab sama' },
  { value: '_blank', label: 'Tab baru' },
];

export const LOG_ENTITY: EnumEntry[] = [
  { value: 'books', label: 'Buku' },
  { value: 'members', label: 'Anggota' },
  { value: 'loans', label: 'Peminjaman' },
  { value: 'fines', label: 'Denda' },
  { value: 'reservations', label: 'Reservasi' },
  { value: 'categories', label: 'Kategori' },
  { value: 'racks', label: 'Rak' },
  { value: 'menus', label: 'Menu' },
  { value: 'banners', label: 'Banner' },
  { value: 'articles', label: 'Artikel' },
  { value: 'settings', label: 'Pengaturan' },
];
