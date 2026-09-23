import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// T-O2: CI workflow — 4 jobs: typecheck, lint, test (unit), playwright-list
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
    expect(raw).toContain('vitest --project=unit');
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

  it('GREEN guard: Node 20 + npm ci + npm cache', () => {
    const raw = readCi();
    expect(raw).toMatch(/node-version\s*:\s*['"]?20['"]?/);
    expect(raw).toContain('npm ci');
    expect(raw).toMatch(/cache\s*:\s*npm/);
  });
});
