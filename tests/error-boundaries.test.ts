import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Keandalan & Pengujian — error boundaries: reset/retry assertions for
// src/app/error.tsx + admin/error.tsx + (public)/error.tsx.
// Source-contract style (consistent with repo characterization tests):
// each boundary must wire onClick={reset}, role="alert", retry label.

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const BOUNDARIES = [
  ['root', 'src/app/error.tsx'],
  ['admin', 'src/app/admin/error.tsx'],
  ['public', 'src/app/(public)/error.tsx'],
] as const;

describe('error boundaries reset/retry', () => {
  for (const [name, path] of BOUNDARIES) {
    it(`${name} boundary (${path}) wires reset handler on retry button`, () => {
      const src = read(path);
      expect(src, `${name}: retry button must call reset`).toContain('onClick={reset}');
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
