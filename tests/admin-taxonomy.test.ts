import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

function read(p: string): string {
  return readFileSync(join(ROOT, p), 'utf8');
}

// S-issue-60: dialog konfirmasi hapus harus inline (ConfirmModal), bukan
// window.confirm() native — konsisten dengan panel sirkulasi.
describe('admin taxonomy pages (S1)', () => {
  for (const p of [
    'src/app/admin/kategori/page.tsx',
    'src/app/admin/rak/page.tsx',
    'src/app/admin/menu/page.tsx',
    'src/app/admin/layanan/page.tsx',
    'src/app/admin/banner/page.tsx',
    'src/app/admin/artikel/page.tsx',
    'src/app/admin/buku/page.tsx',
    'src/app/admin/anggota/page.tsx',
  ]) {
    it(`${p} konfirmasi hapus via ConfirmModal (bukan confirm() native)`, () => {
      const src = read(p);
      expect(src, `${p} harus impor ConfirmModal`).toContain('ConfirmModal');
      expect(src, `${p} tidak boleh memakai confirm() native`).not.toContain('confirm(');
      expect(src, `${p} tidak boleh memakai alert() native`).not.toContain('alert(');
    });
  }

  it('kategori page exists and uses /api/categories', () => {
    const p = 'src/app/admin/kategori/page.tsx';
    expect(existsSync(join(ROOT, p)), `${p} missing`).toBe(true);
    const src = read(p);
    expect(src).toContain('/api/categories');
  });

  it('rak page exists and uses /api/racks', () => {
    const p = 'src/app/admin/rak/page.tsx';
    expect(existsSync(join(ROOT, p)), `${p} missing`).toBe(true);
    const src = read(p);
    expect(src).toContain('/api/racks');
  });

  it('menu page exists and uses /api/menus', () => {
    const p = 'src/app/admin/menu/page.tsx';
    expect(existsSync(join(ROOT, p)), `${p} missing`).toBe(true);
    const src = read(p);
    expect(src).toContain('/api/menus');
  });

  it('Sidebar links the three taxonomy pages', () => {
    const src = read('src/components/admin/Sidebar.tsx');
    expect(src).toContain('/admin/kategori');
    expect(src).toContain('/admin/rak');
    expect(src).toContain('/admin/menu');
  });
});
