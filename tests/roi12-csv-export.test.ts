// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest';
import { toCSV, downloadCSV } from '@/lib/csv-export';

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
