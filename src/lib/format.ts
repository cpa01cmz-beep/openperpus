/* ============================================================
 * src/lib/format.ts — formatter domain MURNI (tanpa I/O), aman
 * untuk client maupun server. Satu-satunya sumber kebenaran
 * untuk tampilan angka, rupiah & tanggal di aplikasi
 * (issue #62 untuk uang, #79 untuk tanggal & angka).
 *
 * Sebelumnya tiap halaman menyalin `fmtRp`/`num` sendiri:
 * admin/peminjaman, admin/denda, admin/page, admin/anggota,
 * (public)/denda, lib/wa-dunning, lib/loan-eligibility = 7
 * salinan. Semuanya kini mengimpor dari sini.
 *
 * Aturan #79: TIDAK ADA `toLocaleDateString`/`toLocaleTimeString`/
 * `toLocaleString` inline di luar berkas ini. Semua tampilan
 * tanggal/angka lewat helper di bawah (dipaksa oleh eslint rule
 * lokal `openperpus/no-inline-format` + grep test issue #79).
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

/* ---------- Tanggal (issue #79) ---------- */

/** Input tanggal yang diterima helper: ISO string, epoch, Date, atau kosong. */
export type DateInput = string | number | Date | null | undefined;

/** Date valid atau null (kosong/invalid tidak melempar). */
function toDate(v: DateInput): Date | null {
  if (v === null || v === undefined || v === '') return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Tanggal numerik id-ID: "2026-10-11" -> "11/10/2026". Kosong -> "-". */
export function formatTanggal(v: DateInput): string {
  const d = toDate(v);
  return d ? d.toLocaleDateString('id-ID') : '-';
}

/** Tanggal panjang: "11 Oktober 2026". */
export function formatTanggalPanjang(v: DateInput): string {
  const d = toDate(v);
  return d
    ? d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
    : '-';
}

/** Tanggal ringkas: "11 Okt 2026". */
export function formatTanggalRingkas(v: DateInput): string {
  const d = toDate(v);
  return d
    ? d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
    : '-';
}

/** Jam id-ID: "14.30.00" (24 jam). */
export function formatWaktu(v: DateInput): string {
  const d = toDate(v);
  return d ? d.toLocaleTimeString('id-ID') : '-';
}

/**
 * Label hari singkat (mis. "Sab") untuk chart — timeZone UTC eksplisit
 * agar bucket agregasi SQL (UTC) tidak bergeser sehari saat TZ runtime
 * bukan UTC (pola dashboard admin).
 */
export function formatHariUtc(v: DateInput): string {
  const d = toDate(v);
  return d ? d.toLocaleDateString('id-ID', { weekday: 'short', timeZone: 'UTC' }) : '-';
}

/* ---------- Angka (issue #79) ---------- */

/** Angka dengan pemisah ribuan id-ID: 15000 -> "15.000". */
export function formatNum(v: unknown): string {
  return num(v).toLocaleString('id-ID');
}

/** Zona yang dipakai stempel nama berkas ekspor. Aplikasi berbahasa
 *  Indonesia + pustakawan beroperasi di WIB, jadi tanggalnya dipatok ke WIB:
 *  server (UTC di Vercel/Cloudflare Workers) dan browser harus menghasilkan
 *  nama berkas yang SAMA untuk satu klik. Tanpa ini, ekspor dini hari WIB
 *  bisa bernomor tanggal KEMARIN dan dua tombol ekspor berselisih hari. */
const EXPORT_TIME_ZONE = 'Asia/Jakarta';

/**
 * Stamp nama berkas ekspor: "2026-10-11" — deterministik lintas
 * locale runtime (pengganti toLocaleDateString('sv-SE') yang sama
 * hasilnya tapi terbaca sebagai "magic locale") DAN lintas zona runtime
 * (lihat EXPORT_TIME_ZONE).
 */
export function formatStamp(v?: DateInput): string {
  const d = toDate(v) ?? new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: EXPORT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  // Bagian wajib ADA — bukan fallback '00': nilai separuh jadi ('2026-00-00')
  // lebih buruk daripada gagal keras, karena lolos jadi nama berkas tanpa tanda
  // ada yang rusak (sisa review #134).
  const get = (type: 'year' | 'month' | 'day') => {
    const value = parts.find((p) => p.type === type)?.value;
    if (!value) throw new Error(`formatStamp: Intl tidak mengembalikan bagian "${type}"`);
    return value;
  };
  // year: 'numeric' tidak nol-padding: tahun < 1000 jadi "999-01-01" yang
  // melanggar kontrak YYYY-MM-DD — dipatok 4 digit eksplisit.
  return `${get('year').padStart(4, '0')}-${get('month')}-${get('day')}`;
}
