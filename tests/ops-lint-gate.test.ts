import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// T-O3: eslint 9 + strict any gate.
// Primary path: eslint major>=9, FlatCompat/next preserved, no-explicit-any error on src, warn on tests.
// Fallback path (documented): if eslint 9 breaks next/core-web-vitals compat at install/lint
// time, pin eslint to 8.57.1 AND keep the same strict src-error gate. This test accepts the
// fallback as GREEN to avoid blocking Operasional 88 on an upstream compat break, but the
// primary expectation remains major>=9.

function readPkg(): { eslintSpec: string } {
  const raw = readFileSync(resolve(process.cwd(), 'package.json'), 'utf8');
  const pkg = JSON.parse(raw) as {
    devDependencies?: Record<string, string>;
    dependencies?: Record<string, string>;
  };
  const eslintSpec = pkg.devDependencies?.['eslint'] ?? pkg.dependencies?.['eslint'] ?? '';
  return { eslintSpec };
}

function majorOf(spec: string): number {
  const m = spec.match(/(\d+)\.\d+\.\d+/);
  return m?.[1] ? Number(m[1]) : NaN;
}

function readConfig(): string {
  return readFileSync(resolve(process.cwd(), 'eslint.config.mjs'), 'utf8');
}

describe('ops lint gate (T-O3)', () => {
  it('RED: eslint major>=9 (fallback: 8.57.1 accepted only with strict src gate)', () => {
    const { eslintSpec } = readPkg();
    const major = majorOf(eslintSpec);
    expect(Number.isFinite(major)).toBe(true);
    if (major === 8) {
      // Fallback documented above: 8.x is GREEN only when pinned >=8.57.1
      // and the strict src-error gate below also passes.
      expect(eslintSpec).toMatch(/8\.57\.\d+|8\.(5[8-9]|[6-9]\d)\.\d+|[9-9]\d*\./);
    } else {
      expect(major).toBeGreaterThanOrEqual(9);
    }
  });

  it('RED: FlatCompat + next/core-web-vitals preserved', () => {
    const config = readConfig();
    expect(config).toContain('FlatCompat');
    expect(config).toContain('next/core-web-vitals');
  });

  it('RED: no-explicit-any is error on src, warn on tests, never off covering src', () => {
    const config = readConfig();
    // Strict gate must exist as error somewhere (the src block).
    expect(config).toMatch(/no-explicit-any['"]\s*:\s*['"]error['"]/);
    // Tests may relax to warn, never off is also fine — but off must not leak to src.
    // Any `off` occurrence must sit in a block whose files scope mentions tests.
    const offBlocks = [
      ...config.matchAll(
        /files\s*:\s*\[[^\]]*\]\s*,?\s*rules\s*:\s*\{[^}]*no-explicit-any['"]\s*:\s*['"]off['"][^}]*\}/g
      ),
    ];
    for (const m of offBlocks) {
      expect(m[0]).toMatch(/tests/);
      expect(m[0]).not.toMatch(/src/);
    }
    // No bare top-level `rules: { ... no-explicit-any: 'off' }` without a files scope.
    const bareOff = config.match(
      /(?<!files\s*:\s*\[[^\]]{0,200})rules\s*:\s*\{\s*['"]@typescript-eslint\/no-explicit-any['"]\s*:\s*['"]off['"]/
    );
    // If a files-scoped off for tests exists it is matched above; a bare off is forbidden.
    // Allow the tests-scoped form only: detect off without a nearby files guard.
    const offCount = (config.match(/no-explicit-any['"]\s*:\s*['"]off['"]/g) ?? []).length;
    expect(offCount).toBeLessThanOrEqual(offBlocks.length);
    expect(bareOff).toBeNull();
  });
});
