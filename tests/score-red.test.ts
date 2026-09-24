import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { sanitizeIlike } from '@/lib/search';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** tsconfig.json is JSONC (allows // comments) — strip them before JSON.parse. */
function parseJsonc(raw: string): unknown {
  const stripped = raw
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
  return JSON.parse(stripped);
}

function adminHasRawImg(): string[] {
  const hits: string[] = [];
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir)) {
      const full = join(dir, e);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (/\.(tsx|jsx)$/.test(full)) {
        const src = readFileSync(full, 'utf8');
        if (/<img[\s>]/.test(src)) hits.push(full);
      }
    }
  };
  walk(join(ROOT, 'src/app/admin'));
  walk(join(ROOT, 'src/components/admin'));
  return hits;
}

/** Wave-2 rubric: 100 minus penalties for each known gap. GREEN: all Wave2-4 fixes landed. */
function rubricScore(): { score: number; notes: string[] } {
  const notes: string[] = [];
  let score = 100;
  // Iterasi-2: fetchSettings kanonis di settings.ts (facade re-export di books.ts).
  const settingsSrc = read('src/lib/settings.ts');
  const settingsFn = settingsSrc.slice(settingsSrc.indexOf('export async function fetchSettings'));
  if (!settingsFn.includes('unstable_cache') && !settingsFn.includes('cachedFetch')) {
    score -= 10;
    notes.push('fetchSettings uncached');
  }
  const checkout = read('supabase/migrations/0005_checkout.sql').toLowerCase();
  if (!(checkout.includes('auth.uid') && checkout.includes('is_staff'))) {
    score -= 10;
    notes.push('checkout_loan no auth.uid/is_staff');
  }
  if (read('next.config.mjs').includes("hostname: '**'")) {
    score -= 10;
    notes.push('next.config https:** wildcard');
  }
  const layout = read('src/app/layout.tsx');
  if (!(layout.includes('openGraph') && layout.includes('canonical'))) {
    score -= 10;
    notes.push('layout missing openGraph/canonical');
  }
  const ts = parseJsonc(read('tsconfig.json')) as { compilerOptions?: Record<string, unknown> };
  const flags = [
    'noUncheckedIndexedAccess',
    'noUnusedLocals',
    'noUnusedParameters',
    'forceConsistentCasingInFileNames',
    'noFallthroughCasesInSwitch',
  ];
  if (!flags.every((f) => ts.compilerOptions?.[f] === true)) {
    score -= 10;
    notes.push('tsconfig missing strict flags');
  }
  // S-sec-search GREEN: no weak cleanLike remains; all entry-points use canonical sanitizeIlike.
  const entryPoints = [
    'src/lib/books/catalog.ts',
    'src/app/api/books/route.ts',
    'src/app/api/pages/route.ts',
    'src/app/api/racks/route.ts',
    'src/app/api/faqs/route.ts',
    'src/app/api/menus/route.ts',
    'src/app/api/categories/route.ts',
    'src/app/api/testimonials/route.ts',
  ];
  const weakInline = 'trim().replace(/[%(),]/g';
  const hasWeak = entryPoints.some(
    (f) => read(f).includes('cleanLike') || read(f).includes(weakInline)
  );
  if (hasWeak) {
    score -= 10;
    notes.push('weak cleanLike diverges from sanitizeIlike');
  }
  return { score, notes };
}

