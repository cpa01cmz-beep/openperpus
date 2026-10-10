import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { getTheme, themes } from '@/lib/themes';
import {
  FOOTER_VARIANTS,
  HEADER_VARIANTS,
  resolveFooterVariant,
  resolveHeaderVariant,
} from '@/components/layout/variants/registry';

const THEME_IDS = ['emerald', 'midnight', 'paper', 'brutalist', 'ocean', 'sketch'] as const;

const TOKEN_KEYS = [
  'brand',
  'brand-soft',
  'brand-strong',
  'accent',
  'accent-soft',
  'surface',
  'ink',
  'heading',
] as const;

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** The 7 known homepage section ids (baseline contract — every theme is a permutation). */
const KNOWN_SECTION_IDS = [
  'hero',
  'announcement',
  'stats',
  'welcome',
  'featured',
  'news',
  'testimonials',
] as const;
const KNOWN_SECTION_SET = new Set<string>(KNOWN_SECTION_IDS);

const root = process.cwd();
const heroSwitchSrc = fs.readFileSync(
  path.join(root, 'src/components/hero/HeroSwitch.tsx'),
  'utf8'
);

/** Baseline anti-regresi: 6 preset + token + layoutfondasi SEBELUM fondasi baru dipakai. */
describe('theme baseline: presets, tokens, layout', () => {
  it('6 preset ada (emerald, midnight, paper, brutalist, ocean, sketch)', () => {
    expect(themes.map((t) => t.id).sort()).toEqual([...THEME_IDS].sort());
    expect(themes).toHaveLength(6);
  });

  it('getTheme unknown → emerald (fallback stabil)', () => {
    for (const id of ['unknown-theme', 'bogus-layout', '', 'formal', 'CLASSIC']) {
      expect(getTheme(id).id, `getTheme('${id}') must fall back to emerald`).toBe('emerald');
    }
    expect(getTheme('midnight').id).toBe('midnight');
  });

  it('setiap theme punya 8 hex valid', () => {
    for (const theme of themes) {
      for (const key of TOKEN_KEYS) {
        const value = (theme.tokens as Record<string, unknown>)[key];
        expect(typeof value, `${theme.id} token ${key} must be a string`).toBe('string');
        expect(value as string, `${theme.id} token ${key} must be valid hex`).toMatch(HEX_RE);
      }
    }
  });

  it('fonts / radius / shadow / spacing non-empty di setiap theme', () => {
    for (const theme of themes) {
      expect(theme.fonts.heading.length > 0, `${theme.id} fonts.heading non-empty`).toBe(true);
      expect(theme.fonts.body.length > 0, `${theme.id} fonts.body non-empty`).toBe(true);
      for (const key of ['sm', 'md', 'lg'] as const) {
        expect(theme.radius[key].length > 0, `${theme.id} radius.${key} non-empty`).toBe(true);
        expect(theme.shadow[key].length > 0, `${theme.id} shadow.${key} non-empty`).toBe(true);
      }
      expect(theme.spacing.container.length > 0, `${theme.id} spacing.container non-empty`).toBe(
        true
      );
      expect(theme.spacing.section.length > 0, `${theme.id} spacing.section non-empty`).toBe(true);
      expect(theme.spacing.card.length > 0, `${theme.id} spacing.card non-empty`).toBe(true);
    }
  });

  it('homepageSections: 7 ids dikenal (permutasi dari set yang sama)', () => {
    for (const theme of themes) {
      const sections = theme.layout.homepageSections;
      expect(sections, `${theme.id} homepageSections must exist`).toBeDefined();
      expect(sections, `${theme.id} homepageSections must have 7 entries`).toHaveLength(7);
      for (const s of sections) {
        expect(KNOWN_SECTION_SET.has(s.id), `${theme.id} section '${s.id}' must be known`).toBe(
          true
        );
        expect(typeof s.enabled, `${theme.id} section '${s.id}' enabled must be boolean`).toBe(
          'boolean'
        );
      }
      expect(
        sections.map((s) => s.id).sort(),
        `${theme.id} homepageSections must cover all 7 known ids`
      ).toEqual([...KNOWN_SECTION_IDS].sort());
    }
  });
});

