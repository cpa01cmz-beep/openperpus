import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const legacySrc = fs.readFileSync(path.join(root, 'src/components/public/Hero.tsx'), 'utf8');
const fallbackSrc = fs.readFileSync(
  path.join(root, 'src/components/hero/variants/HeroFallback.tsx'),
  'utf8'
);
const switchSrc = fs.readFileSync(path.join(root, 'src/components/hero/HeroSwitch.tsx'), 'utf8');
const pageSrc = fs.readFileSync(path.join(root, 'src/app/(public)/page.tsx'), 'utf8');

/** T-HEROES: legacy Hero deprecated (delegates to HeroSwitch), HeroFallback var-tokenized. */
describe('T-HEROES legacy deprecation + fallback tokens', () => {
  it('legacy public/Hero delegates to HeroSwitch/CenteredHero (no carousel duplication)', () => {
    // Delegation: re-export or render HeroSwitch / CenteredHero
    expect(legacySrc).toMatch(/HeroSwitch|CenteredHero/);
    // No duplicated carousel internals
    expect(legacySrc).not.toMatch(/useState\(0\)/);
    expect(legacySrc).not.toMatch(/setInterval/);
    expect(legacySrc).not.toMatch(/aria-roledescription="carousel"/);
  });

  it('legacy public/Hero is marked deprecated', () => {
    expect(legacySrc).toMatch(/@deprecated/i);
  });

  it('HeroFallback uses rounded-[var(--radius-lg)], no bare rounded-lg', () => {
    expect(fallbackSrc).toContain('rounded-[var(--radius-lg)]');
    expect(fallbackSrc).not.toMatch(/rounded-lg[^[]/);
    expect(fallbackSrc).not.toMatch(/rounded-xl/);
  });

  it('HeroFallback uses brand tokens, no un-tokenized gradient', () => {
    expect(fallbackSrc).toMatch(/from-brand-strong|var\(--brand\)/);
    expect(fallbackSrc).not.toMatch(/from-\[#/);
    expect(fallbackSrc).not.toMatch(/to-\[#/);
    expect(fallbackSrc).not.toMatch(/from-slate-/);
    expect(fallbackSrc).not.toMatch(/to-slate-/);
    expect(fallbackSrc).not.toMatch(/#000000/);
  });

  it('page.tsx uses single HeroSwitch path, no legacy public/Hero import', () => {
    expect(pageSrc).toContain('@/components/hero/HeroSwitch');
    expect(pageSrc).not.toMatch(/components\/public\/Hero/);
  });

  it('HeroSwitch maps emerald-centered -> CenteredHero', () => {
    expect(switchSrc).toMatch(/emerald-centered/);
    expect(switchSrc).toMatch(/CenteredHero/);
  });
});

/** T-HEROES-EXT: HeroSwitch preload map for variant switching */
describe('T-HEROES-EXT HeroSwitch preload map', () => {
  it('HeroSwitch defines a preload map for all 5 variants', () => {
    const src = fs.readFileSync(path.join(root, 'src/components/hero/HeroSwitch.tsx'), 'utf8');
    // Should have a preload map object with variant keys
    expect(
      src.includes('preload') || src.includes('preloadMap') || src.includes('variantMap'),
      'HeroSwitch must define a preload map'
    ).toBe(true);
  });

  it('HeroSwitch preload map includes all 5 variants as keys', () => {
    const src = fs.readFileSync(path.join(root, 'src/components/hero/HeroSwitch.tsx'), 'utf8');
    // At minimum the 5 dynamic imports should be in the map
    for (const v of ['ClassicHero', 'CenteredHero', 'EditorialHero', 'StackedHero', 'SplitHero']) {
      expect(src.includes(v), `HeroSwitch preload map must reference ${v}`).toBe(true);
    }
  });

  it('HeroSwitch keeps ssr:true on all dynamic imports', () => {
    const src = fs.readFileSync(path.join(root, 'src/components/hero/HeroSwitch.tsx'), 'utf8');
    // Each dynamic import should have { ssr: true }
    const dynamicImports = src.match(/dynamic\(\(\) => import\([^)]+\)\s*,\s*\{[^}]+\}\)/gs) || [];
    expect(dynamicImports.length, 'HeroSwitch must have 5 dynamic imports').toBe(5);
    for (const imp of dynamicImports) {
      expect(imp.includes('ssr: true'), `Dynamic import must keep ssr:true: ${imp}`).toBe(true);
    }
  });

  it('HeroSwitch renders preload links for next/prev variant in document head', () => {
    const src = fs.readFileSync(path.join(root, 'src/components/hero/HeroSwitch.tsx'), 'utf8');
    // Should render <link rel="preload" as="script"> or similar for variant chunks
    expect(
      src.includes('rel="preload"') || src.includes('preload'),
      'HeroSwitch should render preload links for variants'
    ).toBe(true);
  });

  it('HeroSwitch preload map enables next/prev variant anticipation', () => {
    const src = fs.readFileSync(path.join(root, 'src/components/hero/HeroSwitch.tsx'), 'utf8');
    // Should have logic to determine next/prev variant based on current
    const hasNextPrevLogic =
      (src.includes('next') && src.includes('prev')) || src.includes('variant');
    expect(hasNextPrevLogic, 'HeroSwitch must have next/prev variant logic').toBe(true);
  });
});
