export type CsvCell = string | number | null;

/**
 * Awal string yang dieksekusi Excel/LibreOffice/Google Sheets sebagai FORMULA
 * begitu berkas CSV dibuka — CSV/formula injection (CWE-1236). TAB/CR disertakan
 * karena beberapa engine memperlakukan sel berawalan kontrol sebagai formula.
 */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

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
