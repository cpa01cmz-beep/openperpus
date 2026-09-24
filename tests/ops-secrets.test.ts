import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// T-O1: wrangler.toml [vars] must not carry committed secrets.
// Real values live in Cloudflare via `wrangler secret put`, never in the repo.
function readVarsSection(): string {
  const raw = readFileSync(resolve(process.cwd(), 'wrangler.toml'), 'utf8');
  const lines = raw.split('\n');
  const start = lines.findIndex((line) => line.trim() === '[vars]');
  if (start === -1) return '';
  const collected: string[] = [];
  for (let i = start; i < lines.length; i += 1) {
    const trimmed = lines[i]?.trim() ?? '';
    if (i > start && /^\[.*\]/.test(trimmed)) break;
    collected.push(lines[i] ?? '');
  }
  return collected.join('\n');
}

function activeVarsLines(vars: string): string[] {
  return vars
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

// US-3: env keys provided by the platform/CI/npm runtime never live in .env.example.
const ENV_ALLOWLIST = new Set([
  'NODE_ENV',
  'VERCEL_URL',
  'NEXT_VERCEL_URL',
  'CI',
  'GITHUB_ACTIONS',
  'npm_package_version',
]);

function collectSrcFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSrcFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function envKeysUsedInSrc(): Set<string> {
  const keys = new Set<string>();
  for (const file of collectSrcFiles(resolve(process.cwd(), 'src'))) {
    const content = readFileSync(file, 'utf8');
    for (const match of content.matchAll(/process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
      if (match[1]) keys.add(match[1]);
    }
    for (const match of content.matchAll(
      /process\.env\[\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]\s*\]/g
    )) {
      if (match[1]) keys.add(match[1]);
    }
  }
  return keys;
}

function readEnvExample(): { raw: string; lines: string[] } {
  const raw = readFileSync(resolve(process.cwd(), '.env.example'), 'utf8');
  return { raw, lines: raw.split('\n') };
}

function documentedEnvKeys(lines: string[]): Set<string> {
  const keys = new Set<string>();
  for (const line of lines) {
    const match = line.match(/^\s*#?\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match?.[1]) keys.add(match[1]);
  }
  return keys;
}

function activeLineIndex(lines: string[], key: string): number {
  return lines.findIndex((line) => new RegExp(`^${key}\\s*=`).test(line.trim()));
}

describe('ops secrets (T-O1)', () => {
  it('RED: [vars] carries no JWT literal', () => {
    const vars = readVarsSection();
    const active = activeVarsLines(vars).join('\n');
    // eyJhbG = base64 JWT header prefix (HS256/JWT). Zero tolerance in [vars].
    expect(active).not.toContain('eyJhbG');
  });

  it('RED: [vars] carries no supabase.co URL literal', () => {
    const vars = readVarsSection();
    const active = activeVarsLines(vars).join('\n');
    expect(active).not.toMatch(/https:\/\/[a-z0-9-]+\.supabase\.co/);
  });

  it('GREEN guard: no active NEXT_PUBLIC_SUPABASE_* assignment in [vars]', () => {
    const vars = readVarsSection();
    const active = activeVarsLines(vars);
    const leaked = active.filter((line) => /^NEXT_PUBLIC_SUPABASE_(URL|ANON_KEY)\s*=/.test(line));
    expect(leaked).toEqual([]);
  });
});

describe('ops env completeness (US-3)', () => {
  it('documents METRICS_TOKEN and SENTRY_DSN in .env.example with purpose comments', () => {
    const { lines } = readEnvExample();
    for (const [key, purpose] of [
      ['METRICS_TOKEN', /metric/i],
      ['SENTRY_DSN', /sentry|observ/i],
    ] as const) {
      const index = activeLineIndex(lines, key);
      expect(index, `${key} must have an active line in .env.example`).toBeGreaterThanOrEqual(0);
      const comment = lines
        .slice(Math.max(0, index - 3), index)
        .reverse()
        .find((line) => line.trim().startsWith('#'));
      expect(comment, `${key} must carry a purpose comment`).toBeDefined();
      expect(comment).toMatch(purpose);
    }
  });

  it('documents every process.env key used in src in .env.example or the allowlist', () => {
    const used = envKeysUsedInSrc();
    const documented = documentedEnvKeys(readEnvExample().lines);
    const undocumented = [...used].filter((key) => !documented.has(key) && !ENV_ALLOWLIST.has(key));
    expect(undocumented).toEqual([]);
  });
});
