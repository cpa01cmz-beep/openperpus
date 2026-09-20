import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/** Perf fixes (evaluator 83 -> >90): hero bundle split, LCP preload,
 *  API over-fetch, home waterfall, catalog client boundary. */
describe('Perf fixes: home + books API + catalog', () => {
  it('(a) HeroSwitch splits variants via next/dynamic (no static bulk import)', () => {
    const src = read('src/components/hero/HeroSwitch.tsx');
    expect(src, 'RED: HeroSwitch has no next/dynamic per-variant split').toMatch(/next\/dynamic/);
    for (const v of ['ClassicHero', 'CenteredHero', 'EditorialHero', 'StackedHero', 'SplitHero']) {
      expect(
        src,
        `RED: HeroSwitch statically imports ${v} — all 5 variants land in home chunk`
      ).not.toMatch(new RegExp(`import\\s+${v}\\s+from`));
    }
  });

  it('(b) LCP preload uses the transformed URL (matches imageLoader output)', () => {
    const src = read('src/app/(public)/page.tsx');
    expect(
      src,
      'RED: preload href uses raw lcpImage, not the width+quality transformed URL'
    ).not.toMatch(/href=\{lcpImage\}/);
    expect(
      src,
      'RED: preload href must go through coverSrc(lcpImage,…) or imageLoader({src:lcpImage,…})'
    ).toMatch(/coverSrc\(lcpImage|imageLoader\(\{src:\s*lcpImage|imageLoader\(lcpImage/);
  });

  it('(c) GET /api/books uses narrow select (no select * over-fetch)', () => {
    const src = read('src/app/api/books/route.ts');
    expect(src, "RED: GET /api/books still select('*') over-fetches").not.toMatch(/select\('\*/);
    for (const col of [
      'id',
      'title',
      'slug',
      'author',
      'cover_url',
      'stock_available',
      'categories(id,name,slug)',
      'racks(code,name,location)',
    ]) {
      expect(src, `RED: narrow select missing ${col}`).toContain(col);
    }
    expect(src, 'must keep Cache-Control public,s-maxage=300,stale-while-revalidate=60').toContain(
      'public, s-maxage=300, stale-while-revalidate=60'
    );
  });

  it('(d) home has no sequential fetchBooks fallback after Promise.all', () => {
    const src = read('src/app/(public)/page.tsx');
    expect(
      src,
      'RED: sequential `await fetchBooks` fallback adds an RTT on the empty-collection path'
    ).not.toMatch(/await fetchBooks/);
  });

  it('(f) catalog grid is server-rendered, interactivity stays client', () => {
    let grid = '';
    try {
      grid = read('src/components/public/CatalogGrid.tsx');
    } catch {
      grid = '';
    }
    expect(grid.length > 0, 'RED: src/components/public/CatalogGrid.tsx missing').toBe(true);
    expect(grid, 'RED: CatalogGrid must be a server component').not.toMatch(/use client/);
    expect(grid, 'CatalogGrid must render the 2-col grid + BookCard').toContain('grid-cols-2');
    expect(grid, 'CatalogGrid must render BookCard').toContain('BookCard');
    const controls = read('src/components/public/CatalogControls.tsx');
    expect(controls, 'CatalogControls must stay client').toContain("'use client'");
  });
});
