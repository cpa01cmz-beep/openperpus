import { describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { jsonError } from '@/lib/supabase/auth';

// FIX error-leak: 500/404/409 responses must carry generic codes + request-id.
// Full DB detail goes to server log (createLogger). Raw `error.message`
// (Postgres/SQL internals) must never reach API clients.
// GLOBAL scan: every src/app/api/**/route.ts file — no exclusions.

function collectRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...collectRouteFiles(full));
    else if (ent.isFile() && ent.name === 'route.ts') out.push(full);
  }
  return out.sort();
}

const ROUTES = collectRouteFiles(join(process.cwd(), 'src/app/api'));

const LEAK_PATTERNS = [
  /postgres/i,
  /pg_/,
  /relation "/,
  /duplicate key/i,
  /stack trace/i,
  /\bat .*:\d+:\d+/,
];

const STR_RE = /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g;

function jsonErrorSpans(src: string): string[] {
  const spans: string[] = [];
  let from = 0;
  for (;;) {
    const start = src.indexOf('jsonError(', from);
    if (start < 0) break;
    let depth = 0;
    let i = start + 'jsonError'.length;
    for (; i < src.length; i++) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')') {
        depth--;
        if (depth === 0) break;
      }
    }
    spans.push(src.slice(start, i + 1));
    from = i + 1;
  }
  return spans;
}

const RISKY_STATUS = /,\s*(500|404|409)\b/;
const RAW_DETAIL = /error\?\.message|error\.message|rpcMsg|stockErr\.message/i;

function riskySpans(src: string): string[] {
  return jsonErrorSpans(src).filter((s) => RISKY_STATUS.test(s));
}

function hasDetailsArg(call: string): boolean {
  const codeOnly = call.replace(STR_RE, '""');
  return (codeOnly.match(/,/g) ?? []).length >= 3;
}

describe('security: error responses leak no internals', () => {
  it('route scan is not vacuous', () => {
    expect(ROUTES.length, 'must discover src/app/api/**/route.ts files').toBeGreaterThan(0);
  });

  it('500/404/409 jsonError calls pass no raw DB message as details', () => {
    let checked = 0;
    for (const abs of ROUTES) {
      const rel = relative(process.cwd(), abs);
      const src = readFileSync(abs, 'utf8');
      for (const call of riskySpans(src)) {
        checked++;
        const codeOnly = call.replace(STR_RE, '""');
        expect(
          RAW_DETAIL.test(codeOnly),
          `LEAK in ${rel}: raw error detail reaches client: ${call.slice(0, 160)}`
        ).toBe(false);
        // Calls with a details (4th) arg must carry { requestId } — full DB
        // detail goes to server log. Plain 3-arg business guards (e.g. stock
        // 409s / plain 404s with generic messages only) carry no leak and
        // need no details.
        if (hasDetailsArg(call)) {
          expect(
            call.includes('requestId'),
            `LEAK-SHAPE in ${rel}: 500/404/409 details must be { requestId }: ${call.slice(0, 160)}`
          ).toBe(true);
        }
      }
    }
    expect(checked, 'must cover 500/404/409 paths').toBeGreaterThan(0);
  });

  it('routes exposing details log full detail server-side via createLogger', () => {
    for (const abs of ROUTES) {
      const rel = relative(process.cwd(), abs);
      const src = readFileSync(abs, 'utf8');
      if (riskySpans(src).filter(hasDetailsArg).length === 0) continue;
      expect(src.includes('createLogger'), `${rel} must log server-side via createLogger`).toBe(
        true
      );
      expect(src.includes('requestIdFromHeaders'), `${rel} must trace request-id`).toBe(true);
    }
  });

  it('jsonError body keeps {error:{code,message}} shape with no internals', async () => {
    const res = jsonError('SAVE_FAILED', 'Gagal mencatat peminjaman.', 500, {
      requestId: 'req-123',
    });
    expect(res.status).toBe(500);
    const body = (await res.json()) as unknown;
    const s = JSON.stringify(body);
    expect(s).toContain('"code":"SAVE_FAILED"');
    for (const pat of LEAK_PATTERNS) {
      expect(pat.test(s), `LEAK: response body matches ${pat}`).toBe(false);
    }
  });

  it('409 conflict body carries generic message + requestId, no DB detail', async () => {
    const res = jsonError('CONFLICT', 'Denda sudah berubah status, muat ulang dulu.', 409, {
      requestId: 'req-456',
    });
    expect(res.status).toBe(409);
    const s = JSON.stringify(await res.json());
    expect(s).toContain('req-456');
    for (const pat of LEAK_PATTERNS) {
      expect(pat.test(s), `LEAK: 409 body matches ${pat}`).toBe(false);
    }
  });

  it('404 body carries generic message + requestId, no DB detail', async () => {
    const res = jsonError('NOT_FOUND', 'Buku tidak ditemukan.', 404, {
      requestId: 'req-789',
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('NOT_FOUND');
    const s = JSON.stringify(body);
    expect(s).toContain('req-789');
    for (const pat of LEAK_PATTERNS) {
      expect(pat.test(s), `LEAK: 404 body matches ${pat}`).toBe(false);
    }
  });
});
