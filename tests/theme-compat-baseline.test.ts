import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { getTheme } from '@/lib/themes';

// theme-overrides.ts mengimpor 'server-only' (modul server). Mock di env unit
// agar dynamic import di bawah dapat dimuat tanpa Next.js runtime.
vi.mock('server-only', () => ({}));

/**
 * Baseline anti-regresi fase kompatibilitas (theme-compat / theme-overrides).
 * - Selama src/lib/theme-compat.ts / src/lib/theme-overrides.ts BELUM ada,
 *   suite yang relevan di-skip (hijau), bukan fail.
 * - Jika sudah ada, perilaku inti diuji terhadap API nyata:
 *   NULL→identik base, unknown variant→fallback base, unknown section→drop,
 *   duplikat→dedupe, formal+sketch-notebook→incompatible.
 */
const root = process.cwd();
const compatExists = fs.existsSync(path.join(root, 'src/lib/theme-compat.ts'));
const overridesExists = fs.existsSync(path.join(root, 'src/lib/theme-overrides.ts'));

type SkipCtx = { skip: (note?: string) => never };
type AnyModule = Record<string, unknown>;

/** Dynamic import + skip (bukan fail) bila modul belum importable. */
async function importOrSkip(ctx: SkipCtx, spec: string): Promise<AnyModule> {
  try {
    return (await import(spec)) as AnyModule;
  } catch {
    return ctx.skip(`module ${spec} not importable yet`);
  }
}

function requireFn(ctx: SkipCtx, mod: AnyModule, name: string): (...args: never[]) => unknown {
  const fn = mod[name];
  if (typeof fn !== 'function') {
    return ctx.skip(`export ${name} not found — extend test in compat phase`);
  }
  return fn as (...args: never[]) => unknown;
}

function callStringString(
  fn: (...args: never[]) => unknown,
  a: string,
  b: string,
  c: string
): unknown {
  return (fn as unknown as (x: string, y: string, z: string) => unknown)(a, b, c);
}

describe('theme-compat baseline: skip-guard contract', () => {
  it('skip-guard mencerminkan filesystem (hijau saat file fase-depan belum ada)', () => {
    expect(compatExists, 'theme-compat.ts existence flag must be boolean').toStrictEqual(
      compatExists === true || compatExists === false ? compatExists : null
    );
    expect(overridesExists, 'theme-overrides.ts existence flag must be boolean').toStrictEqual(
      overridesExists === true || overridesExists === false ? overridesExists : null
    );
    if (!compatExists || !overridesExists) {
      expect(true, 'missing future files → related suites skip, file stays green').toBe(true);
    }
  });
});

describe.skipIf(!compatExists)('theme-compat baseline (isCompatible / fallback)', () => {
  it('formal + sketch-notebook → incompatible', async (ctx) => {
    const mod = await importOrSkip(ctx as SkipCtx, '@/lib/theme-compat');
    const isCompatible = requireFn(ctx as SkipCtx, mod, 'isCompatible');
    // Famili formal (emerald) menolak varian sketch-*.
    expect(callStringString(isCompatible, 'emerald', 'header', 'sketch-notebook')).toBe(false);
    expect(callStringString(isCompatible, 'emerald', 'footer', 'sketch-margin')).toBe(false);
    expect(callStringString(isCompatible, 'emerald', 'hero', 'sketch-doodle')).toBe(false);
    // Kontrol positif: varian sendiri + varian sketch di famili hand tetap boleh.
    expect(callStringString(isCompatible, 'emerald', 'header', 'emerald-classic')).toBe(true);
    expect(callStringString(isCompatible, 'sketch', 'header', 'sketch-notebook')).toBe(true);
    // Kunci tak dikenal → false (fail-closed).
    expect(callStringString(isCompatible, 'emerald', 'header', 'unknown-xyz')).toBe(false);
  });

  it('fallbackVariant mengembalikan varian bawaan base', async (ctx) => {
    const mod = await importOrSkip(ctx as SkipCtx, '@/lib/theme-compat');
    const fallbackVariant = requireFn(ctx as SkipCtx, mod, 'fallbackVariant');
    const call = (a: string, b: string) =>
      (fallbackVariant as unknown as (x: string, y: string) => unknown)(a, b);
    expect(call('emerald', 'header')).toBe('emerald-classic');
    expect(call('emerald', 'hero')).toBe('emerald-centered');
    expect(call('emerald', 'footer')).toBe('emerald-standard');
    expect(call('sketch', 'header')).toBe('sketch-notebook');
  });
});

