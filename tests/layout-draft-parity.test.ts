import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('layout-draft server-safety guard (regresi crash /admin/pengaturan)', () => {
  it('lib helper tanpa directive use client', () => {
    expect(read('src/lib/layout-draft.ts')).not.toMatch(/^['"]use client['"]/m);
  });

  it('page.tsx (server) mengambil buildDraft dari lib, bukan dari komponen client', () => {
    const src = read('src/app/admin/pengaturan/page.tsx');
    expect(src).toContain('@/lib/layout-draft');
    expect(src).not.toMatch(/buildDraft[^;]*from\s*['"][^'"]*LayoutPreview['"]/);
  });

  it('LayoutPicker mengambil helper dari lib, bukan dari LayoutPreview', () => {
    const src = read('src/components/admin/LayoutPicker.tsx');
    expect(src).toContain('@/lib/layout-draft');
    expect(src).not.toContain('./LayoutPreview');
  });
});

describe('buildDraft parity dengan server resolver', () => {
  it('selaras dengan getEffectiveTheme untuk semua base + override contoh', async () => {
    const { buildDraft } = await import('@/lib/layout-draft');
    const { getEffectiveTheme } = await import('@/lib/theme-overrides');
    const bases = ['emerald', 'midnight', 'paper', 'brutalist', 'ocean', 'sketch'];
    const overrides = {
      layout: {
        headerVariant: 'minimal',
        heroVariant: 'centered',
        footerVariant: 'standard',
        homepageSections: [
          { id: 'news', enabled: true, order: 0 },
          { id: 'hero', enabled: false, order: 1 },
        ],
      },
    };
    for (const b of bases) {
      const d = buildDraft(b, overrides);
      const e = getEffectiveTheme(b, overrides).layout;
      expect(d.headerVariant).toBe(e.headerVariant);
      expect(d.heroVariant).toBe(e.heroVariant);
      expect(d.footerVariant).toBe(e.footerVariant);
      expect(d.sections.map((s) => `${s.id}:${s.enabled ? 1 : 0}`).join(',')).toBe(
        e.homepageSections.map((s) => `${s.id}:${s.enabled ? 1 : 0}`).join(',')
      );
    }
  });

  it('NULL identik dengan preset', async () => {
    const { buildDraft } = await import('@/lib/layout-draft');
    const { getTheme } = await import('@/lib/themes');
    for (const b of ['emerald', 'midnight', 'paper', 'brutalist', 'ocean', 'sketch']) {
      const d = buildDraft(b, null);
      expect(d.sections.map((s) => s.id)).toEqual(
        getTheme(b).layout.homepageSections.map((s) => s.id)
      );
      expect(d.headerVariant).toBe(getTheme(b).layout.headerVariant);
    }
  });
});
