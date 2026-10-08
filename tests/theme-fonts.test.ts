import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { getTheme } from '@/lib/themes';

/**
 * T-FONT-SPLIT (S4 perf): per-theme font loading split.
 * - getTheme(id).fonts vars resolve to the expected CSS vars
 * - src/app/layout.tsx attaches exactly 3 font vars per active theme
 *   (kop/heading, body, and Courier Prime for the data face)
 */

const LAYOUT_PATH = path.resolve(process.cwd(), 'src/app/layout.tsx');

function readLayout(): string {
  return fs.readFileSync(LAYOUT_PATH, 'utf8');
}

const EXPECTED_VARS: Record<string, { heading: string; body: string }> = {
  emerald: { heading: '--font-libre-caslon', body: '--font-libre-franklin' },
  midnight: { heading: '--font-bodoni', body: '--font-archivo' },
  paper: { heading: '--font-literata', body: '--font-public-sans' },
  brutalist: { heading: '--font-archivo-black', body: '--font-barlow' },
  ocean: { heading: '--font-bitter', body: '--font-karla' },
};

// layout.tsx const name -> CSS var it declares
const VAR_IDENT: Record<string, string> = {
  libreCaslon: '--font-libre-caslon',
  libreFranklin: '--font-libre-franklin',
  bodoni: '--font-bodoni',
  archivo: '--font-archivo',
  literata: '--font-literata',
  publicSans: '--font-public-sans',
  archivoBlack: '--font-archivo-black',
  barlow: '--font-barlow',
  bitter: '--font-bitter',
  karla: '--font-karla',
  courier: '--font-courier',
};

const THEME_IDENT_PAIR: Record<string, [string, string]> = {
  emerald: ['libreCaslon', 'libreFranklin'],
  midnight: ['bodoni', 'archivo'],
  paper: ['literata', 'publicSans'],
  brutalist: ['archivoBlack', 'barlow'],
  ocean: ['bitter', 'karla'],
};

describe('T-FONT-SPLIT: theme font vars resolve', () => {
  for (const [id, vars] of Object.entries(EXPECTED_VARS)) {
    it(`${id} fonts resolve to ${vars.heading} + ${vars.body}`, () => {
      const theme = getTheme(id);
      expect(theme.fonts.heading, `${id} fonts.heading non-empty`).toMatch(/var\(--font-/);
      expect(theme.fonts.body, `${id} fonts.body non-empty`).toMatch(/var\(--font-/);
      expect(theme.fonts.heading, `${id} heading var`).toContain(vars.heading);
      expect(theme.fonts.body, `${id} body var`).toContain(vars.body);
    });
  }
});

describe('T-FONT-SPLIT: layout.tsx attaches exactly 3 font vars per active theme', () => {
  it('keeps all 11 next/font/google declarations available', () => {
    const src = readLayout();
    for (const callee of [
      'Libre_Caslon_Display(',
      'Libre_Franklin(',
      'Bodoni_Moda(',
      'Archivo(',
      'Literata(',
      'Public_Sans(',
      'Archivo_Black(',
      'Barlow(',
      'Bitter(',
      'Karla(',
      'Courier_Prime(',
    ]) {
      expect(src, `layout.tsx must keep ${callee} declaration`).toContain(callee);
    }
  });

  it('preserves display:swap on every font loader', () => {
    const src = readLayout();
    const hits = src.match(/display:\s*['"]swap['"]/g) ?? [];
    expect(
      hits.length,
      `expected 11 display:swap loaders, found ${hits.length}`
    ).toBeGreaterThanOrEqual(11);
  });

  it('gates font variable assembly per theme.id (conditional, max 3 per render)', () => {
    const src = readLayout();
    // Must branch on theme id — not a single static 11-var className.
    expect(src, 'layout.tsx must gate fonts per theme.id').toMatch(/theme\.id|themeId/);
    expect(src, 'layout.tsx must expose a per-theme font helper').toMatch(
      /fontVariablesForTheme|themeFontVariables|fontVarsForTheme/
    );
    // <html> must use the helper, not inline all .variable refs.
    // Anchor on the real JSX tag (a doc comment also mentions <html>).
    const htmlTag = src.match(/<html\s+lang[\s\S]*?className=\{([^}]*)\}/)?.[0] ?? '';
    expect(htmlTag.length > 0, '<html> must have a dynamic className').toBe(true);
    expect(htmlTag, '<html> className must call the per-theme helper').toMatch(
      /fontVariablesForTheme|themeFontVariables|fontVarsForTheme/
    );
    const inlineVars = htmlTag.match(/\.variable/g) ?? [];
    expect(
      inlineVars.length,
      `<html> className inlines ${inlineVars.length} .variable refs, want max 2`
    ).toBeLessThanOrEqual(2);
  });

  it('each theme branch resolves to exactly its 3 font vars (heading, body, courier)', () => {
    const src = readLayout();
    for (const [themeId, pair] of Object.entries(THEME_IDENT_PAIR)) {
      // Find the case/branch block for this theme id, then check idents near it.
      const idx = src.indexOf(`case '${themeId}'`);
      expect(idx, `layout.tsx must have a branch for theme '${themeId}'`).toBeGreaterThanOrEqual(0);
      const window = src.slice(idx, idx + 600);
      for (const ident of pair) {
        expect(
          window,
          `'${themeId}' branch must attach ${ident}.variable (${VAR_IDENT[ident]})`
        ).toContain(`${ident}.variable`);
      }
      const varRefs = window.match(/[a-zA-Z]+\.variable/g) ?? [];
      // First 2 refs in the branch window must be the pair (allow trailing code after).
      const branchRefs = varRefs.slice(0, 2);
      expect(
        branchRefs.sort(),
        `'${themeId}' branch must attach exactly 2 theme vars, found [${branchRefs.join(', ')}]`
      ).toEqual([...pair].sort().map((p) => `${p}.variable`));
      // Third class is the shared Courier Prime data face (attached via `${data}`).
      expect(window, `'${themeId}' branch must attach the shared courier data face`).toContain(
        '${data}'
      );
    }
    // courier.variable is declared once and reused by every theme branch.
    expect(src, 'helper must declare courier.variable once for the shared data face').toMatch(
      /courier\.variable/
    );
    const helper = src.slice(
      src.indexOf('export function fontVariablesForTheme'),
      src.indexOf('export const OG_DEFAULT_IMAGE')
    );
    expect(
      (helper.match(/courier\.variable/g) ?? []).length,
      'helper must reference courier.variable exactly once'
    ).toBe(1);
  });
});
