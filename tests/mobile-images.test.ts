import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const HERO_FILES = [
  'src/components/hero/variants/CenteredHero.tsx',
  'src/components/hero/variants/ClassicHero.tsx',
  'src/components/hero/variants/StackedHero.tsx',
  'src/components/hero/variants/SplitHero.tsx',
  'src/components/hero/variants/EditorialHero.tsx',
];

/** T-M5: BookCard sizes + hero priority-only-first (Mobile 88→90+).
 * RED first: BookCard lacks fetchPriority/decoding; heroes prioritize
 * active slide (i === idx) instead of first-only (i === 0).
 * Iteration 1 (2026-09-19): global unoptimized:true REPLACED by custom
 * Supabase-transform loader (src/lib/imageLoader.ts) — valid on CF Workers
 * (pure URL rewrite, no optimization server needed) and restores srcset.
 * Assertions below lock the NEW contract: no unoptimized bypass anywhere,
 * custom loader configured, srcset/sizes active.
 */
describe('T-M5 BookCard image hints', () => {
  const f = 'src/components/public/BookCard.tsx';

  it('BookCard cover has fetchPriority hint', () => {
    const src = read(f);
    expect(src.includes('fetchPriority'), `${f} must include fetchPriority`).toBe(true);
  });

  it('BookCard cover has decoding hint', () => {
    const src = read(f);
    expect(src.includes('decoding='), `${f} must include decoding=`).toBe(true);
  });

  it('BookCard cover keeps tight sizes', () => {
    const src = read(f);
    expect(
      src.includes('sizes="(max-width:640px) 50vw'),
      `${f} must keep tight sizes starting with (max-width:640px) 50vw`
    ).toBe(true);
  });

  it('BookCard uses responsive srcset (no unoptimized bypass)', () => {
    const src = read(f);
    expect(src.includes('unoptimized'), `${f} must not bypass optimization`).toBe(false);
    expect(src.includes('sizes='), `${f} must keep sizes for srcset`).toBe(true);
  });

  it('BookCard cover stays lazy', () => {
    const src = read(f);
    expect(src.includes('loading="lazy"'), `${f} must keep loading="lazy"`).toBe(true);
  });
});

describe('T-M5 hero priority-only-first', () => {
  for (const f of HERO_FILES) {
    it(`${f} prioritizes first slide only (i === 0)`, () => {
      const src = read(f);
      expect(src.includes('i === 0'), `${f} must prioritize first slide via i === 0`).toBe(true);
    });

    it(`${f} does not prioritize active slide`, () => {
      const src = read(f);
      expect(
        src.includes('priority={i === idx}'),
        `${f} must not include priority={i === idx}`
      ).toBe(false);
    });

    it(`${f} keeps sizes 100vw + responsive srcset (no bypass)`, () => {
      const src = read(f);
      expect(src.includes('sizes="100vw"'), `${f} must keep sizes="100vw"`).toBe(true);
      expect(src.includes('unoptimized'), `${f} must not bypass via unoptimized`).toBe(false);
      expect(src.includes('lazy'), `${f} must keep lazy for non-first slides`).toBe(true);
    });

    it(`${f} has at most one priority Image`, () => {
      const src = read(f);
      const count = (src.match(/priority=\{/g) ?? []).length;
      expect(count <= 1, `${f} must have at most one priority={...} (found ${count})`).toBe(true);
    });
  }

  it('next.config.mjs uses custom Supabase-transform loader (CF-safe srcset)', () => {
    const src = read('next.config.mjs');
    expect(src.includes("loader: 'custom'"), 'next.config.mjs must use custom loader').toBe(true);
    expect(src.includes('loaderFile'), 'next.config.mjs must point at loaderFile').toBe(true);
    expect(src.includes('unoptimized: true'), 'global unoptimized must be removed').toBe(false);
  });
});
