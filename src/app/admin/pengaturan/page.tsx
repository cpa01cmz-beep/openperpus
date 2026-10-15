import SettingsForm from '@/components/admin/SettingsFormLazy';
import { createClient } from '@/lib/supabase/server';
import ThemeSwitcher from '@/components/admin/ThemeSwitcher';
import LayoutPicker from '@/components/admin/LayoutPicker';
import LayoutPreview from '@/components/admin/LayoutPreview';
import { buildDraft } from '@/lib/layout-draft';
import { DEFAULT_THEME } from '@/lib/themes';
import type { SettingsRow } from '@/components/admin/SettingsForm';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PengaturanPage() {
  const supabase = createClient();
  const { data } = await supabase.from('library_settings').select('*').eq('id', 1).single();
  const row = (data as Record<string, unknown> | null) ?? {};
  const current =
    typeof row.active_theme === 'string' && row.active_theme ? row.active_theme : DEFAULT_THEME;
  const rawOverrides = (row.theme_overrides as { layout?: Record<string, unknown> } | null) ?? null;
  const initialDraft = buildDraft(current, rawOverrides);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold">Pengaturan Identitas</h1>
        <p className="text-sm text-ink/60">
          Semua identitas situs bisa diatur di sini (nama, logo, kontak, SEO, tema, pengumuman).
        </p>
      </div>
      <ThemeSwitcher current={current} />
      <section aria-label="Komposisi Layout" className="grid gap-4">
        <div>
          <h2 className="text-lg font-bold">Komposisi Layout</h2>
          <p className="text-sm text-ink/60">
            Atur susunan blok tanpa mengganti tema. Hanya admin yang dapat menyimpan (librarian
            403).
          </p>
        </div>
        <LayoutPicker currentBase={current} initialOverrides={rawOverrides} />
        <LayoutPreview draft={initialDraft} />
      </section>
      <SettingsForm initial={row as SettingsRow} />
    </div>
  );
}
