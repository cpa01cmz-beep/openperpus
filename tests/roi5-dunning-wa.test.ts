import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// S-roi5 "Tagih denda overdue via WA 1-klik + salin rincian".
// AC1: overdue row Tagih WA → wa.me prefilled "Halo, denda Rp15.000 untuk [judul]
//      jatuh tempo [due_at]", click logged via activity_logs without mutating loan.
// AC2: Salin rincian → clipboard loan ID, member_code, title, due_at, late days,
//      fine Rp; copy failure shows role=alert.
// AC3: non-staff guard → access-denied/login message, Tagih WA + Kembalikan
//      disabled, no wa.me with leaked member data.

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('S-roi5 AC1: Tagih WA opens wa.me prefilled + logs click without mutation', () => {
  it('wa-dunning lib builds message "Halo, denda Rp... untuk [judul] jatuh tempo [due_at]"', async () => {
    const mod = (await import('@/lib/wa-dunning')) as {
      buildDunningMessage?: unknown;
      buildWaDunningUrl?: unknown;
      formatRp?: unknown;
    };
    expect(
      mod.buildDunningMessage,
      'RED: src/lib/wa-dunning.ts must export buildDunningMessage'
    ).toBeTypeOf('function');
    const build = mod.buildDunningMessage as (args: {
      title: string;
      dueAt: string;
      fine: number;
    }) => string;
    const msg = build({ title: 'Laskar Pelangi', dueAt: '2026-01-10', fine: 15000 });
    expect(msg).toContain('Halo, denda Rp15.000');
    expect(msg).toContain('Laskar Pelangi');
    expect(msg).toContain('2026-01-10');
    expect(mod.buildWaDunningUrl, 'RED: must export buildWaDunningUrl').toBeTypeOf('function');
    const url = (mod.buildWaDunningUrl as (text: string) => string)(msg);
    expect(url.startsWith('https://wa.me/'), 'must open wa.me').toBe(true);
    expect(url).toContain(encodeURIComponent('Halo, denda Rp15.000'));
  });

  it('peminjaman overdue row renders DunningButton; click logs activity_logs, no loan mutation', () => {
    const page = read('src/app/admin/peminjaman/page.tsx');
    expect(page).toContain('DunningButton');
    const btn = read('src/components/admin/DunningButton.tsx');
    expect(btn).toContain('https://wa.me/');
    expect(btn).toContain('encodeURIComponent');
    expect(btn).toContain('target="_blank"');
    expect(btn).toContain('activity_logs');
    // Click must not mutate loan: no PUT/return/fines insert in the button.
    expect(btn, 'Tagih WA must not mutate loan (no PUT)').not.toMatch(/method:\s*['"]PUT['"]/);
    expect(btn, 'Tagih WA must not write fines').not.toContain("from('fines')");
    expect(btn, 'Tagih WA must not call return').not.toMatch(/action.*return/);
  });
});

describe('S-roi5 AC2: Salin rincian copies loan detail, failure shows role=alert', () => {
  it('DunningButton copies loan ID, member_code, title, due_at, late days, fine Rp via clipboard', () => {
    const btn = read('src/components/admin/DunningButton.tsx');
    expect(btn).toContain('Salin rincian');
    expect(btn).toContain('navigator.clipboard');
    expect(btn).toContain('writeText');
    const copyIdx = btn.indexOf('writeText');
    const window_ = btn.slice(Math.max(0, copyIdx - 1200), copyIdx + 400);
    expect(window_, 'copy payload must include loan id').toMatch(/loan[Ii]d|\bid\b|r\.id|loan\.id/);
    expect(window_, 'copy payload must include member_code').toContain('member_code');
    expect(window_, 'copy payload must include title').toContain('title');
    expect(window_, 'copy payload must include due_at').toContain('due_at');
    expect(window_, 'copy payload must include late days').toMatch(/late|telat|terlambat|hari/i);
    expect(window_, 'copy payload must include fine Rp').toMatch(/Rp|fine/);
  });

  it('copy failure surfaces role=alert', () => {
    const btn = read('src/components/admin/DunningButton.tsx');
    expect(btn).toContain('role="alert"');
    // catch path must set an error state (pattern from denda receipt: setError('Gagal menyalin...')).
    expect(btn).toMatch(/catch|Gagal menyalin/);
  });
});

describe('S-roi5 AC3: guard rejects non-staff, disables actions, leaks nothing', () => {
  it('non-staff sees access-denied/login message; Tagih WA + Kembalikan disabled; no wa.me with member data', () => {
    const page = read('src/app/admin/peminjaman/page.tsx');
    // Guard: API 401/403 → access-denied/login message.
    expect(page).toMatch(/401|403/);
    expect(page).toMatch(/login|akses|ditolak|tidak berhak|forbidden|unauthorized/i);
    // Disabled state for both actions when guard rejects.
    expect(page).toMatch(/disabled/);
    // No wa.me href built from leaked member data at page level (only inside staff-gated button).
    const leaks = page.includes('https://wa.me/${') && page.includes('member_code');
    expect(leaks, 'page must not build wa.me href with member data outside gated button').toBe(
      false
    );
  });
});
