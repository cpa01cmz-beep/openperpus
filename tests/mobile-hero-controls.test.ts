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

/** T-M2-EXT: Extended a11y — keyboard nav, aria-busy, role=tabpanel */
describe('T-M2-EXT hero carousel extended a11y', () => {
  for (const f of FILES) {
    it(`${f} has role=tabpanel on each carousel panel`, () => {
      const src = read(f);
      // Each image/content panel should have role="tabpanel" with aria-labelledby pointing to its tab
      expect(src.includes('role="tabpanel"'), `${f} must have role=tabpanel on panels`).toBe(true);
    });

    it(`${f} implements keyboard navigation (ArrowLeft/ArrowRight) on tabs`, () => {
      const src = read(f);
      // Should have onKeyDown handler on tabs or tablist for arrow key navigation
      const hasKeyDown = src.includes('onKeyDown') || src.includes('onKeyDown');
      expect(hasKeyDown, `${f} must have keyboard navigation handler (onKeyDown)`).toBe(true);
    });

    it(`${f} sets aria-busy during slide transition`, () => {
      const src = read(f);
      // Should have aria-busy on the carousel section or container during transition
      expect(src.includes('aria-busy'), `${f} must have aria-busy for transitions`).toBe(true);
    });

    it(`${f} tabs have aria-controls linking to tabpanel`, () => {
      const src = read(f);
      // Each tab should have aria-controls pointing to its tabpanel id
      expect(src.includes('aria-controls'), `${f} tabs must have aria-controls`).toBe(true);
    });

    it(`${f} tabpanel has aria-labelledby linking back to tab`, () => {
      const src = read(f);
      // Each tabpanel should have aria-labelledby pointing to its tab id
      expect(src.includes('aria-labelledby'), `${f} tabpanels must have aria-labelledby`).toBe(
        true
      );
    });
  }
});
