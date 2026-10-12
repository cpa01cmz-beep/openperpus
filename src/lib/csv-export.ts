export type CsvCell = string | number | null;

/**
 * Awal string yang dieksekusi Excel/LibreOffice/Google Sheets sebagai FORMULA
 * begitu berkas CSV dibuka — CSV/formula injection (CWE-1236).
 *
 * Run whitespace ASCII (` `, TAB, CR, LF) sebelum penanda formula WAJIB ikut
 * disaring: engine spreadsheet memotong spasi/TAB di depan sel saat memutuskan
 * "apakah ini formula", jadi ` =cmd` / `  +cmd` lolos penjaga karakter-awal
 * saja dan tetap tereksekusi (sisa review #153 — guard sebelumnya hanya
 * `^[=+\-@\t\r]`). Whitespace NON-ASCII (NBSP/BOM/Unicode space separator)
 * sengaja TIDAK disaring: tidak ada engine yang mengeksekusinya sebagai
 * formula, jadi memfilternya hanya memutasi data legit (copy-paste web/Word)
 * tanpa gain keamanan (sisa review #154 — kaitannya: `\s` di JS jauh lebih
 * luas dari whitespace ASCII, cakupannya harus eksplisit).
 *
 * Alternatif `[\t\r\n\v\f]` menjaga sel berawalan kontrol TANPA penanda —
 * stance fail-closed yang diterima sejak issue #152 ("beberapa engine
 * memperlakukan sel berawalan kontrol sebagai formula"), diperluas ke LF di
 * review #156. Cakupan kontrolnya EKSPLISIT dan TERBATAS: hanya 5 kontrol C0
 * (TAB, CR, LF, VT, FF) — SELURUH C0 lain (NUL, ESC, separator \x1c–\x1f,
 * dst.) sengaja TIDAK ditutup, guard ini TIDAK mengklaim cakupan penuh
 * "semua karakter kontrol". Himpunan kontrol ini menimpa TAB/CR/LF yang juga
 * ada di run whitespace alternatif pertama, dan menambah VT/FF plus kasus
 * kontrol-led tanpa penanda — jadi ini tidak "simetris" dengan run
 * `[ \t\r\n]` (VT/FF ekstra, spasi absen). Putusan mempertahankan stance
 * kontrol-led tanpa penanda meski ia memberi prefix apostrof pada sel yang
 * berawalan kontrol mentah: dicatat di komentar review PR #157 — fail-closed
 * dipilih karena tidak ada dasar membedakan LF dari CR/VT/FF di level engine.
 *
 * BATASAN YANG DIDOKUMENTASIKAN (sisa review #159): kontrol DI LUAR set guard
 * (NUL/ESC/FS/GS/RS/US 0x1c–0x1f, dst. — 27 dari 32 kode C0) ditulis APA ADANYA
 * ke keluaran CSV, tanpa prefix apostrof dan tanpa dikutip RFC 4180. RFC 4180
 * `TEXTDATA` memang mengecualikan karakter kontrol, jadi pembaca ketat (Python
 * `csv`, pandas, sebagian jalur impor Excel) bisa error atau terpotong pada
 * NUL tertanam di dalam sel. Mengutip sel yang memuat kontrol TIDAK menutup
 * lubang itu — NUL mentah tetap utuh di dalam tanda kutip, jadi memperlebar
 * set kutip `esc()` tidak menolong. Remediasi sebenarnya ada di validasi
 * MASUKAN (tolak kontrol pada judul/penulis/kategori), BUKAN di guard formula
 * ini; batas ini dipin di `tests/roi12-csv-export.test.ts`.
 */
const FORMULA_LEAD = /^(?:[ \t\r\n]*[=+\-@]|[\t\r\n\v\f])/;

function esc(v: CsvCell): string {
  const s = v === null ? '' : String(v);
  // Sel STRING berawalan karakter formula diberi prefix apostrof (mitigasi
  // OWASP): Excel memperlakukan sel sebagai teks, bukan formula. Memakai
  // quote RFC 4180 saja TIDAK menetralkan — "=1+1" yang dikutip tetap
  // dieksekusi. Angka (typeof number) sengaja tidak disaring supaya ekspor
  // numerik (termasuk nilai negatif) tetap utuh (issue #152).
  const guarded = typeof v === 'string' && FORMULA_LEAD.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export function toCSV(headers: string[], rows: CsvCell[][]): string {
  // ponytail: client-side only, fine for current page rows; upgrade to server export when >10k rows.
  return [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\r\n');
}

/** Blok baris data TANPA baris header (dipisah CRLF) — untuk chunk streaming
 *  ekspor seluruh data (issue #78); header hanya ditulis sekali di awal. */
export function rowsToCSV(rows: CsvCell[][]): string {
  return rows.map((r) => r.map(esc).join(',')).join('\r\n');
}

/** Picu unduhan berkas dari teks CSV (dibuat jadi Blob membawa charset). */
export function downloadCSV(filename: string, csv: string): void {
  downloadBlob(filename, new Blob([csv], { type: 'text/csv;charset=utf-8' }));
}

/**
 * Picu unduhan blob APA ADANYA — untuk respons endpoint (mis. stream CSV
 * `/api/reports/export`, isu #78/#133) tanpa menyalin isinya lewat teks
 * dulu. Nama berkas diambil dari Content-Disposition server oleh pemanggil.
 */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
