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
