import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ARTIKEL_EDIT = 'src/app/admin/artikel/edit/[id]/page.tsx';
const BANNER_EDIT = 'src/app/admin/banner/edit/[id]/page.tsx';

function read(p: string): string {
  return readFileSync(join(process.cwd(), p), 'utf8');
}

describe('S1 admin edit pages', () => {
  it('artikel edit page exists', () => {
    expect(
      existsSync(join(process.cwd(), ARTIKEL_EDIT)),
      `RED: ${ARTIKEL_EDIT} missing — no edit flow for artikel`,
    ).toBe(true);
  });

  it('banner edit page exists', () => {
    expect(
      existsSync(join(process.cwd(), BANNER_EDIT)),
      `RED: ${BANNER_EDIT} missing — no edit flow for banner`,
    ).toBe(true);
  });

  it('artikel edit form loads by id, PUT saves, error text inline', () => {
    const src = read(ARTIKEL_EDIT);
    for (const field of ['title', 'content_md', 'excerpt', 'cover_url', 'category', 'status']) {
      expect(src, `artikel edit must expose field ${field}`).toContain(field);
    }
    expect(src, 'artikel edit must fetch by id').toMatch(/params\.id|props.*params|\[id\]/);
    expect(src, 'artikel edit must PUT save').toMatch(/method:\s*["']PUT["']/);
    expect(src, 'artikel edit must target /api/articles').toContain('/api/articles');
    expect(src, 'artikel edit must show error inline').toMatch(/err|error/i);
    expect(src, 'artikel edit must navigate back + refresh').toMatch(/router\.push|router\.refresh/);
  });

  it('banner edit form loads by id, PUT saves, error text inline', () => {
    const src = read(BANNER_EDIT);
    for (const field of ['title', 'subtitle', 'image_url', 'link', 'sort_order', 'is_active']) {
      expect(src, `banner edit must expose field ${field}`).toContain(field);
    }
    expect(src, 'banner edit must fetch by id').toMatch(/params\.id|props.*params|\[id\]/);
    expect(src, 'banner edit must PUT save').toMatch(/method:\s*["']PUT["']/);
    expect(src, 'banner edit must target /api/banners').toContain('/api/banners');
    expect(src, 'banner edit must show error inline').toMatch(/err|error/i);
    expect(src, 'banner edit must navigate back + refresh').toMatch(/router\.push|router\.refresh/);
  });

  it('list pages link to edit routes', () => {
    const artikel = read('src/app/admin/artikel/page.tsx');
    const banner = read('src/app/admin/banner/page.tsx');
    expect(artikel, 'artikel list must link to edit route').toMatch(/artikel\/edit|href=.*edit/);
    expect(artikel, 'artikel list must show Edit label').toMatch(/Edit/);
    expect(banner, 'banner list must link to edit route').toMatch(/banner\/edit|href=.*edit/);
    expect(banner, 'banner list must show Edit label').toMatch(/Edit/);
  });
});
