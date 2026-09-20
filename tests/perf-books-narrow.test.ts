import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/** Perf 89->90: public list payload drops description; count estimated on
 *  /api/books GET, exact kept only where pagination UI needs totals. */
describe('Perf books narrow select + estimated count', () => {
  it('GET /api/books default select drops description + avoids count exact', () => {
    const src = read('src/app/api/books/route.ts');
    const getBlock = src.slice(
      src.indexOf('export async function GET'),
      src.indexOf('export async function POST')
    );
    expect(getBlock, 'GET select must not include description').not.toMatch(/description/);
    expect(getBlock, 'GET must not use count exact on public path').not.toMatch(
      /count:\s*['"]exact['"]/
    );
    expect(getBlock, 'GET should use estimated count').toMatch(/count:\s*['"]estimated['"]/);
  });

  it('src/lib/books.ts list select drops description, detail keeps it', () => {
    // Kanonis di books/catalog.ts (shim books.ts re-export).
    const src = read('src/lib/books/catalog.ts');
    const listIdx = src.indexOf('BOOKS_LIST_SELECT =');
    expect(listIdx, 'BOOKS_LIST_SELECT must exist').toBeGreaterThanOrEqual(0);
    const listBlock = src.slice(listIdx, listIdx + 800);
    expect(listBlock, 'list select must not include description').not.toMatch(/description/);
    expect(listBlock, 'list select must keep updated_at for sitemap').toContain('updated_at');
    const fullIdx = src.indexOf('const BOOKS_SELECT =');
    const fullBlock = src.slice(fullIdx, fullIdx + 600);
    expect(fullBlock, 'detail select must keep description').toContain('description');
  });

  it('fetchBooksPaged keeps exact total for pagination UI', () => {
    const src = read('src/lib/books/catalog.ts');
    const pagedIdx = src.indexOf('async function fetchBooksPagedUncached');
    const pagedBlock = src.slice(pagedIdx, pagedIdx + 1200);
    expect(pagedBlock, 'paged katalog query keeps count exact for totalPages').toMatch(
      /count:\s*['"]exact['"]/
    );
  });

  it('CatalogExplorer is a server composer, Grid stays server', () => {
    const explorer = read('src/components/public/CatalogExplorer.tsx');
    expect(explorer, 'Explorer must not be a client wrapper').not.toMatch(/use client/);
    expect(explorer, 'Explorer must render CatalogGrid directly').toContain('CatalogGrid');
    expect(explorer, 'Explorer keeps 360px 2-col marker').toContain('grid-cols-2');
    expect(explorer, 'Explorer keeps 44px touch marker').toContain('min-h-[44px]');
    const grid = read('src/components/public/CatalogGrid.tsx');
    expect(grid, 'CatalogGrid must stay server').not.toMatch(/use client/);
    const filters = read('src/components/public/CatalogExplorerFilters.tsx');
    expect(filters, 'Filters island must stay client').toContain("'use client'");
  });
});
