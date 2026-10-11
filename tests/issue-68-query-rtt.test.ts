import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('issue-68 query RTT', () => {
  it('(a) parsePaging cap 50', () => {
    const src = read('src/lib/paging.ts');
    expect(src).toMatch(/Math\.min\(\s*50/);
    expect(src).not.toMatch(/Math\.min\(\s*100/);
  });

  it("(b) loans GET tidak select('*') dan ada Cache-Control s-maxage", () => {
    const src = read('src/app/api/loans/route.ts');
    expect(src).not.toMatch(/\.select\(\s*['"]\*['"]/);
    expect(src).toContain('s-maxage');
    expect(src).toContain('Cache-Control');
  });

  it('(c) catalog perPage default 24', () => {
    const lib = read('src/lib/books/catalog.ts');
    expect(lib).toContain('?? 24');
    const page = read('src/app/(public)/katalog/page.tsx');
    expect(page).toContain('?? 24');
  });
});
