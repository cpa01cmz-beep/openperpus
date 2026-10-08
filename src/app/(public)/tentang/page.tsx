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
      {/* Kop kartu indeks: nama perpustakaan + baris entri tagline di bawah garis */}
      <header className="kartu px-5 pb-6 pt-7 sm:px-8 sm:pt-9">
        <div className="kartu-kop pb-4">
          <h1 className="font-heading text-3xl font-bold leading-[1.05] tracking-[-0.02em] text-heading sm:text-4xl">
            Tentang {siteName}
          </h1>
        </div>
        {settings.tagline && (
          <p className="entri mt-3 text-xs uppercase tracking-[0.08em] text-ink/70 sm:text-sm">
            {settings.tagline}
          </p>
        )}
      </header>

      <section aria-labelledby="profil" className="kartu px-5 pb-8 pt-6 sm:px-8">
        <div className="kartu-kop flex items-center gap-2 pb-4">
          <BookOpenText className="h-5 w-5 text-brand" aria-hidden="true" />
          <h2 id="profil" className="font-heading text-xl font-bold text-heading">
            Profil Singkat
          </h2>
        </div>
        {page?.content_md ? (
          <p className="mt-4 max-w-[70ch] whitespace-pre-line text-sm leading-relaxed text-ink/80 sm:text-base">
            {page.content_md}
          </p>
        ) : settings.about ? (
          <p className="mt-4 max-w-[70ch] whitespace-pre-line text-sm leading-relaxed text-ink/80 sm:text-base">
            {settings.about}
          </p>
        ) : (
          <p className="entri mt-4 max-w-[70ch] text-sm leading-relaxed text-ink/70">
            Profil {siteName} belum diisi admin. Halaman ini akan terisi otomatis setelah tabel{' '}
            <code>pages</code> (slug <code>tentang</code>) atau kolom <code>about</code> dilengkapi.
          </p>
        )}
        {settings.address && (
          <p className="entri mt-4 flex items-start gap-2 text-sm text-ink/80">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
            {settings.address}
          </p>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Visi: kartu pengumuman + entri */}
        <section aria-labelledby="visi" className="kartu lubang relative px-5 pb-10 pt-6 sm:px-7">
          <div className="kartu-kop flex items-center gap-2 pb-4">
            <Eye className="h-5 w-5 text-brand" aria-hidden="true" />
            <h2 id="visi" className="font-heading text-xl font-bold text-heading">
              Visi
            </h2>
          </div>
          <p className="mt-4 max-w-[70ch] whitespace-pre-line text-sm leading-relaxed text-ink/80 sm:text-base">
            {settings.vision ?? 'Visi perpustakaan akan ditampilkan di sini setelah diisi admin.'}
          </p>
        </section>
        {/* Misi: kartu laci + daftar entri bernomor */}
        <section aria-labelledby="misi" className="kartu px-5 pb-8 pt-6 sm:px-7">
          <div className="kartu-kop flex items-center gap-2 pb-4">
            <ListChecks className="h-5 w-5 text-brand" aria-hidden="true" />
            <h2 id="misi" className="font-heading text-xl font-bold text-heading">
              Misi
            </h2>
          </div>
          {missionItems.length > 0 ? (
            <ol className="mt-4 grid gap-1.5 text-sm leading-relaxed text-ink/80 sm:text-base">
              {missionItems.map((m, i) => (
                <li key={i} className="flex gap-4">
                  <span aria-hidden="true" className="shrink-0 opacity-60">
                    {String(i + 1).padStart(2, '0')}.
                  </span>
                  <span>{m}</span>
                </li>
              ))}
            </ol>
          ) : settings.mission ? (
            <p className="mt-4 max-w-[70ch] whitespace-pre-line text-sm leading-relaxed text-ink/80">
              {settings.mission}
            </p>
          ) : (
            <p className="entri mt-4 text-sm text-ink/70">
              Misi akan ditampilkan di sini setelah diisi admin.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
