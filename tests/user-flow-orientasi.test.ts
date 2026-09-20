import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/**
 * User Flow & Orientasi: public borrowing journey discoverability.
 * - Reservasi/Denda discoverable from nav
 * - Breadcrumbs on all public routes
 * - Empty states guide back to katalog
 * - ReserveButton primary CTA, CMS banner.link validated with /katalog fallback
 */

describe('user-flow nav links', () => {
  const shared = () => read('src/components/layout/variants/shared.tsx');

  it('LINKS contains Reservasi Saya + Denda Saya', () => {
    const src = shared();
    expect(src.includes('/reservasi-saya'), 'LINKS must include /reservasi-saya').toBe(true);
    expect(src.includes('/denda'), 'LINKS must include /denda').toBe(true);
  });

  it('FOOTER_LINKS contains Reservasi Saya + Denda Saya', () => {
    const src = shared();
    const footerBlock = src.slice(src.indexOf('FOOTER_LINKS'));
    expect(
      footerBlock.includes('/reservasi-saya'),
      'FOOTER_LINKS must include /reservasi-saya'
    ).toBe(true);
    expect(footerBlock.includes('/denda'), 'FOOTER_LINKS must include /denda').toBe(true);
  });

  it('every new nav href maps to a route file', () => {
    const src = shared();
    const hrefs = [...src.matchAll(/href:\s*'([^']+)'/g)].map((m) => m[1] ?? '');
    const internal = hrefs.filter((h) => h.startsWith('/') && !h.startsWith('//'));
    for (const h of internal) {
      if (!h) continue;
      const base = h.split('?')[0] ?? '/';
      const candidates = [
        `src/app/(public)${base}/page.tsx`,
        `src/app${base}/page.tsx`,
        `src/app/(public)${base}.tsx`,
      ];
      // '/' maps to (public)/page.tsx
      const exists = candidates.some((c) => {
        try {
          read(c);
          return true;
        } catch {
          return false;
        }
      });
      expect(exists, `nav href ${h} must map to a route file`).toBe(true);
    }
  });
});

describe('user-flow breadcrumbs per public route', () => {
  const routes: Array<{ file: string; label: string }> = [
    { file: 'src/app/(public)/kontak/page.tsx', label: 'Kontak' },
    { file: 'src/app/(public)/faq/page.tsx', label: 'FAQ' },
    { file: 'src/app/(public)/layanan/page.tsx', label: 'Layanan' },
    { file: 'src/app/(public)/tentang/page.tsx', label: 'Tentang' },
    { file: 'src/app/(public)/denda/page.tsx', label: 'Denda' },
    { file: 'src/app/(public)/berita/page.tsx', label: 'Berita' },
    { file: 'src/app/(public)/berita/[slug]/page.tsx', label: 'Berita detail' },
    { file: 'src/app/(public)/katalog/page.tsx', label: 'Katalog' },
  ];

  for (const r of routes) {
    it(`${r.label} renders Breadcrumb`, () => {
      const src = read(r.file);
      expect(src.includes('<Breadcrumb'), `${r.file} must render <Breadcrumb`).toBe(true);
      const startsAtHome =
        src.includes("href: '/'") || src.includes('href: "/"') || src.includes('href="/"');
      expect(startsAtHome, `${r.file} breadcrumb must start at Beranda /`).toBe(true);
    });
  }

  it('static pages include BreadcrumbList JSON-LD', () => {
    for (const f of [
      'src/app/(public)/kontak/page.tsx',
      'src/app/(public)/faq/page.tsx',
      'src/app/(public)/layanan/page.tsx',
      'src/app/(public)/tentang/page.tsx',
      'src/app/(public)/berita/page.tsx',
    ]) {
      const src = read(f);
      expect(src.includes('BreadcrumbList'), `${f} must include BreadcrumbList JSON-LD`).toBe(true);
    }
  });
});

describe('user-flow empty-state CTAs', () => {
  it('reservasi-saya empties link to /katalog', () => {
    const src = read('src/app/(public)/reservasi-saya/page.tsx');
    expect(
      src.includes('Jelajahi katalog'),
      'empty states must guide back with Jelajahi katalog CTA'
    ).toBe(true);
    expect(src.includes('href="/katalog"'), 'empty-state CTA must href /katalog').toBe(true);
  });

  it('denda empty state links to /katalog', () => {
    const src = read('src/app/(public)/denda/page.tsx');
    expect(src.includes('href="/katalog"'), 'denda empty state must link back to /katalog').toBe(
      true
    );
  });
});

describe('user-flow detail CTA order', () => {
  it('ReserveButton is primary (first) CTA, Pinjam secondary', () => {
    const src = read('src/app/(public)/katalog/[slug]/page.tsx');
    const reserveIdx = src.indexOf('<ReserveButton');
    const pinjamIdx = src.indexOf('/kontak?buku=');
    expect(reserveIdx, 'detail must render <ReserveButton').toBeGreaterThanOrEqual(0);
    expect(pinjamIdx, 'detail must keep /kontak?buku= secondary link').toBeGreaterThanOrEqual(0);
    expect(
      reserveIdx < pinjamIdx,
      'ReserveButton must come BEFORE Pinjam link (primary by order)'
    ).toBe(true);
  });

  it('buku/[slug] alias redirect stays intact', () => {
    const src = read('src/app/(public)/buku/[slug]/page.tsx');
    expect(src.includes('permanentRedirect'), 'alias must keep permanentRedirect').toBe(true);
    expect(src.includes('/katalog/'), 'alias must redirect to canonical /katalog/[slug]').toBe(
      true
    );
  });
});

describe('user-flow CMS banner link validation', () => {
  it('CenteredHero sanitizes banner.link against internal route map', () => {
    const src = read('src/components/hero/variants/CenteredHero.tsx');
    expect(
      src.includes('resolveBannerHref') || src.includes('safeBannerHref'),
      'CenteredHero must validate banner.link via resolver'
    ).toBe(true);
    expect(src.includes('bannerHref'), 'CenteredHero must use sanitized bannerHref').toBe(true);
    expect(
      src.includes('active.link ??'),
      'CenteredHero must not pass raw CMS banner.link straight to href'
    ).toBe(false);
    const resolver = read('src/lib/banner-link.ts');
    expect(resolver.includes("'/katalog'"), 'invalid banner.link must fall back to /katalog').toBe(
      true
    );
  });

  it('banner link resolver falls back for external/unknown links', () => {
    const candidates = [
      'src/lib/banner-link.ts',
      'src/components/hero/variants/bannerLink.ts',
      'src/components/hero/variants/CenteredHero.tsx',
    ];
    let found = '';
    for (const c of candidates) {
      try {
        found = read(c);
        if (found.includes('resolveBannerHref') || found.includes('/katalog')) break;
      } catch {
        /* next */
      }
    }
    expect(found.includes('/katalog'), 'resolver must define /katalog fallback').toBe(true);
    // external + javascript: must never pass through
    expect(
      found.includes('http') && found.includes('/katalog'),
      'resolver must handle external links with fallback'
    ).toBe(true);
  });
});
