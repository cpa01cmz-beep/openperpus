import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const FILES = [
  'src/components/hero/variants/CenteredHero.tsx',
  'src/components/hero/variants/ClassicHero.tsx',
  'src/components/hero/variants/StackedHero.tsx',
  'src/components/hero/variants/SplitHero.tsx',
  'src/components/hero/variants/EditorialHero.tsx',
];

/** T-M2: Hero carousel controls/dots 44px hit-area (WCAG 2.5.8, Mobile 88 gap).
 * RED first: controls use bare h-9 w-9 (36px), dots are h-1.5/h-2 thin strips.
 */
describe('T-M2 hero carousel controls/dots 44px hit-area', () => {
  for (const f of FILES) {
    it(`${f} controls meet 44px min height + width`, () => {
      const src = read(f);
      expect(src.includes('min-h-[44px]'), `${f} controls must include min-h-[44px]`).toBe(true);
      expect(src.includes('min-w-[44px]'), `${f} controls must include min-w-[44px]`).toBe(true);
    });

    it(`${f} has no bare sub-44px h-9 w-9 controls`, () => {
      const src = read(f);
      expect(src.includes('h-9 w-9'), `${f} must not include bare h-9 w-9`).toBe(false);
    });

    it(`${f} dots have 44px hit-area wrapper`, () => {
      const src = read(f);
      const parts = src.split('role="tab"');
      expect(parts.length > 1, `${f} must keep role=tab dots`).toBe(true);
      // every dot template after role="tab" (single mapped template) must carry 44px hit-area
      for (const part of parts.slice(1)) {
        const window = part.slice(0, 900);
        expect(
          window.includes('min-h-[44px]'),
          `${f} dots button must include min-h-[44px] hit-area wrapper`
        ).toBe(true);
      }
    });

    it(`${f} preserves carousel aria`, () => {
      const src = read(f);
      expect(src.includes('role="tablist"'), `${f} must keep role=tablist`).toBe(true);
      expect(src.includes('role="tab"'), `${f} must keep role=tab`).toBe(true);
      expect(src.includes('aria-selected'), `${f} must keep aria-selected`).toBe(true);
      expect(src.includes('aria-label'), `${f} must keep aria-label`).toBe(true);
    });
  }
});
