import SettingsForm from '@/components/admin/SettingsFormLazy';
import { createClient } from '@/lib/supabase/server';
import ThemeSwitcher from '@/components/admin/ThemeSwitcher';
import type { SettingsRow } from '@/components/admin/SettingsForm';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PengaturanPage() {
  const supabase = createClient();
  const { data } = await supabase.from('library_settings').select('*').eq('id', 1).single();
  const row = (data as Record<string, unknown> | null) ?? {};
  const current =
    typeof row.active_theme === 'string' && row.active_theme ? row.active_theme : 'emerald';

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="kartu-kop pb-3 font-heading text-2xl font-bold text-heading">
          Pengaturan Identitas
        </h1>
        <p className="text-sm text-ink/70">
          Semua identitas situs bisa diatur di sini (nama, logo, kontak, SEO, tema, pengumuman).
        </p>
      </div>
      <ThemeSwitcher current={current} />
      <SettingsForm initial={row as SettingsRow} />
    </div>
  );
}
