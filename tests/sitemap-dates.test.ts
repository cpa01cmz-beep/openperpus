import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const SITEMAP = 'src/app/sitemap.ts';
const BOOKS_LIB = 'src/lib/books.ts';

/** S-seo-sitemap: book/page sitemap URLs use per-row updated_at, not single new Date(). */
describe('S-seo-sitemap dates', () => {
  it('book URLs map lastModified from row updated_at (not bare now)', () => {
    const src = read(SITEMAP);
    const bookBlock = src.slice(src.indexOf('bookUrls'), src.indexOf('articleUrls'));
    expect(
      bookBlock.includes('b.updated_at'),
      'S-seo-sitemap RED: bookUrls must read b.updated_at for lastModified'
    ).toBe(true);
    expect(
      bookBlock.includes('lastModified: now'),
      'S-seo-sitemap RED: bookUrls still stamps bare now — use per-row updated_at'
    ).toBe(false);
  });

  it('page URLs map lastModified from row updated_at (not bare now)', () => {
    const src = read(SITEMAP);
    const pageBlock = src.slice(src.indexOf('pageUrls'));
    expect(
      pageBlock.includes('p.updated_at'),
      'S-seo-sitemap RED: pageUrls must read p.updated_at for lastModified'
    ).toBe(true);
    expect(
      pageBlock.includes('lastModified: now'),
      'S-seo-sitemap RED: pageUrls still stamps bare now — use per-row updated_at'
    ).toBe(false);
  });

  it('books select-list fetches updated_at', () => {
    const src = read(BOOKS_LIB);
    expect(
      src.includes('updated_at') && src.includes('BOOKS_SELECT'),
      'S-seo-sitemap RED: BOOKS_SELECT must include updated_at'
    ).toBe(true);
    const selectIdx = src.indexOf('BOOKS_SELECT =');
    const selectBlock = selectIdx >= 0 ? src.slice(selectIdx, selectIdx + 600) : '';
    expect(
      selectBlock.includes('updated_at'),
      'S-seo-sitemap RED: BOOKS_SELECT lacks updated_at'
    ).toBe(true);
  });

  it('pages select-list fetches updated_at', () => {
    const src = read(BOOKS_LIB);
    const pagesIdx = src.indexOf('fetchPagesUncached');
    const pagesBlock = pagesIdx >= 0 ? src.slice(pagesIdx, pagesIdx + 800) : '';
    expect(
      pagesBlock.includes('updated_at'),
      'S-seo-sitemap RED: pages select must include updated_at'
    ).toBe(true);
  });

  it('revalidate=3600 kept + statics fallback unchanged', () => {
    const src = read(SITEMAP);
    expect(src.includes('revalidate = 3600'), 'revalidate must stay 3600').toBe(true);
    expect(src.includes('return statics'), 'catch fallback must still return statics').toBe(true);
    // statics keep now-based lastModified; only book/page rows switch to per-row dates
    const staticsBlock = src.slice(src.indexOf('statics'), src.indexOf('try {'));
    expect(
      staticsBlock.includes('lastModified: now'),
      'statics must keep now-based lastModified'
    ).toBe(true);
  });
});
