import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('supply-chain (isu #70)', () => {
  it('.npmrc tanpa force=true, legacy-peer-deps + expiry', () => {
    const npmrc = read('.npmrc');
    expect(npmrc).toContain('legacy-peer-deps=true');
    expect(npmrc).not.toContain('force=true');
    expect(npmrc).toContain('expiry');
  });

  it('package.json tanpa preinstall + runtime deps exact', () => {
    const pkg = JSON.parse(read('package.json')) as {
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
    };
    expect(pkg.scripts['preinstall']).toBeUndefined();
    expect(pkg.scripts['postinstall']).toContain('verify-patches');
    for (const dep of ['react', 'react-dom', 'sanitize-html', 'server-only', 'lucide-react']) {
      expect(pkg.dependencies[dep], dep).toBeDefined();
      expect(pkg.dependencies[dep], dep).not.toMatch(/^\^/);
    }
  });

  it('scripts/verify-patches.mjs ada + catat upstream', () => {
    expect(existsSync(join(process.cwd(), 'scripts/verify-patches.mjs'))).toBe(true);
    const src = read('scripts/verify-patches.mjs');
    expect(src).toContain('opennextjs-cloudflare');
    expect(src).toContain('sha256');
  });

  it('ci.yml mengandung npm audit', () => {
    expect(read('.github/workflows/ci.yml')).toContain('npm audit');
  });
});
