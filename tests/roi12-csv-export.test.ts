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

  it('string whitespace murni TIDAK dianggap payload — tidak over-guard', () => {
    expect(toCSV(['judul'], [['   ']])).toBe('judul\r\n   ');
    expect(toCSV(['judul'], [[' a=1']])).toBe('judul\r\n a=1');
  });

  it('jalur stream server (rowsToCSV) juga dinetralkan', () => {
    expect(rowsToCSV([["=cmd|'/c calc'!A1"]])).toBe("'=cmd|'/c calc'!A1");
    // whitespace lalu penanda formula harus tetap netral di jalur server
    expect(rowsToCSV([['  +cmd']])).toBe("'  +cmd");
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
