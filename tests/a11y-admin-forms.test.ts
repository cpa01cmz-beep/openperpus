import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** S-a11y: admin forms use ui primitives with labels/roles/focus; badges/modal/table/tokens AA. */

describe('S-a11y admin anggota primitives', () => {
  const src = () => read('src/app/admin/anggota/page.tsx');
  it('uses ui/Input + ui/Button with explicit labels', () => {
    const s = src();
    expect(s.includes('@/components/ui/Input'), 'anggota must import ui/Input').toBe(true);
    expect(s.includes('@/components/ui/Button'), 'anggota must import ui/Button').toBe(true);
    expect(s.includes('<Input'), 'anggota must render <Input').toBe(true);
    expect(s.includes('<Button'), 'anggota must render <Button').toBe(true);
    expect(s.includes('htmlFor') || s.includes('label='), 'anggota must have explicit labels').toBe(
      true
    );
  });
  it('has no raw slate submit button', () => {
    const s = src();
    expect(s.includes('bg-slate-900'), 'anggota must not keep raw slate button').toBe(false);
  });
});

describe('S-a11y admin logs primitives', () => {
  const src = () => read('src/app/admin/logs/page.tsx');
  it('selects have htmlFor/id + filter uses primitive + Pagination', () => {
    const s = src();
    expect(s.includes('htmlFor'), 'logs selects must have htmlFor labels').toBe(true);
    expect(s.includes('id="log-'), 'logs selects must have id').toBe(true);
    expect(
      s.includes('@/components/ui/Pagination') && s.includes('<Pagination'),
      'logs must reuse ui/Pagination'
    ).toBe(true);
  });
  it('has no custom prev/next pagination links', () => {
    const s = src();
    expect(s.includes('‹ Prev'), 'logs must not keep custom Prev link').toBe(false);
    expect(s.includes('Next ›'), 'logs must not keep custom Next link').toBe(false);
  });
});

describe('S-a11y admin taxonomy primitives', () => {
  const files = [
    'src/app/admin/menu/page.tsx',
    'src/app/admin/kategori/page.tsx',
    'src/app/admin/rak/page.tsx',
    'src/app/admin/banner/page.tsx',
    'src/app/admin/konten/page.tsx',
  ];
  it.each(files)('%s uses ui primitives + labels', (f) => {
    const s = read(f);
    const usesInput = s.includes('@/components/ui/Input') || s.includes('<Input');
    const usesButton = s.includes('@/components/ui/Button') || s.includes('<Button');
    expect(usesInput || usesButton, `${f} must reuse ui primitives`).toBe(true);
    expect(
      s.includes('htmlFor') || s.includes('label=') || s.includes('aria-label'),
      `${f} must have explicit labels`
    ).toBe(true);
  });
  it.each(files)('%s has min-h 44px + focus-visible ring', (f) => {
    const s = read(f);
    // ui/Input (h-11) + ui/Button/Pagination (min-h-[44px]) guarantee 44px +
    // focus-visible ring internally; raw selects/tabs must carry literals.
    const hasPrimitive = s.includes('<Input') || s.includes('<Button') || s.includes('<Pagination');
    expect(
      hasPrimitive || s.includes('min-h-[44px]') || s.includes('h-11'),
      `${f} must meet 44px min height (primitive or literal)`
    ).toBe(true);
    expect(
      hasPrimitive || s.includes('focus-visible:ring'),
      `${f} must have focus-visible ring (primitive or literal)`
    ).toBe(true);
  });
});

describe('S-a11y BookCard badges', () => {
  const src = () => read('src/components/public/BookCard.tsx');
  it('deletes local toneClass and reuses ui/Badge', () => {
    const s = src();
    expect(s.includes('const toneClass'), 'BookCard must delete local toneClass').toBe(false);
    expect(s.includes('ui/Badge'), 'BookCard must reuse ui/Badge').toBe(true);
    expect(s.includes('<Badge'), 'BookCard must render <Badge').toBe(true);
  });
  it('amber tone meets AA (amber-800 on amber-100)', () => {
    const badge = read('src/components/ui/Badge.tsx');
    expect(badge.includes('border-amber-200 bg-amber-100 text-amber-800')).toBe(true);
    const s = src();
    // no low-contrast accent-soft text-accent combo for stock
    expect(s.includes('text-accent border-accent-soft')).toBe(false);
    expect(s.includes('bg-accent-soft text-accent')).toBe(false);
  });
  it('Unggulan badge meets 4.5:1 (no accent bg + brand-strong text)', () => {
    const s = src();
    expect(
      s.includes('bg-accent') && s.includes('text-brand-strong'),
      'Unggulan must not use low-contrast accent/brand-strong combo'
    ).toBe(false);
  });
});

