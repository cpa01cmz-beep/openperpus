import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { getTheme } from '@/lib/themes';

/**
 * T-OCEAN (S1): Ocean airy editorial polish.
 * - Fraunces + Inter vars, teal #0E6E6B / coral #FF6B4A
 * - radius-lg 2rem as rounded-[var(--radius-lg)]
 * - wide editorial scale, airy treatment
 */

const SPLIT_HERO = path.resolve(process.cwd(), 'src/components/hero/variants/SplitHero.tsx');
const TOP_BAR = path.resolve(
  process.cwd(),
  'src/components/layout/variants/headers/TopBarHeader.tsx',
);
const GLOBALS = path.resolve(process.cwd(), 'src/app/globals.css');

function read(p: string): string {
  return fs.readFileSync(p, 'utf8');
}

function oceanBlock(css: string): string {
  const start = css.indexOf('[data-theme="ocean"]');
  expect(start, 'globals.css must have [data-theme="ocean"] block').toBeGreaterThanOrEqual(0);
  const end = css.indexOf('}', css.indexOf('--spacing-card', start));
  return css.slice(start, end + 1);
}

describe('T-OCEAN: ocean tokens (teal authority + coral warmth)', () => {
  it('brand teal #0E6E6B and accent coral #FF6B4A', () => {
    const ocean = getTheme('ocean');
    const tokens = ocean.tokens as Record<string, string>;
    expect(tokens['brand']?.toLowerCase()).toBe('#0e6e6b');
    expect(tokens['accent']?.toLowerCase()).toBe('#ff6b4a');
  });

  it('fonts resolve to Fraunces + Inter vars', () => {
    const ocean = getTheme('ocean');
    expect(ocean.fonts.heading).toContain('--font-fraunces');
    expect(ocean.fonts.heading).toMatch(/Fraunces/);
    expect(ocean.fonts.body).toContain('--font-inter');
    expect(ocean.fonts.body).toMatch(/Inter/);
  });

  it('airy radius scale .75 / 1.25 / 2rem and section 4.75rem', () => {
    const ocean = getTheme('ocean');
    expect(ocean.radius.sm).toBe('0.75rem');
    expect(ocean.radius.md).toBe('1.25rem');
    expect(ocean.radius.lg).toBe('2rem');
    expect(ocean.spacing.section).toBe('4.75rem');
    expect(ocean.spacing.container).toBe('74rem');
  });
});

describe('T-OCEAN: globals.css ocean block mirrors tokens', () => {
  it('teal/coral hex present', () => {
    const block = oceanBlock(read(GLOBALS));
    expect(block.toLowerCase()).toContain('#0e6e6b');
    expect(block.toLowerCase()).toContain('#ff6b4a');
  });

  it('Fraunces + Inter vars wired', () => {
    const block = oceanBlock(read(GLOBALS));
    expect(block).toContain('--font-fraunces');
    expect(block).toMatch(/Fraunces/);
    expect(block).toContain('--font-inter');
    expect(block).toMatch(/Inter/);
  });

  it('airy radii + section spacing', () => {
    const block = oceanBlock(read(GLOBALS));
    expect(block).toMatch(/--radius-sm:\s*0\.75rem/);
    expect(block).toMatch(/--radius-md:\s*1\.25rem/);
    expect(block).toMatch(/--radius-lg:\s*2rem/);
    expect(block).toMatch(/--spacing-section:\s*4\.75rem/);
  });
});

describe('T-OCEAN: SplitHero ocean-tide airy editorial', () => {
  it('teal block + coral CTA + radius-lg var', () => {
    const src = read(SPLIT_HERO);
    expect(src, 'SplitHero must render teal block (bg-brand-strong)').toContain('bg-brand-strong');
    expect(src, 'SplitHero must render coral CTA (bg-accent)').toContain('bg-accent');
    expect(src, 'SplitHero must use radius-lg var').toContain('rounded-[var(--radius-lg)]');
  });

  it('Fraunces heading with wide editorial tracking + wide scale', () => {
    const src = read(SPLIT_HERO);
    expect(src, 'SplitHero must use font-heading (Fraunces)').toContain('font-heading');
    expect(src, 'SplitHero must use wide tracking for editorial eyebrow/heading').toMatch(
      /tracking-\[0\.1[89]em\]|tracking-\[0\.2\d?em\]|tracking-wide|tracking-widest/,
    );
    // Wide editorial scale: must reach 5xl at some breakpoint, not stop at 4xl.
    expect(src, 'SplitHero heading must hit wide editorial scale (text-5xl)').toMatch(/text-5xl/);
  });
});

describe('T-OCEAN: TopBarHeader ocean-wave airy editorial', () => {
  it('teal block + coral CTA + radius-lg var', () => {
    const src = read(TOP_BAR);
    expect(src, 'TopBarHeader must render teal block (bg-brand-strong)').toContain(
      'bg-brand-strong',
    );
    expect(src, 'TopBarHeader CTA must be coral (bg-accent)').toContain('bg-accent');
    expect(src, 'TopBarHeader must use radius-lg var').toContain('rounded-[var(--radius-lg)]');
  });

  it('Fraunces wordmark with editorial presence', () => {
    const src = read(TOP_BAR);
    expect(src, 'TopBarHeader must use font-heading (Fraunces)').toContain('font-heading');
    expect(src, 'TopBarHeader must use editorial tracking').toMatch(
      /tracking-|tracking-wide|tracking-tight/,
    );
  });
});
