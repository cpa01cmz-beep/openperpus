import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

function walkSrc(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walkSrc(p));
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

describe('#68 sisa loans GET', () => {
  it('finite guard fineRate sebelum interpolasi + fallback 0 + warn', () => {
    const src = read('src/app/api/loans/route.ts');
    expect(src).toContain('Number.isFinite(rawRate)');
    expect(src).toContain('loans.fine_rate_invalid');
  });

  it('Cache-Control s-maxage singkat pada GET', () => {
    const src = read('src/app/api/loans/route.ts');
    expect(src).toContain('Cache-Control');
    expect(src).toContain('s-maxage=30');
  });
});

describe('#68 sisa katalog search 2 RTT', () => {
  it('ponytail window-count upgrade path, tanpa refactor RPC', () => {
    const src = read('src/lib/books/catalog.ts');
    expect(src).toContain('ponytail');
    expect(src).toContain('window-count');
    expect(src).toContain('searchBooksViaRpc');
  });
});

describe('#71 sisa alias bilingual', () => {
  it('helper readAlias ada di api-utils + warn deprecation + ponytail header', () => {
    const src = read('src/lib/api-utils.ts');
    expect(src).toContain('export function readAlias');
    expect(src).toContain('deprecation');
    expect(src).toContain('ponytail');
  });

  it('alias limit/search tidak menyebar di luar shim paging.ts', () => {
    const offenders: string[] = [];
    for (const f of walkSrc(join(ROOT, 'src'))) {
      if (f.endsWith('src/lib/paging.ts')) continue;
      const src = readFileSync(f, 'utf8');
      if (src.includes("sp.get('limit')") || src.includes("sp.get('search')")) {
        offenders.push(f.slice(ROOT.length + 1));
      }
    }
    expect(offenders).toEqual([]);
  });

  it.skip('hapus alias limit/search di paging.ts — TERKUNCI issue-68-paging.test.ts:43 (?limit=30)', () => {
    const src = read('src/lib/paging.ts');
    expect(src).not.toContain("sp.get('limit')");
    expect(src).not.toContain("sp.get('search')");
  });
});
