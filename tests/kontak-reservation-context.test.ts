import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** US-1 Kontak reservation context recovery.
 * Journey-cta lane sends CTA to /kontak?buku=slug but kontak drops slug today.
 * Gherkin:
 * - valid slug shows "Reservasi: <title>" + "Lihat buku" link /katalog/slug
 * - no param keeps page unchanged
 * - invalid slug shows "Buku tidak ditemukan" + "Jelajahi katalog" /katalog
 * - banner links min-h-44px + focus ring
 * - malicious slug sanitized (no script exec)
 */
describe('US-1 kontak reservation context: valid slug banner', () => {
  it('reads searchParams buku', () => {
    const src = read('src/app/(public)/kontak/page.tsx');
    expect(src.includes('searchParams'), 'kontak must read searchParams').toBe(true);
    expect(src.includes('buku'), 'kontak must read buku param').toBe(true);
  });

  it('reuses fetchBookBySlug from @/lib/books', () => {
    const src = read('src/app/(public)/kontak/page.tsx');
    expect(src.includes('fetchBookBySlug'), 'kontak must reuse fetchBookBySlug').toBe(true);
  });

  it('valid slug shows "Reservasi:" + "Lihat buku" link to /katalog/slug', () => {
    const src = read('src/app/(public)/kontak/page.tsx');
    expect(src.includes('Reservasi:'), 'banner must show "Reservasi: <title>"').toBe(true);
    expect(src.includes('Lihat buku'), 'banner must include "Lihat buku" link').toBe(true);
    expect(
      src.includes('/katalog/${') || src.includes('`/katalog/'),
      '"Lihat buku" must link to /katalog/slug'
    ).toBe(true);
  });
});

describe('US-1 kontak reservation context: no param keeps page unchanged', () => {
  it('keeps existing kontak content when no buku param', () => {
    const src = read('src/app/(public)/kontak/page.tsx');
    // existing page landmarks must survive the banner addition
    expect(src.includes('Hubungi kami'), 'header must stay').toBe(true);
    expect(src.includes('Alamat & Kontak'), 'address section must stay').toBe(true);
    expect(src.includes('Jam Operasional'), 'hours section must stay').toBe(true);
  });

  it('banner is conditional on buku param (no banner without param)', () => {
    const src = read('src/app/(public)/kontak/page.tsx');
    // banner must only render when buku slug present — not unconditionally
    const hasConditional =
      src.includes('searchParams') &&
      src.includes('buku') &&
      (src.includes('?') || src.includes('&&')) &&
      (src.includes('Reservasi:') || src.includes('Buku tidak ditemukan'));
    expect(hasConditional, 'banner must be conditional on buku param').toBe(true);
  });
});

describe('US-1 kontak reservation context: invalid slug', () => {
  it('invalid slug shows "Buku tidak ditemukan" + "Jelajahi katalog" to /katalog', () => {
    const src = read('src/app/(public)/kontak/page.tsx');
    expect(src.includes('Buku tidak ditemukan'), 'must show "Buku tidak ditemukan"').toBe(true);
    expect(src.includes('Jelajahi katalog'), 'must include "Jelajahi katalog" fallback').toBe(true);
    expect(src.includes('href="/katalog"'), 'fallback must link to /katalog').toBe(true);
  });
});

describe('US-1 kontak reservation context: a11y touch targets', () => {
  it('banner links have min-h-[44px] touch target', () => {
    const src = read('src/app/(public)/kontak/page.tsx');
    expect(src.includes('min-h-[44px]'), 'banner links must include min-h-[44px]').toBe(true);
  });

  it('banner links have focus-visible ring', () => {
    const src = read('src/app/(public)/kontak/page.tsx');
    expect(src.includes('focus-visible:ring'), 'banner links must include focus-visible ring').toBe(
      true
    );
  });
});

describe('US-1 kontak reservation context: slug sanitization / XSS-safe', () => {
  it('sanitizes buku slug with sanitizeIlike before fetchBookBySlug', () => {
    const src = read('src/app/(public)/kontak/page.tsx');
    expect(src.includes('sanitizeIlike'), 'kontak must reuse sanitizeIlike for slug').toBe(true);
  });

  it('uses dangerouslySetInnerHTML only for static JSON-LD (never slug/title)', () => {
    const src = read('src/app/(public)/kontak/page.tsx');
    expect(src.includes('BreadcrumbList'), 'kontak JSON-LD must be static BreadcrumbList').toBe(
      true
    );
    // scope to the JSON-LD script block: user data must not enter it
    const ldStart = src.indexOf('type="application/ld+json"');
    const ldEnd = src.indexOf('</script>', ldStart);
    const ldBlock = ldStart >= 0 && ldEnd > ldStart ? src.slice(ldStart, ldEnd) : '';
    expect(
      ldBlock.includes('book.') || ldBlock.includes('book?.'),
      'slug/title must never be interpolated into JSON-LD'
    ).toBe(false);
  });

  it('never interpolates raw slug into href without katalog/slug guard', () => {
    const src = read('src/app/(public)/kontak/page.tsx');
    // raw `href={buku}` or `href={slug}` would execute malicious slugs; only /katalog/${book.slug} allowed
    const hasRawHref =
      src.includes('href={buku}') || src.includes('href={slug}') || src.includes('href={raw');
    expect(hasRawHref, 'must not interpolate raw slug into href').toBe(false);
  });
});
