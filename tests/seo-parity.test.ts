import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const h1Count = (src: string) => src.match(/<h1[\s>]/g)?.length ?? 0;

/** Parse JPEG dimensions via SOF markers (no deps). Returns null if not a JPEG. */
function jpegSize(buf: Buffer): { w: number; h: number } | null {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 4 < buf.length) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = buf[i + 1] as number;
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const len = (buf as any).readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8) {
      return { h: (buf as any).readUInt16BE(i + 5), w: (buf as any).readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

const PARITY_PAGES = [
  'src/app/(public)/halaman/[slug]/page.tsx',
  'src/app/(public)/berita/page.tsx',
  'src/app/(public)/tentang/page.tsx',
  'src/app/(public)/layanan/page.tsx',
  'src/app/(public)/faq/page.tsx',
  'src/app/(public)/kontak/page.tsx',
];

const OG_REFS = [
  'src/app/layout.tsx',
  'src/app/(public)/layout.tsx',
  'src/app/(public)/page.tsx',
  'src/app/(public)/katalog/page.tsx',
  'src/app/(public)/katalog/[slug]/page.tsx',
  'src/app/(public)/berita/[slug]/page.tsx',
  'src/app/(public)/buku/[slug]/page.tsx',
];

const HERO_VARIANTS = [
  'src/components/hero/variants/ClassicHero.tsx',
  'src/components/hero/variants/SplitHero.tsx',
  'src/components/hero/variants/CenteredHero.tsx',
  'src/components/hero/variants/EditorialHero.tsx',
  'src/components/hero/variants/StackedHero.tsx',
  'src/components/hero/variants/HeroFallback.tsx',
];

/** S-seo-parity: OG asset validity, metadata parity, gated noindex, JSON-LD, LCP, sitemap. */
describe('S-seo-parity OG image', () => {
  it('every local OG image referenced in source exists under public/', () => {
    const missing: string[] = [];
    for (const f of OG_REFS) {
      const src = read(f);
      const refs = src.match(/\/og-[A-Za-z0-9-]+\.(jpg|png|webp)/g) ?? [];
      for (const r of new Set(refs)) {
        if (!existsSync(join(ROOT, 'public', r))) missing.push(`${f} -> ${r}`);
      }
    }
    expect(missing, `S-seo-parity RED: dangling OG refs: ${missing.join(', ')}`).toEqual([]);
  });

  it('public/og-default.jpg is a real 1200x630 JPEG', () => {
    const p = join(ROOT, 'public/og-default.jpg');
    expect(existsSync(p), 'S-seo-parity RED: public/og-default.jpg missing').toBe(true);
    const buf = readFileSync(p);
    expect(statSync(p).size > 10_240, 'S-seo-parity RED: og-default.jpg suspiciously small').toBe(
      true
    );
    const dim = jpegSize(buf);
    expect(dim, 'S-seo-parity RED: og-default.jpg is not a decodable JPEG').not.toBeNull();
    expect(dim?.w, 'S-seo-parity RED: OG width must be 1200').toBe(1200);
    expect(dim?.h, 'S-seo-parity RED: OG height must be 630').toBe(630);
  });
});

describe('S-seo-parity metadata', () => {
  it.each(PARITY_PAGES)('%s carries canonical + openGraph + twitter', (p) => {
    const src = read(p);
    expect(src.includes('canonical'), `S-seo-parity RED: ${p} missing alternates.canonical`).toBe(
      true
    );
    expect(src.includes('openGraph'), `S-seo-parity RED: ${p} missing openGraph`).toBe(true);
    expect(src.includes('twitter'), `S-seo-parity RED: ${p} missing twitter`).toBe(true);
    expect(
      src.includes('/og-default.jpg'),
      `S-seo-parity RED: ${p} missing OG image fallback`
    ).toBe(true);
    expect(
      src.includes('getSiteUrl()'),
      `S-seo-parity RED: ${p} must build URLs via getSiteUrl()`
    ).toBe(true);
  });
});

describe('S-seo-parity gated pages', () => {
  it('robots.ts disallows login-gated routes', () => {
    const src = read('src/app/robots.ts');
    for (const r of ['/denda', '/reservasi-saya', '/login']) {
      expect(src.includes(r), `S-seo-parity RED: robots.ts must disallow ${r}`).toBe(true);
    }
  });
});

describe('S-seo-parity JSON-LD', () => {
  it('faq page emits FAQPage JSON-LD', () => {
    const src = read('src/app/(public)/faq/page.tsx');
    expect(src.includes('application/ld+json'), 'S-seo-parity RED: faq lacks JSON-LD').toBe(true);
    expect(src.includes('FAQPage'), 'S-seo-parity RED: faq JSON-LD must be FAQPage').toBe(true);
  });

  it('homepage emits Organization/WebSite JSON-LD', () => {
    const src = read('src/app/(public)/page.tsx') + read('src/app/(public)/layout.tsx');
    expect(src.includes('application/ld+json'), 'S-seo-parity RED: home lacks JSON-LD').toBe(true);
    expect(src.includes('Organization'), 'S-seo-parity RED: home JSON-LD lacks Organization').toBe(
      true
    );
    expect(src.includes('WebSite'), 'S-seo-parity RED: home JSON-LD lacks WebSite').toBe(true);
  });

  it('berita detail emits complete NewsArticle (author/publisher/dateModified)', () => {
    const src = read('src/app/(public)/berita/[slug]/page.tsx');
    expect(src.includes('application/ld+json'), 'S-seo-parity RED: berita lacks JSON-LD').toBe(
      true
    );
    expect(
      src.includes('NewsArticle'),
      'S-seo-parity RED: berita JSON-LD must be NewsArticle'
    ).toBe(true);
    for (const k of ['author', 'publisher', 'dateModified']) {
      expect(src.includes(k), `S-seo-parity RED: NewsArticle lacks ${k}`).toBe(true);
    }
  });

  it('katalog detail emits Book with offers + aggregateRating', () => {
    const src = read('src/app/(public)/katalog/[slug]/page.tsx');
    expect(src.includes('application/ld+json'), 'S-seo-parity RED: katalog lacks JSON-LD').toBe(
      true
    );
    expect(
      src.includes("'Book'") || src.includes('"Book"'),
      'RED: katalog JSON-LD must be Book'
    ).toBe(true);
    for (const k of ['offers', 'aggregateRating']) {
      expect(src.includes(k), `S-seo-parity RED: Book JSON-LD lacks ${k}`).toBe(true);
    }
  });

  it('every hero variant renders exactly one H1', () => {
    for (const h of HERO_VARIANTS) {
      expect(h1Count(read(h)), `S-seo-parity RED: ${h} must hold exactly 1 <h1>`).toBe(1);
    }
  });
});

describe('S-seo-parity LCP', () => {
  it.each(['src/app/(public)/katalog/[slug]/page.tsx', 'src/app/(public)/berita/[slug]/page.tsx'])(
    '%s LCP image is priority with sizes',
    (p) => {
      const src = read(p);
      expect(src.includes('priority'), `S-seo-parity RED: ${p} LCP Image lacks priority`).toBe(
        true
      );
      expect(src.includes('sizes='), `S-seo-parity RED: ${p} LCP Image lacks sizes`).toBe(true);
    }
  );
});

describe('S-seo-parity sitemap', () => {
  it('static-params window covers sitemap book window (ISR documented)', () => {
    const sitemap = read('src/app/sitemap.ts');
    const detail = read('src/app/(public)/katalog/[slug]/page.tsx');
    const siteLimit = Number(sitemap.match(/fetchBooks\(\{\s*limit:\s*(\d+)/)?.[1] ?? 0);
    const staticLimit = Number(detail.match(/fetchBooks\(\{\s*limit:\s*(\d+)/)?.[1] ?? 0);
    expect(siteLimit > 0, 'S-seo-parity RED: sitemap must fetch books with a limit').toBe(true);
    expect(
      staticLimit >= siteLimit,
      `S-seo-parity RED: static params window (${staticLimit}) < sitemap window (${siteLimit})`
    ).toBe(true);
    expect(sitemap.includes('revalidate = 3600'), 'sitemap must keep revalidate 3600').toBe(true);
  });
});
