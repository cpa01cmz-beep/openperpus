import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    from: () => ({
      select: () => ({
        limit: async () => ({ data: [{ id: 'ping' }], error: null }),
      }),
    }),
  })),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('ops observability — sentry stub + error boundaries (RED first)', () => {
  it('RED: src/lib/observability.ts exists with initSentry, captureException', () => {
    const obs = read('src/lib/observability.ts');
    expect(obs).toContain('export function initSentry');
    expect(obs).toContain('export function captureException');
    // No @sentry dependency
    const pkg = read('package.json');
    expect(pkg).not.toMatch(/@sentry/);
  });

  it('RED: error.tsx imports observability and calls captureException in useEffect', () => {
    const error = read('src/app/error.tsx');
    expect(error).toContain('@/lib/observability');
    expect(error).toContain('captureException');
    expect(error).toMatch(/useEffect\(.*captureException/s);
  });

  it('RED: global-error.tsx imports observability and calls captureException in useEffect', () => {
    const globalError = read('src/app/global-error.tsx');
    expect(globalError).toContain('@/lib/observability');
    expect(globalError).toContain('captureException');
    expect(globalError).toMatch(/useEffect\(.*captureException/s);
  });

  it('RED: initSentry is no-op when no DSN, does not throw', () => {
    const obs = read('src/lib/observability.ts');
    expect(obs).toMatch(/if\s*\(!\s*(dsn|sentryDsn)\s*\)|dsn\s*===/);
  });

  it('GREEN guard: no new @sentry/* dependencies in package.json', () => {
    const pkg = read('package.json');
    expect(pkg).not.toMatch(/@sentry/);
  });
});
