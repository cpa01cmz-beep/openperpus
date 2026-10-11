import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

function walkSrc(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walkSrc(p));
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

describe('#68 sisa loans GET', () => {
  it('finite guard fineRate sebelum interpolasi + fallback 0 + warn', () => {
    const src = read('src/app/api/loans/route.ts');
    expect(src).toContain('Number.isFinite(rawRate)');
    expect(src).toContain('loans.fine_rate_invalid');
  });

  it('Cache-Control no-store pada GET staff-only', () => {
    const src = read('src/app/api/loans/route.ts');
    expect(src).toContain('Cache-Control');
    expect(src).toContain('no-store');
  });

  it('loans GET select kolom sempit (bukan *) + embed member_code/title', () => {
    const src = read('src/app/api/loans/route.ts');
    // over-fetch: select('*') pada list dilarang
    expect(src).not.toMatch(/\.select\(\s*['"]\*['"]/);
    // kolom inti list + relasi yang dikonsumsi halaman sirkulasi
    expect(src).toContain(
      'id,book_id,member_id,borrowed_at,due_at,returned_at,status,fine_amount,notes'
    );
    expect(src).toContain('members(member_code)');
    expect(src).toContain('books(title)');
    // count estimated (bukan exact) tetap dipertahankan
    expect(src).toContain("{ count: 'estimated' }");
  });
});

describe('#68 katalog search 1 RTT (window count)', () => {
  it('catalog.ts memakai RPC search_books_page untuk page+total+relasi', () => {
    const src = read('src/lib/books/catalog.ts');
    expect(src).toContain("supabase.rpc('search_books_page'");
    expect(src).toContain('searchBooksPageViaRpc');
    // pola lama 2x RPC (page + total) harus hilang
    expect(src).not.toContain('searchBooksViaRpc');
    expect(src).not.toContain("rpc('search_books'");
  });

  it('search path paged tidak lagi fetch terpisah untuk total', () => {
    const src = read('src/lib/books/catalog.ts');
    const idx = src.indexOf('async function fetchBooksPagedUncached');
    expect(idx, 'fetchBooksPagedUncached must exist').toBeGreaterThanOrEqual(0);
    // Batas blok: fungsi top-level berikutnya (perbandingan '// Non-search path'
    // tidak dipakai — komentar itu juga ada di fetchBooksUncached yang lebih dulu).
    const rest = src.slice(idx);
    const nextFn = rest.slice(1).search(/\n(?:export )?(?:async )?function /);
    const block = nextFn === -1 ? rest : rest.slice(0, nextFn + 1);
    expect(block).toContain('searchBooksPageViaRpc');
    expect(block).not.toContain('searchBooksViaRpc');
  });

  it('migrasi 0031: search_books_page window count + join kategori/rak + kolom sempit', () => {
    const sql = read('supabase/migrations/0031_issue68_search_books_page.sql');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.search_books_page');
    // total satu call: window count (COUNT(*) OVER()) sebelum LIMIT/OFFSET
    expect(sql).toContain('COUNT(*) OVER ()');
    expect(sql).toContain("'total'");
    expect(sql).toContain("'books'");
    // relasi ter-join di SQL — tanpa select.in kedua
    expect(sql).toContain('public.categories');
    expect(sql).toContain('public.racks');
    // katalog publik jalan dengan anon key (RLS invoker)
    expect(sql).toContain(
      'GRANT EXECUTE ON FUNCTION public.search_books_page(text, int, int) TO anon, authenticated'
    );
    // kolom berat list tidak ikut (sempit seperti BOOKS_LIST_SELECT)
    expect(sql).not.toMatch(/b\.description/);
    expect(sql).not.toMatch(/b\.pdf_url/);
    // plafon baris tetap seperti search_books lama
    expect(sql).toContain('LEAST(GREATEST(p_limit, 1), 100)');
  });
});

describe('#71 sisa alias bilingual', () => {
  it('helper readAlias ada di api-utils + warn deprecation + ponytail header', () => {
    const src = read('src/lib/api-utils.ts');
    expect(src).toContain('export function readAlias');
    expect(src).toContain('deprecation');
    expect(src).toContain('ponytail');
  });

  it('alias limit/search tidak menyebar di luar shim paging.ts', () => {
    const offenders: string[] = [];
    for (const f of walkSrc(join(ROOT, 'src'))) {
      if (f.endsWith('src/lib/paging.ts')) continue;
      const src = readFileSync(f, 'utf8');
      if (src.includes("sp.get('limit')") || src.includes("sp.get('search')")) {
        offenders.push(f.slice(ROOT.length + 1));
      }
    }
    expect(offenders).toEqual([]);
  });

  it.skip('hapus alias limit/search di paging.ts — TERKUNCI issue-68-paging.test.ts:43 (?limit=30)', () => {
    const src = read('src/lib/paging.ts');
    expect(src).not.toContain("sp.get('limit')");
    expect(src).not.toContain("sp.get('search')");
  });
});
