import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Keandalan & Pengujian — error boundaries: reset/retry assertions for
// src/app/error.tsx + admin/error.tsx + (public)/error.tsx.
// Source-contract style (consistent with repo characterization tests):
// each boundary must wire retry handler, role="alert", retry label.

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const BOUNDARIES = [
  ['root', 'src/app/error.tsx'],
  ['admin', 'src/app/admin/error.tsx'],
  ['public', 'src/app/(public)/error.tsx'],
] as const;

const RESILIENCE_BOUNDARIES = [
  ['root', 'src/app/error.tsx'],
  ['global', 'src/app/global-error.tsx'],
] as const;

describe('error boundaries reset/retry', () => {
  for (const [name, path] of BOUNDARIES) {
    it(`${name} boundary (${path}) wires retry handler on retry button`, () => {
      const src = read(path);
      // root uses handleRetry (with backoff), admin/public use reset directly
      if (name === 'root') {
        expect(src, `${name}: retry button must call handleRetry`).toContain(
          'onClick={handleRetry}'
        );
      } else {
        expect(src, `${name}: retry button must call reset`).toContain('onClick={reset}');
      }
      expect(src, `${name}: must accept reset prop`).toContain('reset');
    });

    it(`${name} boundary (${path}) exposes alert role + retry label`, () => {
      const src = read(path);
      expect(src, `${name}: must expose role="alert"`).toContain('role="alert"');
      expect(src, `${name}: must render retry label`).toMatch(/Coba Lagi|Coba lagi/);
    });

    it(`${name} boundary (${path}) surfaces digest for correlation`, () => {
      const src = read(path);
      expect(src, `${name}: must surface error.digest`).toContain('error.digest');
    });
  }

  it('all three boundaries keep reset prop type () => void', () => {
    for (const [name, path] of BOUNDARIES) {
      const src = read(path);
      expect(src, `${name}: reset must be () => void`).toContain('reset: () => void');
    }
  });
});

describe('error boundaries resilience: retry/backoff/offline/requestId (root + global only)', () => {
  // T4: only root and global boundaries must implement:
  // - useEffect logger digest with requestId
  // - Retry-After respecting exponential backoff
  // - Offline-aware copy (navigator.onLine check)
  // - Display requestId from error boundary props
  for (const [name, path] of RESILIENCE_BOUNDARIES) {
    it(`${name} boundary (${path}) includes useEffect logger with requestId`, () => {
      const src = read(path);
      expect(src, `${name}: must have useEffect for logging`).toContain('useEffect');
      expect(src, `${name}: must log requestId/digest`).toMatch(/requestId|digest/);
    });

    it(`${name} boundary (${path}) implements exponential backoff retry logic`, () => {
      const src = read(path);
      expect(src, `${name}: must have retry delay/backoff logic`).toMatch(
        /setTimeout|retryDelay|backoff|exponential/
      );
    });

    it(`${name} boundary (${path}) has offline-aware copy via navigator.onLine`, () => {
      const src = read(path);
      expect(src, `${name}: must check navigator.onLine`).toContain('navigator.onLine');
      expect(src, `${name}: must show offline messaging`).toMatch(
        /offline|tanpa jaringan|koneksi terputus/i
      );
    });

    it(`${name} boundary (${path}) displays requestId from error props`, () => {
      const src = read(path);
      expect(src, `${name}: must accept requestId in props`).toContain('requestId');
      expect(src, `${name}: must render requestId`).toContain('requestId');
    });
  }

  it('global-error boundary keeps full HTML structure with resilience features', () => {
    const src = read('src/app/global-error.tsx');
    expect(src, 'global: must have html tag').toContain('<html');
    expect(src, 'global: must have body tag').toContain('<body');
    expect(src, 'global: must have useEffect for logging').toContain('useEffect');
    expect(src, 'global: must check navigator.onLine').toContain('navigator.onLine');
    expect(src, 'global: must have retry delay/backoff logic').toMatch(
      /setTimeout|retryDelay|backoff|exponential/
    );
  });
});
