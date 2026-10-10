import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// #61: satu bentuk pagination di semua API. Setiap list GET membalas
// { data, pagination: { page, limit, total, totalPages } } — envelope `meta`
// lama (page/per_page/total) dihapus dari route + spec + klien; klien tidak
// lagi menambal fallback ganda `pagination?.totalPages ?? meta?.totalPages`.

const ROOT = process.cwd();

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

describe('#61 single pagination envelope', () => {
  it('covers every paginated route module', () => {
    // Detektor perubahan: route baru yang paginasi wajib mengikuti kontrak ini.
    expect(LIST_ROUTES).toHaveLength(14);
  });

  it('every list route emits pagination and no meta envelope', () => {
    for (const f of LIST_ROUTES) {
      const src = readFileSync(f, 'utf8');
      expect(src, `${f} must emit pagination envelope`).toContain(
        'pagination: { page, limit: perPage, total'
      );
      expect(src, `${f} must not emit legacy meta envelope`).not.toContain(
        'meta: { page, per_page'
      );
    }
  });

  it('openapi PaginatedResponse documents only {data, pagination}', () => {
    const spec = readFileSync(join(ROOT, 'openapi.yaml'), 'utf8');
    const block = spec.slice(spec.indexOf('PaginatedResponse:'), spec.indexOf('Article:'));
    expect(block).toContain('required: [data, pagination]');
    expect(block).not.toContain('per_page');
  });

  it('no client reads json.meta as a pagination fallback', () => {
    const offenders: string[] = [];
    const scan = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) scan(p);
        else if (/\.tsx?$/.test(e.name)) {
          const src = readFileSync(p, 'utf8');
          if (src.includes('json.meta')) offenders.push(p.slice(ROOT.length + 1));
        }
      }
    };
    scan(join(ROOT, 'src'));
    expect(offenders).toEqual([]);
  });
});