describe('theme baseline: registry resolution (tanpa throw)', () => {
  it('setiap theme.layout.headerVariant resolve ke fungsi', () => {
    for (const theme of themes) {
      const key = theme.layout.headerVariant;
      let resolved: unknown;
      expect(() => {
        resolved = resolveHeaderVariant(key);
      }, `${theme.id} headerVariant '${key}' must not throw`).not.toThrow();
      expect(typeof resolved, `${theme.id} headerVariant '${key}' must resolve to a function`).toBe(
        'function'
      );
    }
  });

  it('setiap theme.layout.footerVariant resolve ke fungsi', () => {
    for (const theme of themes) {
      const key = theme.layout.footerVariant;
      let resolved: unknown;
      expect(() => {
        resolved = resolveFooterVariant(key);
      }, `${theme.id} footerVariant '${key}' must not throw`).not.toThrow();
      expect(typeof resolved, `${theme.id} footerVariant '${key}' must resolve to a function`).toBe(
        'function'
      );
    }
  });

  it('setiap theme.layout.heroVariant terdaftar di HeroSwitch variantComponents (fallback CenteredHero ada)', () => {
    expect(heroSwitchSrc, 'HeroSwitch must define CenteredHero fallback').toContain('CenteredHero');
    expect(heroSwitchSrc, 'HeroSwitch must fall back to CenteredHero on unknown variant').toMatch(
      /CenteredHero/
    );
    for (const theme of themes) {
      const key = theme.layout.heroVariant;
      expect(
        heroSwitchSrc.includes(`'${key}'`) || heroSwitchSrc.includes(`"${key}"`),
        `${theme.id} heroVariant '${key}' must be registered in HeroSwitch variantComponents (or fall back to CenteredHero)`
      ).toBe(true);
    }
  });

  it('alias keys resolve tanpa throw (classic/minimal/split/top-bar/standard/stacked/dll)', () => {
    const headerAliases = ['classic', 'centered', 'minimal', 'top-bar', 'topbar', 'split'];
    for (const key of headerAliases) {
      let resolved: unknown;
      expect(() => {
        resolved = resolveHeaderVariant(key);
      }, `header alias '${key}' must not throw`).not.toThrow();
      expect(typeof resolved, `header alias '${key}' must resolve to a function`).toBe('function');
      expect(HEADER_VARIANTS[key], `HEADER_VARIANTS must contain alias '${key}'`).toBeDefined();
    }

    const footerAliases = [
      'classic',
      'standard',
      'minimal',
      'colophon',
      'stacked',
      'extended',
      'index',
      'harbor',
    ];
    for (const key of footerAliases) {
      let resolved: unknown;
      expect(() => {
        resolved = resolveFooterVariant(key);
      }, `footer alias '${key}' must not throw`).not.toThrow();
      expect(typeof resolved, `footer alias '${key}' must resolve to a function`).toBe('function');
      expect(FOOTER_VARIANTS[key], `FOOTER_VARIANTS must contain alias '${key}'`).toBeDefined();
    }

    const heroAliases = [
      'centered',
      'editorial',
      'stacked',
      'split',
      'classic',
      'sketch',
      'doodle',
    ];
    for (const key of heroAliases) {
      expect(
        heroSwitchSrc.includes(`'${key}'`) || heroSwitchSrc.includes(`"${key}"`),
        `hero alias '${key}' must be registered in HeroSwitch`
      ).toBe(true);
    }
  });

  it('unknown / null / empty variant keys fallback tanpa throw', () => {
    for (const key of ['unknown-xyz', '', null, undefined]) {
      let header: unknown;
      let footer: unknown;
      expect(
        () => {
          header = resolveHeaderVariant(key);
        },
        `resolveHeaderVariant(${String(key)}) must not throw`
      ).not.toThrow();
      expect(
        () => {
          footer = resolveFooterVariant(key);
        },
        `resolveFooterVariant(${String(key)}) must not throw`
      ).not.toThrow();
      expect(typeof header, `unknown header key ${String(key)} must fall back to a function`).toBe(
        'function'
      );
      expect(typeof footer, `unknown footer key ${String(key)} must fall back to a function`).toBe(
        'function'
      );
    }
  });
});

describe('theme baseline: snapshot stabilitas', () => {
  for (const id of THEME_IDS) {
    it(`${id}: JSON.stringify(getTheme) stabil (reread equal + snapshot)`, () => {
      const first = JSON.stringify(getTheme(id));
      const reread = JSON.stringify(getTheme(id));
      expect(reread, `${id} theme JSON must be stable across reads`).toEqual(first);
      expect(getTheme(id), `${id} theme snapshot`).toMatchSnapshot();
    });
  }
});
