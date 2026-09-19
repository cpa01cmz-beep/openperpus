import type { Metadata } from 'next';
import { BookOpenText, Eye, ListChecks, MapPin } from 'lucide-react';
import { fetchPage, fetchSettings } from '@/lib/books';
import { getSiteUrl } from '@/lib/site';
import Breadcrumb from '@/components/public/Breadcrumb';

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const s = await fetchSettings();
  const siteName = s.name ?? 'Perpustakaan';
  const title = `Tentang — ${siteName}`;
  const description = s.seo_desc ?? `Profil, visi, dan misi ${siteName}.`;
  const canonical = `${getSiteUrl()}/tentang`;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      type: 'website',
      locale: 'id_ID',
      url: canonical,
      siteName,
      images: [{ url: '/og-default.jpg', width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/og-default.jpg'],
    },
  };
}

/** Tentang: gabungan tabel pages (slug 'tentang') + library_settings (visi/misi/about). */
export default async function TentangPage() {
  const [settings, page] = await Promise.all([fetchSettings(), fetchPage('tentang')]);
  const siteName = settings.name ?? 'Perpustakaan Digital';

  const missionItems = (settings.mission ?? '')
    .split(/\r?\n/)
    .map((s) => s.replace(/^[-•*\d.)\s]+/, '').trim())
    .filter(Boolean);

  return (
    <div className="space-y-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Beranda', item: getSiteUrl() },
              {
                '@type': 'ListItem',
                position: 2,
                name: 'Tentang',
                item: `${getSiteUrl()}/tentang`,
              },
            ],
          }),
        }}
      />
      <Breadcrumb items={[{ label: 'Beranda', href: '/' }, { label: 'Tentang' }]} />
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Profil</p>
        <h1 className="mt-1 font-heading text-3xl font-bold text-heading sm:text-4xl">
          Tentang {siteName}
        </h1>
        {settings.tagline && <p className="mt-2 text-slate-500">{settings.tagline}</p>}
      </header>

      <section
        aria-labelledby="profil"
        className="rounded-lg border border-slate-100 bg-white p-6 shadow-sm sm:p-8"
      >
        <h2
          id="profil"
          className="flex items-center gap-2 font-heading text-xl font-bold text-heading"
        >
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
            Profil {siteName} belum diisi admin. Halaman ini akan terisi otomatis setelah tabel{' '}
            <code>pages</code> (slug <code>tentang</code>) atau kolom <code>about</code> dilengkapi.
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
        <section
          aria-labelledby="visi"
          className="rounded-lg bg-brand-strong p-6 text-white shadow sm:p-8"
        >
          <h2 id="visi" className="flex items-center gap-2 font-heading text-xl font-bold">
            <Eye className="h-5 w-5 text-accent" aria-hidden="true" /> Visi
          </h2>
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-brand-soft/90 sm:text-base">
            {settings.vision ?? 'Visi perpustakaan akan ditampilkan di sini setelah diisi admin.'}
          </p>
        </section>
        <section
          aria-labelledby="misi"
          className="rounded-lg border border-accent-soft bg-accent-soft p-6 shadow-sm sm:p-8"
        >
          <h2
            id="misi"
            className="flex items-center gap-2 font-heading text-xl font-bold text-heading"
          >
            <ListChecks className="h-5 w-5 text-brand" aria-hidden="true" /> Misi
          </h2>
          {missionItems.length > 0 ? (
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-slate-700 sm:text-base">
              {missionItems.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ol>
          ) : settings.mission ? (
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-700">
              {settings.mission}
            </p>
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              Misi akan ditampilkan di sini setelah diisi admin.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
