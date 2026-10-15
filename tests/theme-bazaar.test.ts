import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { getTheme } from '@/lib/themes';

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

function bazaarBlock(css: string): string {
  const start = css.search(/\[data-theme=["']bazaar["']\]/);
  expect(start, 'globals.css must have [data-theme="bazaar"] block').toBeGreaterThanOrEqual(0);
  const next = css.indexOf('[data-theme=', start + 1);
  return css.slice(start, next === -1 ? undefined : next);
}

/**
 * T-BAZAAR: Shopee-style marketplace theme (7th theme).
 * Warm paper shelf, ink borders, deep-red brand with Shopee-orange accent,
 * Space Grotesk + Inter, hard offset shadows, BazaarHero/Header/Footer.
 */
describe('T-BAZAAR: bazaar tokens (deep-red + Shopee-orange on paper)', () => {
  it('brand deep-red #B23A1C and accent Shopee-orange #EE4D2D', () => {
    const bazaar = getTheme('bazaar');
    expect(bazaar.id).toBe('bazaar');
    expect(bazaar.tokens.brand.toLowerCase()).toBe('#b23a1c');
    expect(bazaar.tokens.accent.toLowerCase()).toBe('#ee4d2d');
    expect(bazaar.tokens.surface.toLowerCase()).toBe('#faf5ea');
    expect(bazaar.tokens.ink.toLowerCase()).toBe('#26211b');
  });

  it('fonts resolve to Space Grotesk + Inter vars', () => {
    const bazaar = getTheme('bazaar');
    expect(bazaar.fonts.heading).toContain('--font-space');
    expect(bazaar.fonts.heading).toMatch(/Space Grotesk/);
    expect(bazaar.fonts.body).toContain('--font-inter');
    expect(bazaar.fonts.body).toMatch(/Inter/);
  });

  it('hard offset shadows + bazaar spacing', () => {
    const bazaar = getTheme('bazaar');
    expect(bazaar.shadow.sm).toBe('0 2px 0 0 #26211B');
    expect(bazaar.shadow.md).toBe('0 4px 0 0 #26211B');
    expect(bazaar.spacing.container).toBe('70rem');
    expect(bazaar.spacing.section).toBe('4rem');
  });

  it('layout routes bazaar-commerce / bazaar-promo / bazaar-market', () => {
    const bazaar = getTheme('bazaar');
    expect(bazaar.layout.headerVariant).toBe('bazaar-commerce');
    expect(bazaar.layout.heroVariant).toBe('bazaar-promo');
    expect(bazaar.layout.footerVariant).toBe('bazaar-market');
  });
});

describe('T-BAZAAR: globals.css bazaar block mirrors tokens', () => {
  it('deep-red/Shopee-orange/paper hex present', () => {
    const block = bazaarBlock(read('src/app/globals.css'));
    expect(block.toLowerCase()).toContain('#b23a1c');
    expect(block.toLowerCase()).toContain('#ee4d2d');
    expect(block.toLowerCase()).toContain('#faf5ea');
  });

  it('Space Grotesk + Inter vars wired', () => {
    const block = bazaarBlock(read('src/app/globals.css'));
    expect(block).toContain('--font-space');
    expect(block).toMatch(/Space Grotesk/);
    expect(block).toContain('--font-inter');
    expect(block).toMatch(/Inter/);
  });

  it('hard shadows + commerce radii + section spacing', () => {
    const block = bazaarBlock(read('src/app/globals.css'));
    expect(block).toMatch(/--shadow-sm:\s*0 2px 0 0 #26211B/i);
    expect(block).toMatch(/--shadow-md:\s*0 4px 0 0 #26211B/i);
    expect(block).toMatch(/--spacing-section:\s*4rem/);
  });
});

describe('T-BAZAAR: BazaarHero promo treatment', () => {
  it('routes bazaar-promo -> BazaarHero in HeroSwitch', () => {
    const src = read('src/components/hero/HeroSwitch.tsx');
    expect(src).toContain('bazaar-promo');
    expect(src).toContain('BazaarHero');
  });

  it('uses var tokens + uppercase display heading + hard shadow', () => {
    const src = read('src/components/hero/variants/BazaarHero.tsx');
    expect(src).toContain('bg-[var(--surface)]');
    expect(src).toContain('text-[var(--ink)]');
    expect(src).toContain('rounded-[var(--radius-');
    expect(src).toContain('shadow-[var(--shadow-');
    expect(src).toContain('font-heading');
    expect(src).toMatch(/uppercase/);
  });

  it('hero is full-bleed (w-screen, not a card) with marker highlight', () => {
    const src = read('src/components/hero/variants/BazaarHero.tsx');
    expect(src).toContain('w-screen');
    expect(src).toContain('-translate-x-1/2');
    expect(src).toContain('bazaar-marker');
    expect(src).not.toContain('rounded-[var(--radius-lg)]');
  });

  it('no hardcoded slate/white/rounded bleed (struk radius = radius-sm token)', () => {
    const src = read('src/components/hero/variants/BazaarHero.tsx');
    expect(src).not.toMatch(/bg-white/);
    expect(src).not.toMatch(/text-slate-/);
    expect(src).not.toMatch(/border-slate-/);
    expect(src).not.toMatch(/rounded-lg[^[]/);
    expect(src).not.toMatch(/rounded-xl/);
    expect(src).not.toMatch(/rounded-md[^[]/);
    expect(src).not.toMatch(/rounded-\[4px\]/);
    // Struk receipt memakai token radius-sm, bukan nilai px hardcoded.
    expect(src).toContain('rounded-[var(--radius-sm)]');
  });

  it('ledger ornament wired (themes + layout + css)', () => {
    expect(read('src/lib/themes.ts')).toContain("'ledger'");
    expect(read('src/app/layout.tsx')).toContain('ornament-ledger');
    const css = read('src/app/globals.css');
    expect(css).toContain('.ornament-ledger');
    expect(css).toContain('overflow-x: clip');
  });
});

describe('T-BAZAAR: BazaarHeader + BazaarFooter routing + tokens', () => {
  it('registry routes bazaar-commerce -> BazaarHeader, bazaar-market -> BazaarFooter', () => {
    const registry = read('src/components/layout/variants/registry.ts');
    expect(registry).toContain("'bazaar-commerce': BazaarHeader");
    expect(registry).toContain("'bazaar-market': BazaarFooter");
  });

  it('header + footer use var tokens, no bleed', () => {
    for (const p of [
      'src/components/layout/variants/headers/BazaarHeader.tsx',
      'src/components/layout/variants/footers/BazaarFooter.tsx',
    ]) {
      const src = read(p);
      expect(src).toContain('rounded-[var(--radius-');
      expect(src).not.toMatch(/bg-white/);
      expect(src).not.toMatch(/text-slate-/);
      expect(src).not.toMatch(/border-slate-/);
      expect(src).not.toMatch(/rounded-lg[^[]/);
      expect(src).not.toMatch(/rounded-xl/);
    }
    // header: light paper surface + ink; footer: dark band like StackedFooter
    const header = read('src/components/layout/variants/headers/BazaarHeader.tsx');
    expect(header).toContain('bg-[var(--surface)]');
    expect(header).toContain('text-[var(--ink)]');
    const footer = read('src/components/layout/variants/footers/BazaarFooter.tsx');
    expect(footer).toContain('bg-brand-strong');
    expect(footer).toContain('text-brand-soft');
    expect(footer).toContain('bg-[var(--surface)]/10');
  });
});

describe('T-BAZAAR: persistence + admin accept bazaar', () => {
  it('settings API validates theme against THEMES registry (incl. bazaar)', () => {
    const src = read('src/app/api/settings/route.ts');
    expect(src).toContain('THEMES');
    expect(read('src/lib/themes.ts')).toContain('bazaar');
  });

  it('migration 0034 extends the CHECK constraint with bazaar', () => {
    const src = read('supabase/migrations/0034_bazaar_theme.sql');
    expect(src).toContain('bazaar');
    expect(src).toContain('library_settings_active_theme_check');
  });
});

describe('T-BAZAAR: hero struk receipt + promo ticker', () => {
  it('renders struk receipt visual (kartu katalog + barcode + stamp)', () => {
    const src = read('src/components/hero/variants/BazaarHero.tsx');
    expect(src).toContain('Kartu katalog');
    expect(src).toContain('bazaar-barcode');
    expect(src).toContain('Perpus Buka');
    expect(src).toContain('GRATIS');
  });

  it('renders promo ticker from banner titles', () => {
    const src = read('src/components/hero/variants/BazaarHero.tsx');
    expect(src).toContain('bazaar-ticker');
    expect(src).toContain('bazaar-ticker-track');
  });

  it('globals.css wires bazaar ticker motion + barcode, respects reduced motion', () => {
    const css = read('src/app/globals.css');
    expect(css).toContain('bazaar-ticker-roll');
    expect(css).toContain('.bazaar-barcode');
    expect(css).toContain('prefers-reduced-motion');
  });
});

describe('T-BAZAAR: section override registry (theme owns its layout)', () => {
  it('page.tsx resolves featured through the section registry', () => {
    const src = read('src/app/(public)/page.tsx');
    expect(src).toContain('resolveSectionComponent');
    expect(src).toContain("resolveSectionComponent(effective.id, 'featured')");
  });

  it('registry maps bazaar+featured -> BazaarCatalog, others -> null', () => {
    const src = read('src/components/home/sections/registry.ts');
    expect(src).toContain('bazaar');
    expect(src).toContain('BazaarCatalog');
    expect(src).toContain('featured');
  });

  it('BazaarCatalog groups by category with count pill + product cards', () => {
    const src = read('src/components/home/sections/BazaarCatalog.tsx');
    expect(src).toContain('buku');
    expect(src).toContain('Pinjam Sekarang');
    expect(src).toContain('Tersedia');
    expect(src).toContain('border-dashed');
  });

  it('BazaarCatalog uses var tokens, no bleed', () => {
    const src = read('src/components/home/sections/BazaarCatalog.tsx');
    expect(src).toContain('rounded-[var(--radius-');
    expect(src).toContain('shadow-[var(--shadow-');
    expect(src).not.toMatch(/bg-white/);
    expect(src).not.toMatch(/text-slate-/);
    expect(src).not.toMatch(/border-slate-/);
    expect(src).not.toMatch(/rounded-lg[^[]/);
    expect(src).not.toMatch(/rounded-xl/);
  });
});
