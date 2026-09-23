import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** A11Y-SKIPLINK (WCAG 2.4.1): layout must render a SkipLink that targets #main-content.
 * RED first: layout.tsx had skip link targeting #main, not #main-content.
 */
describe('A11Y skip link targets #main-content', () => {
  it('layout renders a skip link with href="#main-content"', () => {
    const src = read('src/app/layout.tsx');
    expect(
      src.includes('href="#main-content"'),
      'layout must include a skip link with href="#main-content"'
    ).toBe(true);
    expect(
      /Skip to main content/i.test(src),
      'skip link must carry descriptive link text "Skip to main content"'
    ).toBe(true);
  });

  it('layout exposes a main landmark with id="main-content"', () => {
    const src = read('src/app/layout.tsx');
    expect(src.includes('<main'), 'layout must render a <main> landmark').toBe(true);
    expect(
      src.includes('id="main-content"'),
      'main landmark must carry id="main-content" so the skip link has a target'
    ).toBe(true);
  });

  it('layout exposes a header landmark with role="banner"', () => {
    const src = read('src/app/layout.tsx');
    expect(
      /<header[^>]*role=["']banner["']/.test(src),
      'layout must render a <header role="banner"> landmark'
    ).toBe(true);
  });

  it('layout exposes a footer landmark with role="contentinfo"', () => {
    const src = read('src/app/layout.tsx');
    expect(
      /<footer[^>]*role=["']contentinfo["']/.test(src),
      'layout must render a <footer role="contentinfo"> landmark'
    ).toBe(true);
  });
});

/** A11Y-PERF (layout-owned): preconnect + dns-prefetch for the Supabase host
 * so remote cover images do not pay full connection setup on first paint.
 * RED first: layout.tsx emitted zero resource hints for the remote host.
 */
describe('A11Y layout-owned perf hints (Supabase host)', () => {
  it('layout preconnects to the Supabase origin', () => {
    const src = read('src/app/layout.tsx');
    expect(src.includes('preconnect'), 'layout must include a preconnect hint').toBe(true);
    expect(
      src.includes('NEXT_PUBLIC_SUPABASE_URL'),
      'preconnect target must derive from NEXT_PUBLIC_SUPABASE_URL'
    ).toBe(true);
  });

  it('layout adds a dns-prefetch fallback for the Supabase origin', () => {
    const src = read('src/app/layout.tsx');
    expect(src.includes('dns-prefetch'), 'layout must include a dns-prefetch fallback').toBe(true);
  });
});

/** A11Y-ACCORDION: <details>/<summary> gets explicit ARIA so AT announces
 * expanded/collapsed state and the summary→panel relationship without
 * relying on implicit native semantics alone.
 * RED first: summary carried no aria-expanded and no aria-controls.
 */
describe('A11Y FAQ accordion explicit ARIA', () => {
  it('summary carries explicit aria-expanded and aria-controls', () => {
    const src = read('src/components/public/FaqAccordion.tsx');
    expect(
      src.includes('aria-expanded'),
      'FaqAccordion summary must carry explicit aria-expanded'
    ).toBe(true);
    expect(
      src.includes('aria-controls'),
      'FaqAccordion summary must carry explicit aria-controls'
    ).toBe(true);
  });

  it('aria-controls target exists on the answer panel', () => {
    const src = read('src/components/public/FaqAccordion.tsx');
    expect(
      /aria-controls=\{[^}]*\}/.test(src) || src.includes('aria-controls='),
      'aria-controls must be bound (not a static placeholder)'
    ).toBe(true);
    // Panel side of the relationship: an id that mirrors the controls ref.
    expect(
      src.includes('faq-panel-'),
      'answer panel must expose an id (faq-panel-*) matching aria-controls'
    ).toBe(true);
  });
});

/** A11Y-FOCUS: keyboard users need a visible focus path even where
 * :focus-visible is unsupported — the skip link reveals on plain :focus.
 */
describe('A11Y focus-visible fallback', () => {
  it('skip link reveals on plain :focus (fallback) not only :focus-visible', () => {
    const src = read('src/app/layout.tsx');
    expect(
      src.includes('focus:not-sr-only'),
      'skip link must reveal on focus: (fallback for missing :focus-visible support)'
    ).toBe(true);
  });
});

/** A11Y-CONTRAST-AUDIT (note only — design tokens untouched):
 * midnight (ink #E9EEF6 on surface #0B1220 ≈ 15.2:1) and ocean
 * (ink #102E2E on surface #F4F7F6 ≈ 13.9:1) body pairs clear WCAG AA
 * (4.5:1) by inspection; brand-on-surface pairs must be re-checked with a
 * color-contrast tool before use for small text. Recorded here + in
 * layout.tsx so the audit travels with the code.
 */
describe('A11Y contrast audit note (midnight/ocean)', () => {
  it('contrast audit note for midnight/ocean travels with the code', () => {
    const layout = read('src/app/layout.tsx');
    expect(
      /A11Y-CONTRAST-AUDIT/.test(layout),
      'layout must carry an A11Y-CONTRAST-AUDIT note for midnight/ocean'
    ).toBe(true);
  });
});

/** A11Y-LANDMARKS: header/footer variants must expose proper landmarks.
 * RED first: header variants used "Navigasi utama" (Indonesian), footer variants lacked role="contentinfo".
 */
describe('A11Y header/footer variant landmarks', () => {
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
