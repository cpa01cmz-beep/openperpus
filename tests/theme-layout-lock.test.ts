import { describe, expect, it, vi } from 'vitest';
import { getTheme, THEMES } from '@/lib/themes';

// theme-overrides.ts mengimpor 'server-only' (modul server). Mock di env unit
// agar impor statis di bawah dapat dimuat tanpa Next.js runtime.
vi.mock('server-only', () => ({}));

import { fallbackVariant, isCompatible } from '@/lib/theme-compat';
import {
  LOCKED_THEME_MESSAGE,
  ThemeOverridesLayoutSchema,
  getEffectiveTheme,
  sanitizeLayoutOverrides,
} from '@/lib/theme-overrides';

/**
 * Fase 4 — kunci layout: tema dikunci, hanya layout boleh di-override.
 * - Famili formal (emerald/midnight/paper/ocean) menolak sketch-*.
 * - Famili hand (sketch) menerima sketch-*.
 * - tokens/fonts/radius/shadow/spacing ditolak dengan pesan Indonesia "dikunci".
 * - Sections: unknown di-drop, duplikat first-win, kosong → base, tak pernah kosong.
 * - THEMES tidak termutasi oleh override apa pun.
 */
describe('theme layout lock: formal menolak sketch-* (isCompatible + fallback)', () => {
  it.each([
    ['emerald', 'header', 'sketch-notebook'],
    ['emerald', 'footer', 'sketch-margin'],
    ['emerald', 'hero', 'sketch-doodle'],
    ['midnight', 'header', 'sketch-notebook'],
    ['paper', 'footer', 'sketch-margin'],
    ['ocean', 'hero', 'sketch-doodle'],
  ] as const)('%s + %s:%s → incompatible', (base, kind, variant) => {
    expect(isCompatible(base, kind, variant)).toBe(false);
  });

  it('formal + sketch-* end-to-end → fallback ke varian bawaan base', () => {
    const base = getTheme('emerald');
    const out = getEffectiveTheme('emerald', {
      layout: {
        headerVariant: 'sketch-notebook',
        footerVariant: 'sketch-margin',
        heroVariant: 'sketch-doodle',
      },
    });
    expect(out.layout.headerVariant).toBe(base.layout.headerVariant);
    expect(out.layout.headerVariant).toBe('emerald-classic');
    expect(out.layout.footerVariant).toBe(base.layout.footerVariant);
    expect(out.layout.footerVariant).toBe('emerald-standard');
    expect(out.layout.heroVariant).toBe(base.layout.heroVariant);
    expect(out.layout.heroVariant).toBe('emerald-centered');
    // fallbackVariant konsisten dengan hasil end-to-end.
    expect(fallbackVariant('emerald', 'header')).toBe('emerald-classic');
    expect(fallbackVariant('emerald', 'hero')).toBe('emerald-centered');
    expect(fallbackVariant('emerald', 'footer')).toBe('emerald-standard');
  });

  it('kunci tak dikenal → incompatible (fail-closed)', () => {
    expect(isCompatible('emerald', 'header', 'unknown-xyz')).toBe(false);
    expect(isCompatible('emerald', 'header', '')).toBe(false);
  });
});

describe('theme layout lock: sketch + sketch-* compatible', () => {
  it.each([
    ['header', 'sketch-notebook'],
    ['footer', 'sketch-margin'],
    ['hero', 'sketch-doodle'],
    ['hero', 'sketch'],
    ['hero', 'doodle'],
  ] as const)('sketch + %s:%s → compatible', (kind, variant) => {
    expect(isCompatible('sketch', kind, variant)).toBe(true);
  });

  it('sketch + sketch-* end-to-end → dipakai, bukan fallback', () => {
    const out = getEffectiveTheme('sketch', {
      layout: {
        headerVariant: 'sketch-notebook',
        footerVariant: 'sketch-margin',
        heroVariant: 'sketch-doodle',
      },
    });
    expect(out.layout.headerVariant).toBe('sketch-notebook');
    expect(out.layout.footerVariant).toBe('sketch-margin');
    expect(out.layout.heroVariant).toBe('sketch-doodle');
  });
});

