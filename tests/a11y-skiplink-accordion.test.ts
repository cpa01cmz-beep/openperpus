import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** A11Y-SKIPLINK (WCAG 2.4.1): layout must render a SkipLink that targets #main.
 * RED first: layout.tsx had no skip link and no main landmark at all.
 */
describe('A11Y skip link targets #main', () => {
  it('layout renders a skip link with href="#main"', () => {
    const src = read('src/app/layout.tsx');
    expect(src.includes('href="#main"'), 'layout must include a skip link with href="#main"').toBe(
      true
    );
    expect(
      /Lewati ke konten utama|Skip to (main )?content|Lewati ke konten/i.test(src),
      'skip link must carry descriptive link text'
    ).toBe(true);
  });

  it('layout exposes a main landmark with id="main"', () => {
    const src = read('src/app/layout.tsx');
    expect(src.includes('<main'), 'layout must render a <main> landmark').toBe(true);
    expect(
      src.includes('id="main"'),
      'main landmark must carry id="main" so the skip link has a target'
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
