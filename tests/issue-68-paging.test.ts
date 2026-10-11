import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { parsePaging, DEFAULT_PER_PAGE, MAX_PER_PAGE } from '@/lib/paging';

// Issue #68 (perf): satu kontrak per_page (default 24, plafon 50) + count
// estimated pada koleksi berat + sanitize-html server-only. Berkas ini
// mengunci ketiganya agar tidak regresi.

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name === 'route.ts') out.push(p);
  }
  return out.sort();
}

const LIST_ROUTES = walk(join(ROOT, 'src/app/api')).filter((f) =>
  readFileSync(f, 'utf8').includes('parsePaging(')
);

describe('#68 parsePaging — satu default + satu plafon', () => {
  it('default per_page 24 tanpa param', () => {
    const p = parsePaging('http://localhost/api/books');
    expect(p.perPage).toBe(24);
    expect(p.page).toBe(1);
    expect(DEFAULT_PER_PAGE).toBe(24);
  });

  it('per_page di-clamp ke plafon 50 (bukan error) agar klien lama aman', () => {
    expect(parsePaging('http://localhost/api/books?per_page=500').perPage).toBe(MAX_PER_PAGE);
    expect(parsePaging('http://localhost/api/books?per_page=100').perPage).toBe(50);
    expect(MAX_PER_PAGE).toBe(50);
  });

  it('alias limit kompatibel + nilai tak valid jatuh ke default', () => {
    expect(parsePaging('http://localhost/api/books?limit=30').perPage).toBe(30);
    expect(parsePaging('http://localhost/api/books?per_page=abc').perPage).toBe(24);
    expect(parsePaging('http://localhost/api/books?per_page=0').perPage).toBe(24);
    // Nilai numerik tapi di bawah minimum di-clamp ke 1 (bukan default).
    expect(parsePaging('http://localhost/api/books?per_page=-5').perPage).toBe(1);
  });

  it('from/to mengikuti perPage yang sudah di-clamp', () => {
    const p = parsePaging('http://localhost/api/books?page=3&per_page=100');
    expect(p.from).toBe(100); // (3-1)*50
    expect(p.to).toBe(149);
  });
});

describe('#68 semua route list memakai default tunggal parsePaging', () => {
  it('tidak ada lagi default per-route 10/20 yang tersebar', () => {
    const offenders = LIST_ROUTES.filter((f) =>
      /parsePaging\(req\.url,\s*\d+/.test(readFileSync(f, 'utf8'))
    );
    expect(offenders.map((f) => f.slice(ROOT.length + 1))).toEqual([]);
  });

  it('setiap list route memanggil parsePaging(req.url) tanpa argumen kedua', () => {
    for (const f of LIST_ROUTES) {
      expect(
        readFileSync(f, 'utf8'),
        `${f} harus parsePaging(req.url) tanpa default lokal`
      ).toContain('parsePaging(req.url)');
    }
  });
});

describe('#68 count estimated pada koleksi berat', () => {
  // Katalog (books) sudah estimated sebelumnya; kini loans/members/fines/
  // reservations menyusul — count exact seq-scan di tabel besar.
  const cases = ['loans', 'members', 'fines', 'reservations'];
  for (const name of cases) {
    it(`GET /api/${name} memakai count estimated, bukan exact`, () => {
      const src = read(`src/app/api/${name}/route.ts`);
      const getBlock = src.slice(
        src.indexOf('export async function GET'),
        src.indexOf('export async function POST')
      );
      expect(getBlock, `GET /api/${name} harus count estimated`).toContain("count: 'estimated'");
      expect(getBlock, `GET /api/${name} tidak boleh count exact`).not.toMatch(
        /count:\s*['"]exact['"]/
      );
    });
  }

  it('katalog publik tetap plafon 50 (selaras parsePaging)', () => {
    const src = read('src/lib/books/catalog.ts');
    expect(src, 'clamp halaman katalog maks 50').not.toMatch(/Math\.min\(100/);
    // UI katalog ikut plafon yang sama (bukan 48) — satu kontrak per_page.
    const page = read('src/app/(public)/katalog/page.tsx');
    expect(page, 'halaman katalog clamp min(50, ...)').toContain(
      'Math.min(50, Math.max(1, Number(sp.per_page ?? 24) || 24))'
    );
    expect(page, 'halaman katalog tidak boleh clamp 48').not.toContain('Math.min(48');
  });
});

describe('#68 kontrak terdokumentasi', () => {
  it('openapi PerPageParam: minimum 1, maximum 50, default 24', () => {
    const spec = read('openapi.yaml');
    const block = spec.slice(spec.indexOf('PerPageParam:'), spec.indexOf('SearchParam:'));
    expect(block).toContain('maximum: 50');
    expect(block).toContain('default: 24');
    expect(block).not.toContain('maximum: 100');
    expect(block).not.toContain('default: 10');
  });

  it('docs menyebut plafon 50 + default 24', () => {
    const contract = read('docs/api-contract.md');
    expect(contract).toContain('per_page` 1–**50**');
    const arch = read('docs/architecture.md');
    expect(arch).toContain('default 24, maks 50');
  });
});

describe('#68 sanitize-html server-only (first-load JS)', () => {
  function walkSrc(dir: string): string[] {
    const out: string[] = [];
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) out.push(...walkSrc(p));
      else if (/\.tsx?$/.test(e.name)) out.push(p);
    }
    return out;
  }

  it('helper URL gambar/link tinggal di leaf validation/url.ts', () => {
    const leaf = read('src/lib/validation/url.ts');
    expect(leaf).toContain('export function isAllowedImageUrl');
    expect(leaf).toContain('export function isAllowedLinkUrl');
    expect(leaf, 'leaf tidak boleh mengimpor sanitize-html').not.toMatch(
      /from\s+['"]sanitize-html['"]/
    );
    expect(leaf, 'leaf bebas dependency (zero import)').not.toMatch(/^\s*import\s/m);
  });

  it("tidak ada berkas 'use client' yang mengimpor barrel/content ber-sanitize-html", () => {
    const offenders: string[] = [];
    for (const f of walkSrc(join(ROOT, 'src'))) {
      const src = readFileSync(f, 'utf8');
      if (!src.includes("'use client'")) continue;
      if (
        src.includes("from '@/lib/validation'") ||
        src.includes("from '@/lib/validation/content'") ||
        src.includes("from 'sanitize-html'") ||
        src.includes('from "@/lib/validation"')
      ) {
        offenders.push(f.slice(ROOT.length + 1));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('UploadInput memakai leaf validation/url', () => {
    const src = read('src/components/admin/UploadInput.tsx');
    expect(src).toContain("from '@/lib/validation/url'");
    expect(src).not.toContain("from '@/lib/validation'");
  });
});

describe('#68 preconnect storage (regresi guard)', () => {
  it('root layout men-preconnect origin Supabase', () => {
    const layout = read('src/app/layout.tsx');
    expect(layout).toContain('preconnect');
  });
});
