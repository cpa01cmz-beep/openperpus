// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest';
import { rowsToCSV, toCSV, downloadCSV } from '@/lib/csv-export';

describe('toCSV (RFC4180)', () => {
  it('puts header row first', () => {
    const out = toCSV(['a', 'b'], [['1', '2']]);
    expect(out.split('\r\n')[0]).toBe('a,b');
  });

  it('quotes fields containing commas', () => {
    expect(toCSV(['h'], [['a,b']])).toContain('"a,b"');
  });

  it('escapes double quotes by doubling', () => {
    expect(toCSV(['h'], [['a"b']])).toContain('"a""b"');
  });

  it('quotes fields containing newlines', () => {
    expect(toCSV(['h'], [['a\nb']])).toContain('"a\nb"');
  });

  it('returns header-only when rows empty', () => {
    expect(toCSV(['a', 'b'], [])).toBe('a,b');
  });

  it('maps null/numbers to empty/string cells', () => {
    expect(toCSV(['a', 'b', 'c'], [[null, 42, 'x']])).toBe('a,b,c\r\n,42,x');
  });
});

describe('formula injection (CWE-1236) dinetralkan di esc()', () => {
  // Issue #152: sel string berawalan =/+/-/@/TAB/CR dieksekusi Excel/Sheets
  // saat berkas dibuka. Quote RFC 4180 TIDAK menetralkan (sel "=1+1" yang
  // dikutip tetap formula) — mitigasinya prefix apostrof OWASP.
  it.each([
    ["=cmd|'/c calc'!A1", "'=cmd|'/c calc'!A1"],
    ['=HYPERLINK("http://evil","Klik")', '"\'=HYPERLINK(""http://evil"",""Klik"")"'],
    ['+cmd', "'+cmd"],
    ['-2+3+cmd', "'-2+3+cmd"],
    ['@SUM(1+9)*cmd|', "'@SUM(1+9)*cmd|"],
    ['\t=1+1', "'\t=1+1"],
    // Sisa review #153: Excel/Sheets/LibreOffice memotong whitespace di depan
    // sel saat memutuskan formula — penanda yang telanjang TIDAK cukup.
    [" =cmd|'/c calc'!A1", "' =cmd|'/c calc'!A1"],
    ['   +cmd', "'   +cmd"],
    [' \t-calc', "' \t-calc"],
    ['  @SUM(1+9)', "'  @SUM(1+9)"],
    // CR tetap ikut set awal (engine memperlakukan kontrol sebagai formula);
    // sel juga dikutip RFC 4180 karena mengandung CR.
    ['\r=cmd', '"' + "'" + '\r' + '=cmd' + '"'],
    // Sisa review #154: LF-led payload — LF ada di run whitespace ASCII, jadi
    // ikut disaring; sel dikutip RFC 4180 karena mengandung LF.
    ['\n=cmd', '"' + "'" + '\n' + '=cmd' + '"'],
    // Sisa review #155: LF-led TANPA penanda formula kini juga di-guard — set
    // kontrol `[\t\r\n\v\f]` menutup 5 kontrol C0 (TAB/CR/LF/VT/FF; NUL/ESC/
    // separator \x1c–\x1f DI LUAR cakupan, lihat komentar guard). Dikutip
    // RFC 4180 karena mengandung LF/CR.
    ['\n', '"' + "'" + '\n' + '"'],
    ['\n\n', '"' + "'" + '\n\n' + '"'],
    ['\n\rx', '"' + "'" + '\n\rx' + '"'],
    // Sisa review #157: teks LF-led REALISTIS (judul/catatan berawalan newline
    // dari copy-paste) — kena stance kontrol-led fail-closed #152, bukan bug.
    ['\nJudul', '"' + "'" + '\n' + 'Judul' + '"'],
    // VT/FF-led: ditangkap alternatif kontrol (tanpa penanda pun) — pin.
    ['\v=cmd', "'\v=cmd"],
    ['\f', "'\f"],
  ])('%p -> %p', (input, expected) => {
    expect(toCSV(['h'], [[input]])).toBe(`h\r\n${expected}`);
  });

  it('sel angka (termasuk negatif) TIDAK diberi prefix — ekspor numerik utuh', () => {
    expect(toCSV(['denda'], [[-1500]])).toBe('denda\r\n-1500');
    expect(toCSV(['stok'], [[0]])).toBe('stok\r\n0');
  });

  it('string biasa dan null tidak berubah', () => {
    expect(toCSV(['judul'], [['Dilan 1990']])).toBe('judul\r\nDilan 1990');
    expect(toCSV(['kategori'], [[null]])).toBe('kategori\r\n');
  });

  it('payload hanya dinetralkan di AWAL sel, bukan di tengah string', () => {
    expect(toCSV(['judul'], [['Raport = 1+1']])).toBe('judul\r\nRaport = 1+1');
    expect(toCSV(['judul'], [['Nilai  = 1 + cmd']])).toBe('judul\r\nNilai  = 1 + cmd');
  });

  // Ruang lingkup invarian HARUS eksplisit (sisa review #157): yang murni-
  // whitespace TIDAK di-guard adalah string SPASI-led; kontrol-led murni
  // (`'\n'`) TETAP di-guard oleh stance fail-closed #152. Perbedaan dua kelas
  // ini sengaja, dikunci di test berikutnya.
  it('string whitespace murni SPASI-led TIDAK dianggap payload — tidak over-guard', () => {
    expect(toCSV(['judul'], [['   ']])).toBe('judul\r\n   ');
    expect(toCSV(['judul'], [[' a=1']])).toBe('judul\r\n a=1');
  });

  // Pasangan invarian di atas: kontrol-led murni TETAP di-guard (prefix
  // apostrof + kutip RFC 4180) sementara spasi-led murni tidak — dua rekan
  // dikunci bersama supaya klaim cakupan guard tidak bisa mengabur lagi.
  it('kontrol-led murni TETAP di-guard, beda perlakuan dari spasi-led murni', () => {
    expect(toCSV(['h'], [['\n']])).toBe('h\r\n"' + "'" + '\n' + '"');
    expect(toCSV(['h'], [['\t\t']])).toBe('h\r\n' + "'\t\t");
  });

  // Sisa review #155: guard kontrol hanya berlaku di AWAL sel — LF di tengah
  // string tetap data sah, dikutip RFC 4180, TANPA prefix apostrof.
  it('LF di tengah string TIDAK di-guard — hanya karakter awal yang diperiksa', () => {
    expect(toCSV(['judul'], [['Judul\nbaris dua']])).toBe('judul\r\n"Judul\nbaris dua"');
  });

  // Sisa review #154: guard hanya menyaring whitespace ASCII. Tidak ada engine
  // spreadsheet yang mengeksekusi sel berawalan whitespace NON-ASCII sebagai
  // formula, jadi memfilternya murni memutasi data legit (copy-paste web/Word)
  // tanpa gain keamanan — keputusan sadar, dipin di sini.
  it('whitespace NON-ASCII (NBSP/BOM) TIDAK disaring — tidak over-guard', () => {
    expect(toCSV(['judul'], [['\u00a0=cmd']])).toBe('judul\r\n\u00a0=cmd');
    expect(toCSV(['judul'], [['\ufeff+cmd']])).toBe('judul\r\n\ufeff+cmd');
  });

  // Sisa review #157: batas cakupan kontrol dikunci sesuai komentar guard —
  // hanya 5 kontrol C0 (TAB/CR/LF/VT/FF) yang di-guard. NUL/ESC-led dan
  // separator \x1c–\x1f TETAP data sah: tidak di-guard, tidak dikutip.
  it('batas C0 eksplisit: kontrol di luar set guard (NUL/ESC/separator) tetap data sah', () => {
    expect(toCSV(['h'], [['\x00foo']])).toBe('h\r\n\x00foo');
    expect(toCSV(['h'], [['\x1bfoo']])).toBe('h\r\n\x1bfoo');
    expect(toCSV(['h'], [['\x1cfoo']])).toBe('h\r\n\x1cfoo');
    expect(toCSV(['h'], [['\x1ffoo']])).toBe('h\r\n\x1ffoo');
  });

  it('jalur stream server (rowsToCSV) juga dinetralkan', () => {
    expect(rowsToCSV([["=cmd|'/c calc'!A1"]])).toBe("'=cmd|'/c calc'!A1");
    // whitespace lalu penanda formula harus tetap netral di jalur server
    expect(rowsToCSV([['  +cmd']])).toBe("'  +cmd");
    // Sisa review #157: LF-led juga dinetralkan di jalur stream — dengan
    // penanda dan tanpa penanda (stance kontrol-led fail-closed #152).
    expect(rowsToCSV([['\n=cmd']])).toBe('"' + "'" + '\n' + '=cmd' + '"');
    expect(rowsToCSV([['\ncatatan']])).toBe('"' + "'" + '\ncatatan' + '"');
  });
});

describe('downloadCSV', () => {
  afterEach(() => vi.restoreAllMocks());

  it('creates Blob + anchor click + revoke', () => {
    const create = vi.fn(() => 'blob:mock');
    const revoke = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const append = vi.spyOn(document.body, 'appendChild').mockImplementation((n) => n);
    const remove = vi.spyOn(document.body, 'removeChild').mockImplementation((n) => n);

    downloadCSV('laporan.csv', 'a,b\r\n1,2');

    expect(create).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith('blob:mock');
    expect(append).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
  });
});
