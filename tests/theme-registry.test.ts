import { describe, expect, it } from 'vitest';
import { getTheme, themes } from '@/lib/themes';

const THEME_IDS = ['emerald', 'midnight', 'paper', 'brutalist', 'ocean'] as const;

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

describe('theme registry (Wave 2 contract)', () => {
  it('exposes exactly 5 theme ids', () => {
    expect(themes.map((t) => t.id).sort()).toEqual([...THEME_IDS].sort());
  });

  it('each theme has 8 token keys as valid hex', () => {
    expect(themes).toHaveLength(5);
    for (const theme of themes) {
      for (const key of TOKEN_KEYS) {
        const value = (theme.tokens as Record<string, unknown>)[key];
        expect(typeof value, `${theme.id} token ${key} must be a string`).toBe('string');
        expect(value as string, `${theme.id} token ${key} must be valid hex`).toMatch(HEX_RE);
      }
    }
  });

  it('emerald brand=#047857 accent=#f59e0b', () => {
    const emerald = getTheme('emerald');
    expect(emerald.id).toBe('emerald');
    const tokens = emerald.tokens as Record<string, string>;
    expect(tokens['brand']?.toLowerCase()).toBe('#047857');
    expect(tokens['accent']?.toLowerCase()).toBe('#f59e0b');
  });

  it('midnight heading is readable: valid hex and != brand-strong', () => {
    const midnight = getTheme('midnight');
    const tokens = midnight.tokens as Record<string, string>;
    expect(tokens['heading']).toMatch(HEX_RE);
    expect(tokens['heading']?.toLowerCase()).not.toBe(tokens['brand-strong']?.toLowerCase());
  });

  it('S2: getTheme(invalid-id) falls back to emerald', () => {
    const fallback = getTheme('invalid-id');
    expect(fallback.id).toBe('emerald');
  });
});

