/* ============================================================
 * src/lib/format.ts — formatter domain MURNI (tanpa I/O), aman
 * untuk client maupun server. Satu-satunya sumber kebenaran
 * untuk tampilan angka & rupiah di aplikasi (issue #62).
 *
 * Sebelumnya tiap halaman menyalin `fmtRp`/`num` sendiri:
 * admin/peminjaman, admin/denda, admin/page, admin/anggota,
 * (public)/denda, lib/wa-dunning, lib/loan-eligibility = 7
 * salinan. Semuanya kini mengimpor dari sini.
 *
 * Issue #79: `toLocaleString`/`toLocaleDateString`/`toLocaleTimeString`
 * dengan locale id-ID HANYA boleh di sini (dijaga ESLint
 * no-restricted-syntax). Semua tampilan tanggal/angka lewat
 * formatTanggal/formatJam/formatAngka di bawah.
 * ============================================================ */

/** Angka aman: menerima number|string|null|undefined -> number. */
export function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Angka gaya id-ID, mis. 15000 -> "15.000". */
export function formatAngka(v: unknown): string {
  return num(v).toLocaleString('id-ID');
}

/** Tanggal gaya id-ID, mis. "12/10/2026". Invalid/kosong -> "-". */
export function formatTanggal(
  v: string | number | Date | null | undefined,
  opts?: Intl.DateTimeFormatOptions
): string {
  if (v === null || v === undefined || v === '') return '-';
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('id-ID', opts);
}

/** Jam gaya id-ID. Invalid/kosong -> "-". */
export function formatJam(
  v: string | number | Date | null | undefined,
  opts?: Intl.DateTimeFormatOptions
): string {
  if (v === null || v === undefined || v === '') return '-';
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleTimeString('id-ID', opts);
}

/** Stempel tanggal lokal YYYY-MM-DD untuk nama file ekspor. */
export function formatStamp(d: Date = new Date()): string {
  return d.toLocaleDateString('sv-SE');
}

/**
 * Rupiah gaya id-ID, mis. 15000 -> "Rp15.000".
 * Pembulatan ke rupiah penuh agar tampilan konsisten walau
 * sumber datang sebagai string/numeric dari Postgres.
 */
export function formatRp(v: unknown): string {
  return `Rp${Math.round(num(v)).toLocaleString('id-ID')}`;
}

/** Alias historis: pemanggil lama memakai `fmtRp`. */
export { formatRp as fmtRp };
