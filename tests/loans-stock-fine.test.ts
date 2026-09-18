import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// T-S4 choice: file-pattern on atomic stock decrement (rpc/transaction/serializable guard).
// Why: calcFine in src/lib/supabase/auth.ts is already correct (FINE_PER_DAY=1000, lateDays*rate,
// on-time=0) but not importable — auth.ts imports next/server which has no node_modules here,
// so a pure boundary import would fail for the WRONG reason (module resolution, not behavior).
// Current loans POST is read-then-write (select avail, then update avail-1) which races.
describe('T-S4 loans atomic stock decrement', () => {
  it('route decrements stock atomically (rpc/transaction guard)', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/api/loans/route.ts'), 'utf8').toLowerCase();
    expect(src.includes('.rpc(') || src.includes('transaction') || src.includes('serializable') || src.includes('decrement_stock') || src.includes('checkout_loan'), 'T-S4 RED: loans route still uses read-then-write stock update (select avail then update avail-1) — needs atomic RPC/transaction guard').toBe(true);
  });
});
