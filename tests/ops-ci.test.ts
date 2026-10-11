import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// T-O2: CI workflow — 5 jobs: typecheck, lint, test (unit+components),
// integration (gated), playwright-list
function readCi(): string {
  return readFileSync(resolve(process.cwd(), '.github/workflows/ci.yml'), 'utf8');
}

describe('ops ci workflow (T-O2)', () => {
  it('RED: has typecheck job running tsc --noEmit', () => {
    const raw = readCi();
    expect(raw).toMatch(/typecheck\s*:/);
    expect(raw).toContain('tsc --noEmit');
  });

  it('RED: has lint job running eslint', () => {
    const raw = readCi();
    expect(raw).toMatch(/^\s{2}lint\s*:/m);
    expect(raw).toContain('eslint');
  });

  it('RED: has test job running vitest --project=unit', () => {
    const raw = readCi();
    expect(raw).toMatch(/^\s{2}test\s*:/m);
    expect(raw).toMatch(/vitest (run )?--project=unit/);
  });

  it('RED: has playwright-list job running npx playwright test --list', () => {
    const raw = readCi();
    expect(raw).toMatch(/playwright-list\s*:/);
    expect(raw).toContain('npx playwright test --list');
  });

  it('RED: runs on push and PR to main and dev branches', () => {
    const raw = readCi();
    expect(raw).toMatch(/on:/);
    expect(raw).toMatch(/push:/);
    expect(raw).toMatch(/pull_request:/);
    expect(raw).toContain('main');
    expect(raw).toContain('dev');
  });

  it('GREEN guard: Node 22 + npm ci + npm cache', () => {
    const raw = readCi();
    expect(raw).toMatch(/node-version\s*:\s*['"]?22['"]?/);
    expect(raw).toContain('npm ci');
    expect(raw).toMatch(/cache\s*:\s*npm/);
  });

  // Issue #23: job integration opsional — gate variable + secrets, JUnit artifact.
  it('RED: has integration job gated by RUN_SUPABASE_INTEGRATION variable', () => {
    const raw = readCi();
    expect(raw).toMatch(/^\s{2}integration\s*:/m);
    expect(raw).toContain("vars.RUN_SUPABASE_INTEGRATION == 'true'");
    expect(raw).toContain('TEST_SUPABASE_SERVICE_KEY');
  });

  it('RED: integration job runs the integration vitest project + uploads report', () => {
    const raw = readCi();
    expect(raw).toMatch(/vitest run --project=integration/);
    expect(raw).toContain('integration-test-results');
    expect(raw).toContain('actions/upload-artifact@v4');
  });

  // Regresi issue #23: tanpa kredensial, suite integration harus ter-skip
  // (describe.skipIf) — bukan throw saat koleksi seperti sebelumnya.
  it('GREEN guard: integration suites lazy-init client + skipIf tanpa kredensial', () => {
    for (const suite of ['books', 'loans', 'reservations']) {
      const src = readFileSync(
        resolve(process.cwd(), `tests/integration/${suite}.test.ts`),
        'utf8'
      );
      expect(src).toContain('describe.skipIf(skipIfNoSupabase())');
      // Client tidak boleh dibuat di top-level module (melempar tanpa env).
      expect(src).not.toMatch(/^const supabase = getSupabaseServiceClient\(\)/m);
      expect(src).toMatch(/let supabase!/);
    }
  });
});