describe('S-a11y Modal focus management', () => {
  const src = () => read('src/components/ui/Modal.tsx');
  it('has Tab focus-trap inside dialog', () => {
    const s = src();
    expect(s.includes('Tab'), 'Modal must handle Tab trap').toBe(true);
    expect(
      s.includes('querySelectorAll') || s.includes('focusable'),
      'Modal must cycle focusables'
    ).toBe(true);
  });
  it('returns focus to trigger on close', () => {
    const s = src();
    expect(
      s.includes('activeElement'),
      'Modal must capture trigger via activeElement for return-focus'
    ).toBe(true);
    // cleanup restores focus (focus() in effect cleanup/close path)
    const focusCount = (s.match(/\.focus\(\)/g) ?? []).length;
    expect(focusCount >= 2, 'Modal must focus on open + return focus on close').toBe(true);
  });
  it('keeps Escape + overlay close + autofocus, close-button size untouched', () => {
    const s = src();
    expect(s.includes('Escape'), 'Modal must keep Escape close').toBe(true);
    expect(s.includes('e.target === e.currentTarget'), 'Modal must keep overlay close').toBe(true);
    expect(s.includes('closeRef'), 'Modal must keep autofocus ref').toBe(true);
    expect(
      s.includes('rounded-sm p-2'),
      'Modal close-button size/padding must stay (Mobile owns)'
    ).toBe(true);
  });
});

describe('S-a11y DataTable caption', () => {
  const src = () => read('src/components/admin/DataTable.tsx');
  it('has optional caption prop used for sr-only caption', () => {
    const s = src();
    expect(s.includes('caption?: string'), 'DataTable must add optional caption prop').toBe(true);
    expect(s.includes('{caption}'), 'DataTable must render caption prop').toBe(true);
    expect(s.includes('sr-only'), 'DataTable caption must stay sr-only').toBe(true);
  });
  it('keeps scope=col, empty role=status, overflow wrapper', () => {
    const s = src();
    expect(s.includes('scope="col"'), 'DataTable must keep scope=col').toBe(true);
    expect(s.includes('role="status"'), 'DataTable must keep empty role=status').toBe(true);
    expect(s.includes('overflow-x-auto'), 'DataTable must keep overflow wrapper').toBe(true);
  });
});

describe('S-a11y DataTable dynamic captions', () => {
  const files: Record<string, string> = {
    'src/app/admin/anggota/page.tsx': 'Daftar anggota',
    'src/app/admin/menu/page.tsx': 'Daftar menu',
    'src/app/admin/kategori/page.tsx': 'Daftar kategori',
    'src/app/admin/rak/page.tsx': 'Daftar rak',
    'src/app/admin/banner/page.tsx': 'Daftar banner',
    'src/app/admin/konten/page.tsx': 'Daftar konten',
  };
  it.each(Object.keys(files))('%s passes dynamic caption to DataTable', (f) => {
    const s = read(f);
    const label = files[f] ?? '';
    expect(s.includes('caption={'), `${f} must pass caption prop to DataTable`).toBe(true);
    expect(
      s.includes('halaman') && s.includes('totalPages'),
      `${f} caption must be dynamic (halaman X dari totalPages)`
    ).toBe(true);
    expect(s.includes(label), `${f} caption must start with "${label}"`).toBe(true);
  });
  it('no admin DataTable falls back to static default caption', () => {
    for (const f of Object.keys(files)) {
      const s = read(f);
      expect(
        s.includes('<DataTable') && s.includes('caption={'),
        `${f} must not omit caption`
      ).toBe(true);
    }
  });
});

