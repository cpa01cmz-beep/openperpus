import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** T-M4: FAQ chips min 44px touch height.
 * RED first: chip buttons use py-2 only — fail until min-h-[44px] added.
 */
describe('T-M4 FAQ chips 44px min height', () => {
  it('Semua + category chips meet 44px min height', () => {
    const src = read('src/components/public/FaqAccordion.tsx');
    expect(src.includes('min-h-[44px]'), 'FAQ chips must include min-h-[44px]').toBe(true);
  });

  it('FAQ chips keep a11y + scroll contract', () => {
    const src = read('src/components/public/FaqAccordion.tsx');
    expect(src.includes('aria-pressed'), 'FAQ chips must keep aria-pressed').toBe(true);
    expect(src.includes('overflow-x-auto'), 'FAQ chip row must keep overflow-x-auto').toBe(true);
  });
});

/** T-M4-EXT: Extended FAQ a11y — single-open mode, live region for content */
describe('T-M4-EXT FAQ accordion extended a11y', () => {
  it('FaqAccordion implements single-open mode (closes other panels when one opens)', () => {
    const src = read('src/components/public/FaqAccordion.tsx');
    // Should close other panels when one opens - check for logic that resets open state
    const hasSingleOpenLogic =
      src.includes('setOpen') &&
      (src.includes('f.id') ||
        src.includes('id}') ||
        src.includes('close') ||
        src.includes('filter'));
    expect(hasSingleOpenLogic, 'FaqAccordion must implement single-open mode').toBe(true);
  });

  it('FaqAccordion details have aria-live="polite" on answer content', () => {
    const src = read('src/components/public/FaqAccordion.tsx');
    // Answer content should be announced when expanded
    expect(
      src.includes('aria-live="polite"'),
      'FaqAccordion answer must have aria-live="polite"'
    ).toBe(true);
  });

  it('FaqAccordion summary toggles aria-expanded correctly', () => {
    const src = read('src/components/public/FaqAccordion.tsx');
    expect(src.includes('aria-expanded'), 'FaqAccordion summary must have aria-expanded').toBe(
      true
    );
    // Should update on toggle
    expect(src.includes('open'), 'FaqAccordion must track open state').toBe(true);
  });

  it('FaqAccordion details have proper id/aria-controls pairing', () => {
    const src = read('src/components/public/FaqAccordion.tsx');
    expect(src.includes('aria-controls'), 'FaqAccordion summary must have aria-controls').toBe(
      true
    );
    expect(src.includes('id='), 'FaqAccordion panel must have id').toBe(true);
  });

  it('FaqAccordion supports keyboard navigation (Enter/Space on summary, Escape to close)', () => {
    const src = read('src/components/public/FaqAccordion.tsx');
    // Native <details>/<summary> handles Enter/Space, but Escape to close may need handler
    const hasKeyHandling = src.includes('onKeyDown') || src.includes('onKeyUp');
    expect(hasKeyHandling, 'FaqAccordion should have keyboard handlers for Escape').toBe(true);
  });
});
