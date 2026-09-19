import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** T-M1: Pagination touch targets min 44px (WCAG 2.5.8).
 * RED first: baseBtn uses h-10/min-w-10 (40px) — fails until bumped to
 * min-h-[44px] min-w-[44px].
 */
describe('T-M1 pagination touch targets 44px', () => {
  it('Pagination baseBtn meets 44px min height + width', () => {
    const src = read('src/components/ui/Pagination.tsx');
    expect(src.includes('min-h-[44px]'), 'Pagination baseBtn must include min-h-[44px]').toBe(true);
    expect(src.includes('min-w-[44px]'), 'Pagination baseBtn must include min-w-[44px]').toBe(true);
  });

  it('Pagination baseBtn has no sub-44px fixed size', () => {
    const src = read('src/components/ui/Pagination.tsx');
    expect(src.includes('h-10'), 'Pagination baseBtn must not include h-10').toBe(false);
    expect(src.includes('min-w-10'), 'Pagination baseBtn must not include min-w-10').toBe(false);
  });
});