describe('S-a11y banner pagination + empty-state', () => {
  const src = () => read('src/app/admin/banner/page.tsx');
  it('reuses ui/Pagination footer with page state', () => {
    const s = src();
    expect(s.includes('@/components/ui/Pagination'), 'banner must import ui/Pagination').toBe(true);
    expect(s.includes('<Pagination'), 'banner must render <Pagination footer').toBe(true);
    expect(s.includes('totalPages'), 'banner must track totalPages').toBe(true);
    expect(s.includes('onPageChange'), 'banner Pagination must wire onPageChange').toBe(true);
  });
  it('follows buku/reservasi empty-state pattern', () => {
    const s = src();
    expect(
      s.includes('emptyText=') || s.includes('Belum ada banner'),
      'banner DataTable must set emptyText (reservasi pattern)'
    ).toBe(true);
  });
});

describe('S-a11y SettingsForm accessible ids', () => {
  const src = () => read('src/components/admin/SettingsForm.tsx');
  it('every input/textarea has explicit id + htmlFor', () => {
    const s = src();
    expect(s.includes('htmlFor='), 'SettingsForm labels must use htmlFor').toBe(true);
    expect(s.includes('id="settings-'), 'SettingsForm controls must have settings-* ids').toBe(
      true
    );
    const inputs = s.match(/<input/g) ?? [];
    const ids = s.match(/id="settings-/g) ?? [];
    const textareas = s.match(/<textarea/g) ?? [];
    expect(
      ids.length >= inputs.length + textareas.length,
      `every input (${inputs.length}) + textarea (${textareas.length}) needs settings-* id (found ${ids.length})`
    ).toBe(true);
  });
  it('controls expose aria-invalid + aria-describedby (BookForm/Input pattern)', () => {
    const s = src();
    expect(s.includes('aria-invalid'), 'SettingsForm must expose aria-invalid').toBe(true);
    expect(s.includes('aria-describedby'), 'SettingsForm must expose aria-describedby').toBe(true);
  });
});

describe('S-a11y theme tokens (no hardcoded hex)', () => {
  it('ReserveButton + katalog detail + kontak use brand tokens, no WA hex', () => {
    for (const f of [
      'src/components/public/ReserveButton.tsx',
      'src/app/(public)/katalog/[slug]/page.tsx',
      'src/app/(public)/kontak/page.tsx',
    ]) {
      const s = read(f);
      expect(s.includes('#25D366'), `${f} must not contain hardcoded #25D366`).toBe(false);
      expect(s.includes('#128C4B'), `${f} must not contain hardcoded #128C4B`).toBe(false);
    }
  });
  it('StackedHero uses ink/brand tokens, no hardcoded #111110/black', () => {
    const s = read('src/components/hero/variants/StackedHero.tsx');
    expect(s.includes('#111110'), 'StackedHero must not contain hardcoded #111110').toBe(false);
    expect(s.includes('bg-black'), 'StackedHero must not contain bg-black').toBe(false);
    expect(
      s.includes('var(--ink)') || s.includes('border-ink') || s.includes('bg-ink'),
      'StackedHero must use ink token'
    ).toBe(true);
  });
});

describe('S-a11y form status announcement', () => {
  it('SettingsForm err/msg announced via role=alert/status', () => {
    const s = read('src/components/admin/SettingsForm.tsx');
    expect(s.includes('role="alert"'), 'SettingsForm err must have role=alert').toBe(true);
    expect(s.includes('role="status"'), 'SettingsForm msg must have role=status').toBe(true);
  });
  it('BookForm select/textarea have focus ring + aria-invalid/describedby', () => {
    const s = read('src/components/admin/BookForm.tsx');
    expect(s.includes('focus-visible:ring'), 'BookForm controls must have focus ring').toBe(true);
    expect(s.includes('aria-invalid'), 'BookForm select/textarea must have aria-invalid').toBe(
      true
    );
    expect(
      s.includes('aria-describedby'),
      'BookForm select/textarea must have aria-describedby'
    ).toBe(true);
  });
});