describe('Wave2 RED probes', () => {
  it("S-sec-search sanitizeIlike('%_[]\\\\;') escapes vs cleanLike leaves _", () => {
    // GREEN: all search entry-points use canonical sanitizeIlike; no weak cleanLike remains.
    const evil = '%_[]\\;';
    expect(sanitizeIlike(evil), 'S-sec-search: canonical sanitizeIlike must strip %_[]\\;').toBe(
      ''
    );
    const searchFiles = [
      'src/lib/books/catalog.ts',
      'src/app/api/books/route.ts',
      'src/app/api/pages/route.ts',
      'src/app/api/racks/route.ts',
      'src/app/api/faqs/route.ts',
      'src/app/api/menus/route.ts',
      'src/app/api/categories/route.ts',
      'src/app/api/testimonials/route.ts',
    ];
    for (const f of searchFiles) {
      const src = read(f);
      // sanitizeIlike untuk LIKE client-side, atau search_books RPC (server-side FTS, tanpa LIKE mentah).
      expect(
        src.includes('sanitizeIlike') || src.includes('search_books'),
        `S-sec-search GREEN: ${f} must sanitize search (sanitizeIlike or search_books RPC)`
      ).toBe(true);
      expect(
        src.includes('cleanLike'),
        `S-sec-search GREEN: ${f} must not contain weak cleanLike`
      ).toBe(false);
    }
    expect(
      read('src/lib/books/catalog.ts').includes('trim().replace(/[%(),]/g'),
      'S-sec-search GREEN: books.ts must not contain weak inline sanitizer'
    ).toBe(false);
  });

  it('S-cache fetchSettings wrapped in unstable_cache', () => {
    // Iterasi-2: kanonis di settings.ts via cachedFetch (wraps unstable_cache).
    const src = read('src/lib/settings.ts');
    const start = src.indexOf('export async function fetchSettings');
    const fn = start >= 0 ? src.slice(start) : '';
    expect(
      fn.includes('cachedFetch') || fn.includes('unstable_cache'),
      'S-cache RED: fetchSettings body has no cache — settings fetched uncached on every render'
    ).toBe(true);
    // Facade books.ts must still re-export for 18 importers.
    expect(
      read('src/lib/books.ts').includes('fetchSettings'),
      'S-cache RED: books.ts facade dropped fetchSettings re-export'
    ).toBe(true);
  });

  it('S-sec-rls checkout_loan SQL contains auth.uid/is_staff check', () => {
    const p = join(ROOT, 'supabase/migrations/0005_checkout.sql');
    expect(existsSync(p), 'S-sec-rls RED: 0005_checkout.sql absent').toBe(true);
    const sql = read('supabase/migrations/0005_checkout.sql').toLowerCase();
    expect(
      sql.includes('auth.uid') && sql.includes('is_staff'),
      'S-sec-rls RED: checkout_loan is SECURITY DEFINER with no auth.uid/is_staff staff check — any caller can decrement stock'
    ).toBe(true);
  });

  it('S-img next.config has no https:** wildcard + no <img in admin', () => {
    const rawImgs = adminHasRawImg();
    expect(
      rawImgs,
      `S-img RED: raw <img> in admin: ${rawImgs.join(', ')} — use next/image unoptimized`
    ).toEqual([]);
    const cfg = read('next.config.mjs');
    expect(
      cfg.includes("hostname: '**'"),
      'S-img RED: next.config remotePatterns still has https:** wildcard — overly permissive image host'
    ).toBe(false);
  });

  it('S-seo layout has openGraph+canonical', () => {
    const layout = read('src/app/layout.tsx');
    expect(
      layout.includes('openGraph') && layout.includes('canonical'),
      'S-seo RED: src/app/layout.tsx metadata lacks openGraph + canonical — SEO incomplete'
    ).toBe(true);
  });

  it('S-tool tsconfig has 5 strict flags', () => {
    const ts = parseJsonc(read('tsconfig.json')) as { compilerOptions?: Record<string, unknown> };
    const flags = [
      'noUncheckedIndexedAccess',
      'noUnusedLocals',
      'noUnusedParameters',
      'forceConsistentCasingInFileNames',
      'noFallthroughCasesInSwitch',
    ];
    for (const f of flags) {
      expect(ts.compilerOptions?.[f], `S-tool RED: tsconfig missing strict flag ${f}`).toBe(true);
    }
  });

  it('S-score rubric stub computes <95 on current', () => {
    const { score, notes } = rubricScore();
    expect(
      score,
      `S-score RED: rubric score ${score} < 95 (${notes.join('; ')}) — Wave 2 GREEN fixes not yet applied`
    ).toBeGreaterThanOrEqual(95);
  });
});
