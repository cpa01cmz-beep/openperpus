import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// T-O2: CI matrix expansion — single-job CI splits into 4 jobs.
function readCi(): string {
  return readFileSync(resolve(process.cwd(), '.github/workflows/ci.yml'), 'utf8');
}

describe('ops ci matrix (T-O2)', () => {
  it('RED: has lint-typecheck job', () => {
    expect(readCi()).toMatch(/lint-typecheck\s*:/);
  });

  it('RED: has test job', () => {
    // Match a top-level `test:` job key (2-space indent under jobs:).
    expect(readCi()).toMatch(/^\s{2}test\s*:/m);
  });

  it('RED: has cf-build job with cf:build key', () => {
    const raw = readCi();
    expect(raw).toMatch(/cf-build\s*:/);
    expect(raw).toContain('cf:build');
  });

  it('RED: has coverage key', () => {
    const raw = readCi().toLowerCase();
    expect(raw).toMatch(/coverage/);
  });

  it('RED: has preview job with preview key, non-blocking + token secret', () => {
    const raw = readCi();
    expect(raw).toMatch(/preview\s*:/);
    expect(raw.toLowerCase()).toContain('preview');
    // Non-blocking preview must not fail the pipeline.
    expect(raw).toContain('continue-on-error: true');
    // Preview talks to Cloudflare — token via secrets, never literal.
    expect(raw).toContain('CLOUDFLARE_API_TOKEN');
  });

  it('GREEN guard: Node20 + npm ci + npm cache across jobs', () => {
    const raw = readCi();
    expect(raw).toMatch(/node-version\s*:\s*['"]?20['"]?/);
    expect(raw).toContain('npm ci');
    expect(raw).toMatch(/cache\s*:\s*npm/);
  });
});
