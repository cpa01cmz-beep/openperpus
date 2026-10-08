import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { THEMES } from '../src/lib/themes';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const themeBlock = (css: string, id: string) => {
  const m = css.match(new RegExp(`\\[data-theme="${id}"\\]\\s*\\{([\\s\\S]*?)\\}`));
  return m ? m[1]! : '';
};

/** T-MIDNIGHT (S1+S2): midnight luxury-dark polish.
 * Midnight tree = ClassicHero (midnight-showcase) + themes.ts midnight
 * block + globals.css [data-theme=midnight] block.
 * Header (midnight-slim->MinimalHeader, clean) and footer
 * (midnight-extended->StackedFooter, other task) are out of scope.
 */
describe('T-MIDNIGHT midnight luxury-dark', () => {
  const HERO = 'src/components/hero/variants/ClassicHero.tsx';

  it('ClassicHero has no bg-white bleed', () => {
    const src = read(HERO);
    expect(src.includes('bg-white'), 'ClassicHero must not contain bg-white').toBe(false);
  });

  it('ClassicHero has no text-slate-* bleed', () => {
    const src = read(HERO);
    expect(/text-slate-\d/.test(src), 'ClassicHero must not contain text-slate-*').toBe(false);
  });

  it('ClassicHero has no bg-slate-50 bleed', () => {
    const src = read(HERO);
    expect(src.includes('bg-slate-50'), 'ClassicHero must not contain bg-slate-50').toBe(false);
  });

  it('ClassicHero has no hardcoded rounded-lg/xl (uses radius vars)', () => {
    const src = read(HERO);
    expect(src.includes('rounded-lg'), 'ClassicHero must use rounded-[var(--radius-lg)]').toBe(
      false
    );
    expect(src.includes('rounded-xl'), 'ClassicHero must not contain rounded-xl').toBe(false);
  });

  it('ClassicHero is tokenized on navy surface + ink', () => {
    const src = read(HERO);
    expect(
      src.includes('bg-[var(--surface)]'),
      'ClassicHero must use bg-[var(--surface)] (#14110D)'
    ).toBe(true);
    expect(src.includes('text-[var(--ink)]'), 'ClassicHero must use text-[var(--ink)]').toBe(true);
    expect(
      src.includes('rounded-[var(--radius-lg)]'),
      'ClassicHero must use rounded-[var(--radius-lg)]'
    ).toBe(true);
  });

  it('ClassicHero carries vermilion accent + font-heading display + deep shadow', () => {
    const src = read(HERO);
    const hasAccent =
      src.includes('border-accent') ||
      src.includes('bg-accent') ||
      src.includes('text-accent') ||
      src.includes('#E4573D');
    expect(hasAccent, 'ClassicHero must carry accent (#E4573D)').toBe(true);
    expect(src.includes('font-heading'), 'ClassicHero must use font-heading').toBe(true);
    expect(
      src.includes('shadow-[var(--shadow-'),
      'ClassicHero must use deep black shadow var'
    ).toBe(true);
  });

  it('themes.ts midnight: surface #14110D, accent #E4573D, Bodoni var', () => {
    const midnight = THEMES['midnight'];
    expect(midnight, 'themes.ts must define midnight').toBeDefined();
    const tokens = midnight!.tokens as Record<string, string>;
    expect(tokens['surface']?.toLowerCase()).toBe('#14110d');
    expect(tokens['accent']?.toLowerCase()).toBe('#e4573d');
    expect(
      midnight!.fonts.heading.includes('var(--font-bodoni)'),
      'midnight heading must use var(--font-bodoni)'
    ).toBe(true);
    expect(midnight!.fonts.heading.includes('Bodoni'), 'midnight heading must name Bodoni').toBe(
      true
    );
  });

  it('globals.css [data-theme=midnight]: surface, accent, Bodoni plumbing', () => {
    const css = read('src/app/globals.css');
    const block = themeBlock(css, 'midnight');
    expect(block.length > 0, 'globals.css must keep [data-theme=midnight] block').toBe(true);
    expect(block.includes('--surface: #14110D'), 'midnight block must set --surface: #14110D').toBe(
      true
    );
    expect(block.includes('--accent: #E4573D'), 'midnight block must set --accent: #E4573D').toBe(
      true
    );
    expect(block.includes('var(--font-bodoni)'), 'midnight block must wire Bodoni var').toBe(true);
  });

  it('midnight layout routes heroVariant midnight-showcase -> ClassicHero', () => {
    const midnight = THEMES['midnight'];
    expect(midnight!.layout.heroVariant).toBe('midnight-showcase');
    const heroSwitch = read('src/components/hero/HeroSwitch.tsx');
    expect(heroSwitch.includes('midnight-showcase'), 'HeroSwitch must map midnight-showcase').toBe(
      true
    );
    expect(heroSwitch.includes('ClassicHero'), 'HeroSwitch must render ClassicHero').toBe(true);
  });
});