describe('theme layout lock: tokens/* ditolak (pesan Indonesia "dikunci")', () => {
  it('LOCKED_THEME_MESSAGE berbahasa Indonesia dan memuat "dikunci"', () => {
    expect(LOCKED_THEME_MESSAGE).toMatch(/dikunci/);
  });

  it.each(['tokens', 'fonts', 'radius', 'shadow', 'spacing'] as const)(
    'safeParse({ %s }) → gagal + error memuat "dikunci"',
    (key) => {
      const r = ThemeOverridesLayoutSchema.safeParse({ [key]: { brand: '#000000' } });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error).toMatch(/dikunci/);
    }
  );

  it('parse({ tokens }) melempar Error berbahasa Indonesia "dikunci"', () => {
    expect(() => ThemeOverridesLayoutSchema.parse({ tokens: { brand: '#000000' } })).toThrow(
      /dikunci/
    );
  });

  it('kunci root tak dikenal ikut ditolak dengan pesan kunci-tema', () => {
    const r = ThemeOverridesLayoutSchema.safeParse({ warna: 'hijau' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/dikunci/);
  });

  it('sanitize lenient: kunci terkunci diabaikan tanpa throw, layout tetap jalan', () => {
    const cleaned = sanitizeLayoutOverrides({
      tokens: { brand: '#000000' },
      layout: { headerVariant: 'midnight-slim' },
    });
    expect(cleaned).not.toBeNull();
    expect(cleaned?.layout.headerVariant).toBe('midnight-slim');
    expect(cleaned as unknown as Record<string, unknown>).not.toHaveProperty('tokens');
  });

  it('getEffectiveTheme tidak pernah menerapkan tokens dari overrides', () => {
    const base = getTheme('emerald');
    const out = getEffectiveTheme('emerald', {
      tokens: { brand: '#000000' },
      layout: { headerVariant: 'midnight-slim' },
    });
    expect(out.tokens).toEqual(base.tokens);
    expect(out.layout.headerVariant).toBe('midnight-slim');
  });
});

describe('theme layout lock: sections duplikat / unknown / min-enabled', () => {
  it('duplikat → dedupe first-win', () => {
    const cleaned = sanitizeLayoutOverrides({
      layout: {
        homepageSections: [
          { id: 'hero', enabled: true },
          { id: 'hero', enabled: false },
          { id: 'news', enabled: true },
        ],
      },
    });
    const sections = cleaned?.layout.homepageSections ?? [];
    expect(sections.filter((s) => s.id === 'hero')).toHaveLength(1);
    expect(sections[0]).toEqual({ id: 'hero', enabled: true });
  });

  it('unknown section → drop, known dipertahankan', () => {
    const cleaned = sanitizeLayoutOverrides({
      layout: {
        homepageSections: [
          { id: 'hero', enabled: true },
          { id: 'nope-unknown-section', enabled: true },
        ],
      },
    });
    const ids = (cleaned?.layout.homepageSections ?? []).map((s) => s.id);
    expect(ids).toContain('hero');
    expect(ids).not.toContain('nope-unknown-section');
  });

  it('homepageSections kosong → base dipertahankan (identik)', () => {
    const base = getTheme('emerald');
    const out = getEffectiveTheme('emerald', { layout: { homepageSections: [] } });
    expect(out.layout.homepageSections).toEqual(base.layout.homepageSections);
  });

  it('disable sebagian → 7 entri, yang tak disebut ikut base (tak pernah hilang)', () => {
    const out = getEffectiveTheme('emerald', {
      layout: { homepageSections: [{ id: 'hero', enabled: false }] },
    });
    expect(out.layout.homepageSections).toHaveLength(7);
    expect(out.layout.homepageSections.find((s) => s.id === 'hero')?.enabled).toBe(false);
  });

  it('semua 7 nonaktif → tanpa throw, hasil tak pernah kosong (guard min-1 ada di UI LayoutPicker)', () => {
    const ids = ['hero', 'announcement', 'stats', 'welcome', 'featured', 'news', 'testimonials'];
    const out = getEffectiveTheme('emerald', {
      layout: { homepageSections: ids.map((id) => ({ id, enabled: false })) },
    });
    expect(out.layout.homepageSections.length).toBeGreaterThan(0);
  });
});

describe('theme layout lock: THEMES tidak termutasi', () => {
  it('override hostile (tokens + sketch-* + sections) tidak mengubah registry', () => {
    const before = JSON.stringify(THEMES);
    const beforeEmerald = JSON.stringify(getTheme('emerald'));
    getEffectiveTheme('emerald', {
      tokens: { brand: '#000000' },
      layout: {
        headerVariant: 'sketch-notebook',
        heroVariant: 'sketch-doodle',
        homepageSections: [
          { id: 'news', enabled: false },
          { id: 'news', enabled: true },
          { id: 'nope-unknown-section', enabled: true },
        ],
      },
    });
    getEffectiveTheme('sketch', {
      layout: { headerVariant: 'emerald-classic', homepageSections: [] },
    });
    expect(JSON.stringify(THEMES)).toEqual(before);
    expect(JSON.stringify(getTheme('emerald'))).toEqual(beforeEmerald);
  });
});
