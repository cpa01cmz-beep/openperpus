/* ============================================================
 * src/lib/format.ts — formatter domain MURNI (tanpa I/O), aman
 * untuk client maupun server. Satu-satunya sumber kebenaran
 * untuk tampilan angka & rupiah di aplikasi (issue #62).
 *
 * Sebelumnya tiap halaman menyalin `fmtRp`/`num` sendiri:
 * admin/peminjaman, admin/denda, admin/page, admin/anggota,
 * (public)/denda, lib/wa-dunning, lib/loan-eligibility = 7
 * salinan. Semuanya kini mengimpor dari sini.
 * ============================================================ */

/** Angka aman: menerima number|string|null|undefined -> number. */
export function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
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
