import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function read(p: string): string {
  return readFileSync(join(process.cwd(), p), 'utf8');
}

// S-admin-perf: dashboard 1-RTT (#58) + checkout rollback + banner revalidate.
describe('S-admin-perf', () => {
  it('(a) dashboard aggregates via get_dashboard_stats, bounded, no limit(500) fallback', () => {
    const src = read('src/app/admin/page.tsx');
    // #58: agregat pindah ke RPC get_dashboard_stats (1 RTT); fallback bucket
    // .limit(500) dihapus; sisa 2 list query dibatasi top-8 (≤3 query total).
    expect(src, 'RED: dashboard must call rpc get_dashboard_stats').toMatch(
      /\.rpc\(\s*['"]get_dashboard_stats['"]/
    );
    expect(src, 'RED: fallback .limit(500) fetch must be removed').not.toMatch(
      /\.limit\(\s*500\s*\)/
    );
    const rpcs = src.match(/\.rpc\(/g) ?? [];
    const lists = src.match(/\.from\('loans'\)/g) ?? [];
    expect(rpcs.length, 'RED: dashboard must have exactly 1 rpc (get_dashboard_stats)').toBe(1);
    expect(lists.length, 'RED: dashboard must have exactly 2 bounded loans lists').toBe(2);
    expect(src, 'RED: list queries must stay bounded top-8').toMatch(/\.limit\(\s*8\s*\)/);
    // totalBooks dari RPC (WHERE is_active), bukan count-head tanpa filter.
    expect(src, 'RED: dashboard must not count books without is_active filter').not.toMatch(
      /\.from\('books'\)\.select\('id',\s*\{\s*count/
    );
  });

  it('(d) migration 0023 keeps chart sargable + supporting indexes + RPC extras', () => {
    const mig = read('supabase/migrations/0023_dashboard_stats_rtt.sql');
    expect(mig, 'RED: chart bucket must use sargable borrowed_at range').toMatch(
      /borrowed_at\s*>=\s*\(d\.day::timestamp\)/
    );
    expect(mig, 'RED: non-sargable borrowed_at::date = predicate must be gone').not.toMatch(
      /borrowed_at::date\s*=/
    );
    expect(mig, 'RED: missing index for recent ORDER BY borrowed_at DESC').toMatch(
      /CREATE INDEX IF NOT EXISTS idx_loans_borrowed_at[\s\S]*borrowed_at DESC/
    );
    expect(mig, 'RED: missing partial index for overdue queue (status + due_at)').toMatch(
      /CREATE INDEX IF NOT EXISTS idx_loans_active_due[\s\S]*WHERE status IN \('borrowed', 'overdue'\)/
    );
    // RPC v2: tarif denda (hapus serial getFineRate) + tagihan terbuka.
    expect(mig, 'RED: get_dashboard_stats must expose fine_per_day').toMatch(/fine_per_day/);
    expect(mig, 'RED: get_dashboard_stats must expose fines_open').toMatch(/fines_open/);
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
    expect(src, 'RED: banners API never revalidates banners tag').toMatch(/revalidateTag\(["']banners["']\s*(?:,\s*["']max["'])?\)/);
    expect(src, 'RED: banners API never revalidates "/"').toMatch(/revalidatePath\(["']\/["']\)/);
  });
});