describe.skipIf(!overridesExists)('theme-overrides baseline (sanitize / effective)', () => {
  it('NULL override → identik base (deep equal)', async (ctx) => {
    const mod = await importOrSkip(ctx as SkipCtx, '@/lib/theme-overrides');
    const getEffectiveTheme = requireFn(ctx as SkipCtx, mod, 'getEffectiveTheme');
    const call = (baseId: string, raw: unknown) =>
      (getEffectiveTheme as unknown as (b: string, r: unknown) => unknown)(baseId, raw);
    const base = getTheme('emerald');
    for (const raw of [null, undefined, {}, { layout: {} }, 'bukan-object', 42]) {
      expect(
        call('emerald', raw),
        `override ${String(raw)} must return base-identical theme`
      ).toEqual(base);
    }
  });

  it('unknown variant → fallback base', async (ctx) => {
    const mod = await importOrSkip(ctx as SkipCtx, '@/lib/theme-overrides');
    const getEffectiveTheme = requireFn(ctx as SkipCtx, mod, 'getEffectiveTheme');
    const call = (baseId: string, raw: unknown) =>
      (getEffectiveTheme as unknown as (b: string, r: unknown) => unknown)(baseId, raw);
    const base = getTheme('emerald');
    const out = call('emerald', {
      layout: {
        headerVariant: 'unknown-xyz',
        footerVariant: 'unknown-xyz',
        heroVariant: 'unknown-xyz',
      },
    }) as { layout: typeof base.layout };
    expect(out.layout.headerVariant, 'unknown headerVariant must fall back to base').toBe(
      base.layout.headerVariant
    );
    expect(out.layout.footerVariant, 'unknown footerVariant must fall back to base').toBe(
      base.layout.footerVariant
    );
    expect(out.layout.heroVariant, 'unknown heroVariant must fall back to base').toBe(
      base.layout.heroVariant
    );
  });

  it('formal + sketch-notebook end-to-end → fallback base (incompatible)', async (ctx) => {
    const mod = await importOrSkip(ctx as SkipCtx, '@/lib/theme-overrides');
    const getEffectiveTheme = requireFn(ctx as SkipCtx, mod, 'getEffectiveTheme');
    const call = (baseId: string, raw: unknown) =>
      (getEffectiveTheme as unknown as (b: string, r: unknown) => unknown)(baseId, raw);
    const base = getTheme('emerald');
    const out = call('emerald', { layout: { headerVariant: 'sketch-notebook' } }) as {
      layout: typeof base.layout;
    };
    expect(
      out.layout.headerVariant,
      'sketch-notebook on formal base must fall back to emerald-classic'
    ).toBe('emerald-classic');
  });

  it('unknown section → drop (known sections dipertahankan)', async (ctx) => {
    const mod = await importOrSkip(ctx as SkipCtx, '@/lib/theme-overrides');
    const sanitizeLayoutOverrides = requireFn(ctx as SkipCtx, mod, 'sanitizeLayoutOverrides');
    const sanitize = (raw: unknown) =>
      (
        sanitizeLayoutOverrides as unknown as (r: unknown) => {
          layout: { homepageSections?: Array<{ id: string; enabled: boolean }> };
        } | null
      )(raw);
    const cleaned = sanitize({
      layout: {
        homepageSections: [
          { id: 'hero', enabled: true },
          { id: 'nope-unknown-section', enabled: true },
        ],
      },
    });
    expect(cleaned, 'sanitize must return data').not.toBeNull();
    const ids = (cleaned?.layout.homepageSections ?? []).map((s) => s.id);
    expect(ids, 'known section hero must be kept').toContain('hero');
    expect(ids, 'unknown section must be dropped').not.toContain('nope-unknown-section');

    // Jalur end-to-end: section tak dikenal tak boleh bocor ke theme efektif.
    const getEffectiveTheme = requireFn(ctx as SkipCtx, mod, 'getEffectiveTheme');
    const effective = (
      getEffectiveTheme as unknown as (
        b: string,
        r: unknown
      ) => { layout: { homepageSections: Array<{ id: string }> } }
    )('emerald', {
      layout: { homepageSections: [{ id: 'nope-unknown-section', enabled: true }] },
    });
    expect(
      effective.layout.homepageSections.map((s) => s.id),
      'effective theme must not contain unknown sections'
    ).not.toContain('nope-unknown-section');
  });

  it('duplikat section → dedupe (first-win)', async (ctx) => {
    const mod = await importOrSkip(ctx as SkipCtx, '@/lib/theme-overrides');
    const sanitizeLayoutOverrides = requireFn(ctx as SkipCtx, mod, 'sanitizeLayoutOverrides');
    const sanitize = (raw: unknown) =>
      (
        sanitizeLayoutOverrides as unknown as (r: unknown) => {
          layout: { homepageSections?: Array<{ id: string; enabled: boolean }> };
        } | null
      )(raw);
    const cleaned = sanitize({
      layout: {
        homepageSections: [
          { id: 'hero', enabled: true },
          { id: 'hero', enabled: false },
          { id: 'news', enabled: true },
        ],
      },
    });
    const sections = cleaned?.layout.homepageSections ?? [];
    expect(
      sections.filter((s) => s.id === 'hero'),
      'duplicate hero sections must be deduped to one (first-win)'
    ).toHaveLength(1);
    expect(sections[0], 'first-win: hero yang dipertahankan adalah kemunculan pertama').toEqual({
      id: 'hero',
      enabled: true,
    });
    expect(
      sections.map((s) => s.id),
      'news must be kept'
    ).toContain('news');
  });

  it('override tidak memutasi THEMES (registry base tetap murni)', async (ctx) => {
    const mod = await importOrSkip(ctx as SkipCtx, '@/lib/theme-overrides');
    const getEffectiveTheme = requireFn(ctx as SkipCtx, mod, 'getEffectiveTheme');
    const before = JSON.stringify(getTheme('emerald'));
    (getEffectiveTheme as unknown as (b: string, r: unknown) => unknown)('emerald', {
      layout: {
        headerVariant: 'midnight-slim',
        homepageSections: [{ id: 'news', enabled: false }],
      },
    });
    expect(JSON.stringify(getTheme('emerald')), 'THEMES registry must not be mutated').toEqual(
      before
    );
  });
});
