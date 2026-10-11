/* ============================================================
 * src/lib/pagination.ts — SATU sumber ukuran halaman (issue #62).
 *
 * Sebelumnya angka ini tersebar sebagai literal '10' / '20' /
 * '50' di belasan halaman admin + klien publik, jadi ukuran
 * tabel berbeda-beda tanpa alasan. Sekarang ada satu konstanta.
 *
 * PER_PAGE       — baris per halaman untuk semua tabel daftar
 *                  (admin + publik). Ganti di satu tempat ini.
 * SEARCH_PER_PAGE — jumlah opsi untuk dropdown cari-ketik
 *                  (SearchCombobox). Sengaja TERPISAH karena
 *                  ini jumlah saran, bukan ukuran tabel.
 * ============================================================ */

/** Baris per halaman untuk semua tabel daftar. */
export const PER_PAGE = 20;

/** Jumlah opsi yang diminta dropdown cari-ketik. */
export const SEARCH_PER_PAGE = 10;
