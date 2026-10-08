import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { getTheme } from '@/lib/themes';

const root = process.cwd();
const heroSrc = fs.readFileSync(
  path.join(root, 'src/components/hero/variants/CenteredHero.tsx'),
  'utf8'
);
const footerSrc = fs.readFileSync(
  path.join(root, 'src/components/layout/variants/footers/ClassicFooter.tsx'),
  'utf8'
);
const cssSrc = fs.readFileSync(path.join(root, 'src/app/globals.css'), 'utf8');

function emeraldBlock(): string {
  const start = cssSrc.indexOf('[data-theme="emerald"]');
  if (start === -1) return '';
  const next = cssSrc.indexOf('[data-theme=', start + 1);
  return cssSrc.slice(start, next === -1 ? undefined : next);
}

/** T-EMERALD: emerald happy path — header/hero/footer tokenized,
 *  Libre Caslon+Franklin, warm-ink tinted shadows. */
describe('T-EMERALD emerald premium polish', () => {
  it('layout registry maps emerald header/hero/footer variants', () => {
    const t = getTheme('emerald');
    expect(t.layout.headerVariant).toBe('emerald-classic');
    expect(t.layout.heroVariant).toBe('emerald-centered');
    expect(t.layout.footerVariant).toBe('emerald-standard');
  });

  it('emerald brand identity kept (#1B5E4B) with surface/ink + section/card spacing', () => {
    const t = getTheme('emerald');
    expect(t.tokens.brand).toBe('#1B5E4B');
    expect(t.tokens.surface).toBe('#EBEDE6');
    expect(t.tokens.ink).toBe('#1C1A17');
    expect(t.spacing.section).toBe('4.5rem');
    expect(t.spacing.card).toBe('1.5rem');
  });

  it('Libre Caslon display + Libre Franklin body vars', () => {
    const t = getTheme('emerald');
    expect(t.fonts.heading).toMatch(/Libre Caslon/);
    expect(t.fonts.heading).toMatch(/--font-libre-caslon/);
    expect(t.fonts.body).toMatch(/Libre Franklin/);
    expect(t.fonts.body).toMatch(/--font-libre-franklin/);
    const css = emeraldBlock();
    expect(css).toMatch(/--font-heading/);
    expect(css).toMatch(/Libre Caslon/);
  });

  it('shadow-md carries warm-ink tint and layered depth', () => {
    const t = getTheme('emerald');
    expect(t.shadow.md).toMatch(/28 26 23/);
    expect(t.shadow.md).toMatch(/,/);
    expect(t.shadow.lg).toMatch(/28 26 23/);
    const css = emeraldBlock();
    expect(css).toMatch(/--shadow-md:.*28 26 23/);
    expect(css).toMatch(/--shadow-md:.*,.*;/);
  });

  it('CenteredHero renders var(--surface)/var(--ink)/radius-lg with shadow depth', () => {
    expect(heroSrc).toContain('bg-[var(--surface)]');
    expect(heroSrc).toContain('text-[var(--ink)]');
    expect(heroSrc).toContain('rounded-[var(--radius-lg)]');
    expect(heroSrc).toContain('shadow-[var(--shadow-');
    expect(heroSrc).toContain('font-heading');
  });

  it('ClassicFooter renders var(--surface)/var(--ink)/radius-lg with shadow depth', () => {
    expect(footerSrc).toContain('bg-[var(--surface)]');
    expect(footerSrc).toContain('text-[var(--ink)]');
    expect(footerSrc).toContain('rounded-[var(--radius-lg)]');
    expect(footerSrc).toContain('shadow-[var(--shadow-');
  });

  it('emerald variants use var(--*) — no hardcoded slate/white', () => {
    for (const src of [heroSrc, footerSrc]) {
      expect(src).not.toMatch(/bg-white/);
      expect(src).not.toMatch(/text-slate-/);
      expect(src).not.toMatch(/border-slate-/);
      expect(src).not.toMatch(/bg-slate-/);
      expect(src).not.toMatch(/rounded-lg[^[]/);
      expect(src).not.toMatch(/rounded-xl/);
    }
  });

  it('[data-theme=emerald] block exposes surface/ink/radius/shadow tokens', () => {
    const css = emeraldBlock();
    expect(css).toContain('--surface: #EBEDE6');
    expect(css).toContain('--ink: #1C1A17');
    expect(css).toContain('--radius-lg: 0.5rem');
    expect(css).toContain('--brand: #1B5E4B');
  });
});
