import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const h1Count = (src: string) => src.match(/<h1[\s>]/g)?.length ?? 0;

const ROOT_LAYOUT = 'src/app/layout.tsx';
const PUBLIC_LAYOUT = 'src/app/(public)/layout.tsx';
const HOME_PAGE = 'src/app/(public)/page.tsx';
const KATALOG_SLUG = 'src/app/(public)/katalog/[slug]/page.tsx';
const BUKU_SLUG = 'src/app/(public)/buku/[slug]/page.tsx';
const BERITA_SLUG = 'src/app/(public)/berita/[slug]/page.tsx';

/** S-seo-meta: home h1, OG images fallback, per-slug canonical, JSON-LD Book/Article. */
describe('S-seo-meta', () => {
  it('home has exactly one h1 (hero title; page.tsx holds none)', () => {
    const n = h1Count(read(HOME_PAGE));
    expect(
      n,
      `S-seo-meta: home page.tsx has ${n} <h1> — must hold 0 (hero owns the single H1)`
    ).toBe(0);
    for (const h of [
      'src/components/hero/variants/ClassicHero.tsx',
      'src/components/hero/variants/HeroFallback.tsx',
    ]) {
      expect(h1Count(read(h)), `S-seo-meta: ${h} must hold exactly 1 <h1>`).toBe(1);
    }
  });

  it('root layout OG + Twitter images[] non-empty with /og-default.jpg fallback', () => {
    const src = read(ROOT_LAYOUT);
    expect(src.includes('images:'), 'S-seo-meta RED: layout.tsx OG/Twitter lacks images[]').toBe(
      true
    );
    expect(
      src.includes('/og-default.jpg'),
      'S-seo-meta RED: layout.tsx lacks /og-default.jpg fallback'
    ).toBe(true);
  });

  it('public layout + home metadata carry canonical + OG images', () => {
    for (const p of [PUBLIC_LAYOUT, HOME_PAGE]) {
      const src = read(p);
      expect(src.includes('canonical'), `S-seo-meta RED: ${p} missing canonical`).toBe(true);
      expect(src.includes('/og-default.jpg'), `S-seo-meta RED: ${p} missing OG fallback`).toBe(
        true
      );
    }
  });

  it('per-slug canonical on katalog, buku, berita', () => {
    for (const p of [KATALOG_SLUG, BUKU_SLUG, BERITA_SLUG]) {
      const src = read(p);
      expect(src.includes('canonical'), `S-seo-meta RED: ${p} missing per-slug canonical`).toBe(
        true
      );
      expect(
        src.includes('params.slug'),
        `S-seo-meta RED: ${p} canonical must use params.slug`
      ).toBe(true);
    }
  });

  it('JSON-LD Book on book page, Article on berita page', () => {
    const book = read(KATALOG_SLUG);
    expect(
      book.includes('application/ld+json'),
      'S-seo-meta RED: katalog page lacks JSON-LD script'
    ).toBe(true);
    expect(book.includes('Book'), 'S-seo-meta RED: katalog JSON-LD must be Book type').toBe(true);
    const art = read(BERITA_SLUG);
    expect(
      art.includes('application/ld+json'),
      'S-seo-meta RED: berita page lacks JSON-LD script'
    ).toBe(true);
    expect(art.includes('Article'), 'S-seo-meta RED: berita JSON-LD must be Article type').toBe(
      true
    );
  });

  it('home has no empty alt', () => {
    expect(read(HOME_PAGE).includes('alt=""'), 'S-seo-meta RED: home still has alt=""').toBe(false);
  });
});
