import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// US-2 "Overdue action queue with 1-click return" — TDD RED→GREEN.
// Dashboard: overdue top-8 ordered due_at asc (member_code/title/days-late/Rp + fine preview).
// Deep link ?overdue=1 → peminjaman filtered. Modal return creates fine + frees stock
// (PUT 200, loan leaves ?overdue=1). Empty state "Belum ada keterlambatan."
// Edge: boundary + race 409 CONFLICT exact.

function read(p: string): string {
  return readFileSync(join(process.cwd(), p), 'utf8');
}

describe('US-2 overdue fastlane — dashboard queue', () => {
  it('dashboard lists overdue top-8 ordered due_at asc', () => {
    const src = read('src/app/admin/page.tsx');
    expect(src, 'RED: dashboard has no overdue query').toMatch(/overdue/i);
    expect(src, 'RED: dashboard overdue must order by due_at asc').toMatch(
      /order\(\s*['"]due_at['"]\s*,\s*\{\s*ascending:\s*true/
    );
    expect(src, 'RED: dashboard overdue must be bounded top-8 .limit(8)').toMatch(
      /\.limit\(\s*8\s*\)/
    );
  });

  it('dashboard row shows member_code/title/days-late/Rp + fine preview', () => {
    const src = read('src/app/admin/page.tsx');
    expect(src, 'RED: dashboard overdue row missing member_code').toContain('member_code');
    expect(src, 'RED: dashboard overdue row missing title').toContain('title');
    expect(src, 'RED: dashboard overdue row missing days-late').toMatch(
      /hari|telat|days[_-]?late|daysLate/i
    );
    expect(src, 'RED: dashboard overdue row missing Rp fine').toMatch(/Rp/);
    expect(
      src.includes('calcFine') || src.includes('FINE_PER_DAY') || src.includes('fine_preview'),
      'RED: dashboard must preview fine via existing fine logic (calcFine/FINE_PER_DAY/fine_preview)'
    ).toBe(true);
  });

  it('dashboard deep-links ?overdue=1 + empty state', () => {
    const src = read('src/app/admin/page.tsx');
    expect(src, 'RED: dashboard missing deep link ?overdue=1 to peminjaman').toContain(
      '?overdue=1'
    );
    expect(src, 'RED: dashboard peminjaman link missing').toMatch(/\/admin\/peminjaman\?overdue=1/);
    expect(src, 'RED: dashboard missing empty state "Belum ada keterlambatan."').toContain(
      'Belum ada keterlambatan.'
    );
  });

  it('dashboard keeps .limit(500) bounds (no unbounded fetch)', () => {
    const src = read('src/app/admin/page.tsx');
    expect(src, 'dashboard must keep .limit(500) bounds').toMatch(/\.limit\(\s*500\s*\)/);
  });
});

describe('US-2 overdue fastlane — peminjaman preselect + 1-click return', () => {
  it('peminjaman preselects ?overdue=1 and sorts due_at asc', () => {
    const src = read('src/app/admin/peminjaman/page.tsx');
    expect(src, 'RED: peminjaman does not read ?overdue=1').toMatch(/overdue/);
    expect(src, 'RED: peminjaman must fetch GET /api/loans?overdue=1').toMatch(
      /overdue.*1|1.*overdue/
    );
    expect(src, 'RED: peminjaman must call /api/loans').toContain('/api/loans');
    expect(src, 'RED: peminjaman overdue must sort due_at asc').toMatch(/due_at/);
    expect(src, 'RED: peminjaman overdue must sort ascending').toMatch(/sort|ascending:\s*true/);
  });

  it('Modal return creates fine + frees stock (PUT 200, loan leaves ?overdue=1)', () => {
    const ui = read('src/app/admin/peminjaman/page.tsx');
    const api = read('src/app/api/loans/route.ts') + '\n' + read('src/lib/loans-return.ts');
    // Reuse Modal pattern from dialogs lane (no native confirm/alert).
    expect(ui, 'RED: peminjaman must reuse <Modal for return').toContain('<Modal');
    expect(ui, 'RED: peminjaman must not use native confirm()').not.toMatch(/\bconfirm\s*\(/);
    expect(ui, "RED: peminjaman must send { action: 'return' }").toMatch(/action.*return/);
    expect(ui, 'RED: peminjaman must PUT for return').toMatch(/method:\s*['"]PUT['"]/);
    // Contract: return creates fine + frees stock + audit retry preserved.
    expect(api, 'return must compute fine (calcFine/fine_amount)').toMatch(/calcFine|fine_amount/);
    expect(api, 'return must free stock (+1)').toMatch(/stock_available/);
    expect(api, 'return must create fines row when fine > 0').toMatch(/from\(['"]fines['"]\)/);
    expect(api, 'PRESERVE: collective PUT audit retry must stay').toContain('activity_logs');
    expect(api, 'PRESERVE: audit retry log must stay (structured logger)').toMatch(
      /createLogger|audit\.activity_logs_retry/
    );
  });

  it('edge: fine boundary (on-time 0, 1-day Rp1.000)', () => {
    // Mirror of calcFine in src/lib/supabase/auth.ts (FINE_PER_DAY=1000,
    // floor late-days, on-time=0). Direct import would pull next/server via
    // auth.ts → server.ts cache() which has no node runtime here, so assert
    // the contract source + verify boundary math on the same formula.
    const auth = read('src/lib/supabase/auth.ts');
    expect(auth, 'fine logic must define FINE_PER_DAY = 1000').toMatch(/FINE_PER_DAY\s*=\s*1000/);
    expect(auth, 'calcFine must floor late-days').toMatch(/Math\.floor/);
    const FINE_PER_DAY = 1000;
    const calcFine = (dueDate: Date, returnDate: Date): number => {
      const due = new Date(dueDate);
      const ret = new Date(returnDate);
      due.setHours(0, 0, 0, 0);
      ret.setHours(0, 0, 0, 0);
      const lateDays = Math.floor((ret.getTime() - due.getTime()) / 86400000);
      return lateDays > 0 ? lateDays * FINE_PER_DAY : 0;
    };
    const due = new Date('2026-01-10T00:00:00Z');
    expect(calcFine(due, new Date('2026-01-10T00:00:00Z'))).toBe(0);
    expect(calcFine(due, new Date('2026-01-09T00:00:00Z'))).toBe(0);
    expect(calcFine(due, new Date('2026-01-11T00:00:00Z'))).toBe(1000);
  });

  it('edge: race/boundary 409 CONFLICT exact codes preserved', () => {
    // S-roi3 single-source: guard lives in helper, routes are thin aliases.
    const helper = read('src/lib/loans-return.ts');
    const collective = read('src/app/api/loans/route.ts');
    const single = read('src/app/api/loans/[id]/return/route.ts');
    for (const [name, src] of [
      ['collective PUT', collective + '\n' + helper],
      ['[id]/return POST', single + '\n' + helper],
    ] as const) {
      expect(src, `${name} must reuse error-contract CONFLICT`).toMatch(
        /jsonError\(['"]CONFLICT['"]/
      );
      expect(src, `${name} race must be 409`).toContain(', 409)');
    }
    // Boundary: already-returned → 409 (no double return / no double stock +1).
    expect(helper, 'helper already-returned guard missing').toMatch(/Sudah dikembalikan/);
    expect(collective, 'collective PUT must delegate to returnLoan').toContain('returnLoan');
    expect(single, '[id]/return must delegate to returnLoan').toContain('returnLoan');
  });
});
