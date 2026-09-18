import { createClient } from "@/lib/supabase/server";
import SettingsForm from "@/components/admin/SettingsForm";
import ThemeSwitcher from "@/components/admin/ThemeSwitcher";

export default async function PengaturanPage() {
  const supabase = createClient();
  const { data } = await supabase.from("library_settings").select("*").eq("id", 1).single();
  const row = (data as Record<string, unknown> | null) ?? {};
  const current =
    typeof row.active_theme === "string" && row.active_theme ? row.active_theme : "emerald";

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold">Pengaturan Identitas</h1>
        <p className="text-sm text-slate-500">Semua identitas situs bisa diatur di sini (nama, logo, kontak, SEO, tema, pengumuman).</p>
      </div>
      <ThemeSwitcher current={current} />
      <SettingsForm initial={row} />
    </div>
  );
}
