import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function read(p: string): string {
  return readFileSync(join(process.cwd(), p), 'utf8');
}

// S-admin-perf: dashboard bounded + checkout rollback + banner revalidate.
describe('S-admin-perf', () => {
  it('(a) dashboard weekLoans query is bounded with .limit()', () => {
    const src = read('src/app/admin/page.tsx');
    // weekLoans query must be bounded; keep the JS 7d filter (gte on borrowed_at).
    expect(src, 'RED: weekLoans query has no .limit() — unbounded dashboard fetch').toMatch(/\.limit\(\s*500\s*\)/);
    expect(src, 'weekLoans must keep 7d JS filter').toContain('borrowed_at');
  });

  it('(b) checkout fallback path rolls back stock on insert fail', () => {
    const src = read('src/app/api/loans/route.ts');
    // Fallback: after loans insert error, stock must be restored (rollback to avail).
    expect(src, 'RED: fallback insert-fail path does not roll back stock').toMatch(/stock_available:\s*avail/);
    // PRESERVE: exact-match rpcCode fix must not be reverted.
    for (const code of ["rpcCode === '25000'", "rpcCode === '02000'", "rpcCode === '22000'", "rpcCode === '42501'"]) {
      expect(src, `rpcCode exact-match fix missing: ${code}`).toContain(code);
    }
  });

  it('(c) banner edit calls correct revalidate target', () => {
    const src = read('src/app/api/banners/route.ts');
    // Public hero caches under tag "banners" (src/lib/books.ts) with revalidate 60 on "/".
    expect(src, 'RED: banners API never revalidates banners tag').toMatch(/revalidateTag\(["']banners["']\)/);
    expect(src, 'RED: banners API never revalidates "/"').toMatch(/revalidatePath\(["']\/["']\)/);
  });
});
