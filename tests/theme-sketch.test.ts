import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { getTheme } from '@/lib/themes';

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

function sketchBlock(css: string): string {
  const start = css.indexOf('[data-theme="sketch"]');
  expect(start, 'globals.css must have [data-theme="sketch"] block').toBeGreaterThanOrEqual(0);
  const next = css.indexOf('[data-theme=', start + 1);
  return css.slice(start, next === -1 ? undefined : next);
}

/**
 * T-SKETCH: hand-drawn sketchbook theme (6th theme).
 * Cream paper, graphite ink, pencil-blue brand, vermilion accent,
 * Caveat + Patrick Hand, wobbly offset shadows, SketchHero/Header/Footer.
 */
describe('T-SKETCH: sketch tokens (pencil-blue + vermilion on cream)', () => {
  it('brand pencil-blue #3B5BA9 and accent vermilion #D9480F', () => {
    const sketch = getTheme('sketch');
    expect(sketch.id).toBe('sketch');
    expect(sketch.tokens.brand.toLowerCase()).toBe('#3b5ba9');
    expect(sketch.tokens.accent.toLowerCase()).toBe('#d9480f');
    expect(sketch.tokens.surface.toLowerCase()).toBe('#fbf6e9');
    expect(sketch.tokens.ink.toLowerCase()).toBe('#2a2620');
  });

  it('fonts resolve to Caveat + Patrick Hand vars', () => {
    const sketch = getTheme('sketch');
    expect(sketch.fonts.heading).toContain('--font-caveat');
    expect(sketch.fonts.heading).toMatch(/Caveat/);
    expect(sketch.fonts.body).toContain('--font-patrick');
    expect(sketch.fonts.body).toMatch(/Patrick Hand/);
  });

  it('wobbly offset shadows in graphite + sketch spacing', () => {
    const sketch = getTheme('sketch');
    expect(sketch.shadow.sm).toBe('1px 2px 0 0 #2A2620');
    expect(sketch.shadow.md).toBe('3px 3px 0 0 #2A2620');
    expect(sketch.shadow.lg).toBe('5px 6px 0 0 #2A2620');
    expect(sketch.spacing.container).toBe('70rem');
    expect(sketch.spacing.section).toBe('5rem');
  });

  it('layout routes sketch-notebook / sketch-doodle / sketch-margin', () => {
    const sketch = getTheme('sketch');
    expect(sketch.layout.headerVariant).toBe('sketch-notebook');
    expect(sketch.layout.heroVariant).toBe('sketch-doodle');
    expect(sketch.layout.footerVariant).toBe('sketch-margin');
  });
});

describe('T-SKETCH: globals.css sketch block mirrors tokens', () => {
  it('pencil-blue/vermilion/cream hex present', () => {
    const block = sketchBlock(read('src/app/globals.css'));
    expect(block.toLowerCase()).toContain('#3b5ba9');
    expect(block.toLowerCase()).toContain('#d9480f');
    expect(block.toLowerCase()).toContain('#fbf6e9');
  });

  it('Caveat + Patrick Hand vars wired', () => {
    const block = sketchBlock(read('src/app/globals.css'));
    expect(block).toContain('--font-caveat');
    expect(block).toMatch(/Caveat/);
    expect(block).toContain('--font-patrick');
    expect(block).toMatch(/Patrick Hand/);
  });

  it('offset shadows + wobbly radii + section spacing', () => {
    const block = sketchBlock(read('src/app/globals.css'));
    expect(block).toMatch(/--shadow-sm:\s*1px 2px 0 0 #2A2620/);
    expect(block).toMatch(/--shadow-md:\s*3px 3px 0 0 #2A2620/);
    expect(block).toMatch(/--shadow-lg:\s*5px 6px 0 0 #2A2620/);
    expect(block).toMatch(/--spacing-section:\s*5rem/);
  });
});

describe('T-SKETCH: SketchHero doodle treatment', () => {
  it('routes sketch-doodle -> SketchHero in HeroSwitch', () => {
    const src = read('src/components/hero/HeroSwitch.tsx');
    expect(src).toContain('sketch-doodle');
    expect(src).toContain('SketchHero');
  });

  it('uses var tokens + hand-lettered heading + wobble', () => {
    const src = read('src/components/hero/variants/SketchHero.tsx');
    expect(src).toContain('bg-[var(--surface)]');
    expect(src).toContain('text-[var(--ink)]');
    expect(src).toContain('rounded-[var(--radius-');
    expect(src).toContain('shadow-[var(--shadow-');
    expect(src).toContain('font-heading');
    expect(src).toMatch(/rotate/);
  });

  it('no hardcoded slate/white/rounded bleed', () => {
    const src = read('src/components/hero/variants/SketchHero.tsx');
    expect(src).not.toMatch(/bg-white/);
    expect(src).not.toMatch(/text-slate-/);
    expect(src).not.toMatch(/border-slate-/);
    expect(src).not.toMatch(/rounded-lg[^[]/);
    expect(src).not.toMatch(/rounded-xl/);
  });
});

describe('T-SKETCH: SketchHeader + SketchFooter routing + tokens', () => {
  it('registry routes sketch-notebook -> SketchHeader, sketch-margin -> SketchFooter', () => {
    const registry = read('src/components/layout/variants/registry.ts');
    expect(registry).toContain("'sketch-notebook': SketchHeader");
    expect(registry).toContain("'sketch-margin': SketchFooter");
  });

  it('header + footer use var tokens, no bleed', () => {
    for (const p of [
      'src/components/layout/variants/headers/SketchHeader.tsx',
      'src/components/layout/variants/footers/SketchFooter.tsx',
    ]) {
      const src = read(p);
      expect(src).toContain('rounded-[var(--radius-');
      expect(src).not.toMatch(/bg-white/);
      expect(src).not.toMatch(/text-slate-/);
      expect(src).not.toMatch(/border-slate-/);
      expect(src).not.toMatch(/rounded-lg[^[]/);
      expect(src).not.toMatch(/rounded-xl/);
    }
    // header: light notebook surface + ink; footer: dark band like StackedFooter
    const header = read('src/components/layout/variants/headers/SketchHeader.tsx');
    expect(header).toContain('bg-[var(--surface)]');
    expect(header).toContain('text-[var(--ink)]');
    const footer = read('src/components/layout/variants/footers/SketchFooter.tsx');
    expect(footer).toContain('bg-brand-strong');
    expect(footer).toContain('text-brand-soft');
    expect(footer).toContain('bg-[var(--surface)]/10');
  });
});

describe('T-SKETCH: persistence + admin accept sketch', () => {
  it('settings API validates theme against THEMES registry (incl. sketch)', () => {
    const src = read('src/app/api/settings/route.ts');
    expect(src).toContain('THEMES');
    expect(read('src/lib/themes.ts')).toContain('sketch');
  });

  it('migration 0020 extends the CHECK constraint with sketch', () => {
    const src = read('supabase/migrations/0020_sketch_theme.sql');
    expect(src).toContain('sketch');
    expect(src).toContain('library_settings_active_theme_check');
  });
});
