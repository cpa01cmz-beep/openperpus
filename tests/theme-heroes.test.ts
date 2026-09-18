import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const legacySrc = fs.readFileSync(path.join(root, 'src/components/public/Hero.tsx'), 'utf8');
const fallbackSrc = fs.readFileSync(
  path.join(root, 'src/components/hero/variants/HeroFallback.tsx'),
  'utf8',
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
