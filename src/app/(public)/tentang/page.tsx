import { BookOpenText, Eye, ListChecks, MapPin } from "lucide-react";
import { fetchPage, fetchSettings } from "@/lib/books";

export const revalidate = 60;

export async function generateMetadata() {
  const s = await fetchSettings();
  return {
    title: `Tentang — ${s.name ?? "Perpustakaan"}`,
    description: s.seo_desc ?? `Profil, visi, dan misi ${s.name ?? "perpustakaan"}.`,
  };
}

/** Tentang: gabungan tabel pages (slug 'tentang') + library_settings (visi/misi/about). */
export default async function TentangPage() {
  const [settings, page] = await Promise.all([fetchSettings(), fetchPage("tentang")]);
  const siteName = settings.name ?? "Perpustakaan Digital";

  const missionItems = (settings.mission ?? "")
    .split(/\r?\n/)
    .map((s) => s.replace(/^[-•*\d.)\s]+/, "").trim())
    .filter(Boolean);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Profil</p>
        <h1 className="mt-1 font-heading text-3xl font-bold text-heading sm:text-4xl">
          Tentang {siteName}
        </h1>
        {settings.tagline && <p className="mt-2 text-slate-500">{settings.tagline}</p>}
      </header>

      <section aria-labelledby="profil" className="rounded-lg border border-slate-100 bg-white p-6 shadow-sm sm:p-8">
        <h2 id="profil" className="flex items-center gap-2 font-heading text-xl font-bold text-heading">
          <BookOpenText className="h-5 w-5 text-brand" aria-hidden="true" /> Profil Singkat
        </h2>
        {page?.content_md ? (
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-600 sm:text-base">
            {page.content_md}
          </p>
        ) : settings.about ? (
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-600 sm:text-base">
            {settings.about}
          </p>
        ) : (
          <p className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
            Profil {siteName} belum diisi admin. Halaman ini akan terisi otomatis setelah
            tabel <code>pages</code> (slug <code>tentang</code>) atau kolom <code>about</code> dilengkapi.
          </p>
        )}
        {settings.address && (
          <p className="mt-4 flex items-start gap-2 text-sm text-slate-600">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
            {settings.address}
          </p>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <section aria-labelledby="visi" className="rounded-lg bg-brand-strong p-6 text-white shadow sm:p-8">
          <h2 id="visi" className="flex items-center gap-2 font-heading text-xl font-bold">
            <Eye className="h-5 w-5 text-accent" aria-hidden="true" /> Visi
          </h2>
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-brand-soft/90 sm:text-base">
            {settings.vision ?? "Visi perpustakaan akan ditampilkan di sini setelah diisi admin."}
          </p>
        </section>
        <section aria-labelledby="misi" className="rounded-lg border border-accent-soft bg-accent-soft p-6 shadow-sm sm:p-8">
          <h2 id="misi" className="flex items-center gap-2 font-heading text-xl font-bold text-heading">
            <ListChecks className="h-5 w-5 text-brand" aria-hidden="true" /> Misi
          </h2>
          {missionItems.length > 0 ? (
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-slate-700 sm:text-base">
              {missionItems.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ol>
          ) : settings.mission ? (
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-700">{settings.mission}</p>
          ) : (
            <p className="mt-3 text-sm text-slate-500">Misi akan ditampilkan di sini setelah diisi admin.</p>
          )}
        </section>
      </div>
    </div>
  );
}