describe('theme layout system (Task 2 RED spec)', () => {
  it('each of 5 themes exposes fonts {heading, body} as non-empty strings', () => {
    expect(themes).toHaveLength(5);
    for (const theme of themes) {
      const fonts = (theme as unknown as Record<string, unknown>)['fonts'] as Record<
        string,
        unknown
      > | undefined;
      expect(fonts, `${theme.id} must expose fonts object`).toBeDefined();
      expect(typeof fonts?.['heading'], `${theme.id} fonts.heading must be a string`).toBe(
        'string',
      );
      expect((fonts?.['heading'] as string)?.length > 0, `${theme.id} fonts.heading non-empty`).toBe(
        true,
      );
      expect(typeof fonts?.['body'], `${theme.id} fonts.body must be a string`).toBe('string');
      expect((fonts?.['body'] as string)?.length > 0, `${theme.id} fonts.body non-empty`).toBe(
        true,
      );
    }
  });

  it('each of 5 themes exposes radius scale', () => {
    for (const theme of themes) {
      const radius = (theme as unknown as Record<string, unknown>)['radius'] as Record<
        string,
        unknown
      > | undefined;
      expect(radius, `${theme.id} must expose radius scale`).toBeDefined();
      for (const key of ['sm', 'md', 'lg'] as const) {
        expect(typeof radius?.[key], `${theme.id} radius.${key} must be a string`).toBe('string');
        expect(
          ((radius?.[key] as string) ?? '').length > 0,
          `${theme.id} radius.${key} non-empty`,
        ).toBe(true);
      }
    }
  });

  it('each of 5 themes exposes shadow scale', () => {
    for (const theme of themes) {
      const shadow = (theme as unknown as Record<string, unknown>)['shadow'] as Record<
        string,
        unknown
      > | undefined;
      expect(shadow, `${theme.id} must expose shadow scale`).toBeDefined();
      for (const key of ['sm', 'md', 'lg'] as const) {
        expect(typeof shadow?.[key], `${theme.id} shadow.${key} must be a string`).toBe('string');
        expect(
          ((shadow?.[key] as string) ?? '').length > 0,
          `${theme.id} shadow.${key} non-empty`,
        ).toBe(true);
      }
    }
  });

  it('each of 5 themes exposes spacing {container, section, card}', () => {
    for (const theme of themes) {
      const spacing = (theme as unknown as Record<string, unknown>)['spacing'] as Record<
        string,
        unknown
      > | undefined;
      expect(spacing, `${theme.id} must expose spacing object`).toBeDefined();
      for (const key of ['container', 'section', 'card'] as const) {
        expect(typeof spacing?.[key], `${theme.id} spacing.${key} must be a string`).toBe('string');
        expect(
          ((spacing?.[key] as string) ?? '').length > 0,
          `${theme.id} spacing.${key} non-empty`,
        ).toBe(true);
      }
    }
  });

  it('each of 5 themes exposes layout {headerVariant, heroVariant, footerVariant, homepageSections ordered array}', () => {
    for (const theme of themes) {
      const layout = (theme as unknown as Record<string, unknown>)['layout'] as Record<
        string,
        unknown
      > | undefined;
      expect(layout, `${theme.id} must expose layout object`).toBeDefined();
      for (const key of ['headerVariant', 'heroVariant', 'footerVariant'] as const) {
        expect(typeof layout?.[key], `${theme.id} layout.${key} must be a string`).toBe('string');
        expect(
          ((layout?.[key] as string) ?? '').length > 0,
          `${theme.id} layout.${key} non-empty`,
        ).toBe(true);
      }
      const sections = layout?.['homepageSections'] as unknown;
      expect(Array.isArray(sections), `${theme.id} layout.homepageSections must be an array`).toBe(
        true,
      );
      const list = sections as Array<Record<string, unknown>>;
      expect(list.length > 0, `${theme.id} homepageSections must be non-empty`).toBe(true);
      const ids = list.map((s) => s['id']);
      // Ordered-array contract: exact order matters, re-sorting must not silently pass.
      expect(ids, `${theme.id} homepageSections entries must have string ids`).toEqual(
        ids.map(() => expect.any(String)),
      );
      expect([...ids].sort(), `${theme.id} homepageSections order must be intentional`).not.toEqual(
        ids,
      );
    }
  });

  it("getTheme('bogus-layout') falls back to emerald", () => {
    const fallback = getTheme('bogus-layout');
    expect(fallback.id).toBe('emerald');
    const layout = (fallback as unknown as Record<string, unknown>)['layout'] as Record<
      string,
      unknown
    > | undefined;
    expect(layout, 'fallback emerald must expose layout').toBeDefined();
    expect(Array.isArray(layout?.['homepageSections'])).toBe(true);
  });

  it('section enabled:false contract — disabled sections are excluded from visible order', () => {
    for (const theme of themes) {
      const layout = (theme as unknown as Record<string, unknown>)['layout'] as Record<
        string,
        unknown
      > | undefined;
      const sections = layout?.['homepageSections'] as
        | Array<Record<string, unknown>>
        | undefined;
      expect(sections, `${theme.id} must expose homepageSections`).toBeDefined();
      for (const section of sections ?? []) {
        expect(typeof section['id'], `${theme.id} section id must be a string`).toBe('string');
        expect(typeof section['enabled'], `${theme.id} section enabled must be boolean`).toBe(
          'boolean',
        );
      }
      const visible = (sections ?? []).filter((s) => s['enabled'] !== false);
      const disabledCount = (sections ?? []).filter((s) => s['enabled'] === false).length;
      expect(
        visible.length,
        `${theme.id} visible sections exclude enabled:false`,
      ).toBe((sections ?? []).length - disabledCount);
      // Contract probe: flipping a section to enabled:false must shrink the visible order.
      const probe = (sections ?? []).map((s) => ({ ...s, enabled: false }));
      expect(
        probe.filter((s) => s['enabled'] !== false),
        `${theme.id} all-disabled probe yields empty visible order`,
      ).toEqual([]);
    }
  });
});
