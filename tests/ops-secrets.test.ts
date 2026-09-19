import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
