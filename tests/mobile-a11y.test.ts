import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** S-mobile: 44px touch targets + sticky first-col + explicit viewport.
 * RED first: small targets (h-9/h-10, py-2 chips) fail until bumped to
 * min-h-[44px] min-w-[44px]; DataTable scroll-only fails until sticky
 * left-0 first-col; layout fails until viewport width/device-width set.
 */
describe('S-mobile touch targets min 44px', () => {
  it('CategoryChips buttons meet 44px min height', () => {
    const src = read('src/components/public/CategoryChips.tsx');
    expect(src.includes('min-h-[44px]'), 'CategoryChips chips must include min-h-[44px]').toBe(
      true
    );
  });

  it('header mobile toggles meet 44px min size', () => {
    const files = [
      'src/components/layout/variants/headers/ClassicHeader.tsx',
      'src/components/layout/variants/headers/CenteredHeader.tsx',
      'src/components/layout/variants/headers/SplitHeader.tsx',
      'src/components/layout/variants/headers/MinimalHeader.tsx',
      'src/components/layout/variants/headers/TopBarHeader.tsx',
    ];
    for (const f of files) {
      const src = read(f);
      expect(src.includes('min-h-[44px]'), `${f} toggle must include min-h-[44px]`).toBe(true);
      expect(src.includes('min-w-[44px]'), `${f} toggle must include min-w-[44px]`).toBe(true);
    }
  });

  it('CatalogExplorer pagination + reset + sort meet 44px min height', () => {
    const src = read('src/components/public/CatalogExplorer.tsx');
    expect(src.includes('min-h-[44px]'), 'CatalogExplorer controls must include min-h-[44px]').toBe(
      true
    );
  });
});

describe('S-mobile table sticky first-col', () => {
  it('DataTable keeps scroll wrapper + sticky left-0 first column', () => {
    const src = read('src/components/admin/DataTable.tsx');
    expect(src.includes('overflow-x-auto'), 'DataTable must keep overflow-x-auto wrapper').toBe(
      true
    );
    expect(src.includes('sticky'), 'DataTable first-col must be sticky').toBe(true);
    expect(src.includes('left-0'), 'DataTable first-col must include left-0').toBe(true);
  });
});

describe('S-mobile explicit viewport', () => {
  it('root layout exports viewport with width=device-width + initialScale', () => {
    const src = read('src/app/layout.tsx');
    expect(src.includes('device-width'), 'layout viewport must include width=device-width').toBe(
      true
    );
    expect(src.includes('initialScale'), 'layout viewport must include initialScale').toBe(true);
  });
});

describe('S-mobile 360px no page-level horizontal scroll', () => {
  it('chips scroll inside their own container, catalog grid fits 2 cols at 360px', () => {
    const chips = read('src/components/public/CategoryChips.tsx');
    expect(chips.includes('overflow-x-auto'), 'CategoryChips must scroll internally').toBe(true);
    const explorer = read('src/components/public/CatalogExplorer.tsx');
    expect(
      explorer.includes('grid-cols-2'),
      'CatalogExplorer grid must start at 2 cols for 360px'
    ).toBe(true);
  });

  it('table inner scroll is the only wide min-width allowance', () => {
    const table = read('src/components/admin/DataTable.tsx');
    expect(
      table.includes('min-w-[640px]'),
      'DataTable inner table keeps min width inside scroll wrapper'
    ).toBe(true);
    const chips = read('src/components/public/CategoryChips.tsx');
    expect(
      /min-w-\[\d+px\]/.test(chips),
      'CategoryChips must not introduce fixed wide min-width'
    ).toBe(false);
  });
});

/** S-mobile-landmarks: header/footer variants must expose proper ARIA landmarks
 * for mobile screen readers. RED first: header variants used Indonesian aria-label,
 * footer variants lacked role="contentinfo".
 */
describe('S-mobile header/footer landmarks', () => {
  const headerVariants = [
    'src/components/layout/variants/headers/ClassicHeader.tsx',
    'src/components/layout/variants/headers/CenteredHeader.tsx',
    'src/components/layout/variants/headers/SplitHeader.tsx',
    'src/components/layout/variants/headers/MinimalHeader.tsx',
    'src/components/layout/variants/headers/TopBarHeader.tsx',
  ];

  const footerVariants = [
    'src/components/layout/variants/footers/ClassicFooter.tsx',
    'src/components/layout/variants/footers/MinimalFooter.tsx',
    'src/components/layout/variants/footers/StackedFooter.tsx',
  ];

  it('all header variants use aria-label="Main navigation" (English)', () => {
    for (const f of headerVariants) {
      const src = read(f);
      expect(
        src.includes('aria-label="Main navigation"'),
        `${f} must use aria-label="Main navigation" on <nav>`
      ).toBe(true);
    }
  });

  it('all footer variants have role="contentinfo" on <footer>', () => {
    for (const f of footerVariants) {
      const src = read(f);
      expect(
        /<footer[^>]*role=["']contentinfo["']/.test(src),
        `${f} must have role="contentinfo" on <footer>`
      ).toBe(true);
    }
  });
});
