import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BadgeCheck, BookMarked, Clock, LibraryBig, Star, Users } from 'lucide-react';
import { fetchPage, fetchSettings } from '@/lib/books';
import { fetchServices } from '@/lib/services';
import { getSiteName } from '@/lib/settings';
import { getSiteUrl } from '@/lib/site';
import Breadcrumb from '@/components/public/Breadcrumb';

export const revalidate = 60;

const ICON_MAP: Record<string, typeof BookMarked> = {
  book: BookMarked,
  catalog: LibraryBig,
  users: Users,
  clock: Clock,
  info: BadgeCheck,
  star: Star,
};

export async function generateMetadata(): Promise<Metadata> {
  const s = await fetchSettings();
  const siteName = getSiteName(s);
  const title = `Layanan — ${siteName}`;
  const description = `Layanan sirkulasi, keanggotaan, dan fasilitas ${siteName}.`;
  const canonical = `${getSiteUrl()}/layanan`;
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

/** Layanan: render dari pages (slug 'layanan') + kartu layanan dinamis + CTA peminjaman. */
export default async function LayananPage() {
  const [services, settings, page] = await Promise.all([
    fetchServices(),
    fetchSettings(),
    fetchPage('layanan'),
  ]);
  const siteName = getSiteName(settings);

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
                name: 'Layanan',
                item: `${getSiteUrl()}/layanan`,
              },
            ],
          }),
        }}
      />
      <Breadcrumb items={[{ label: 'Beranda', href: '/' }, { label: 'Layanan' }]} />
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">
          Apa yang kami bantu
        </p>
        <h1 className="mt-1 font-heading text-3xl font-bold text-heading sm:text-4xl">
          Layanan {siteName}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500 sm:text-base">
          {page?.excerpt ??
            'Seluruh layanan sirkulasi dan informasi — dirender dinamis dari sistem.'}
        </p>
      </header>

      {page?.content_md ? (
        <section
          aria-label="Deskripsi layanan"
          className="rounded-lg border border-slate-100 bg-white p-6 shadow-sm sm:p-8"
        >
          <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600 sm:text-base">
            {page.content_md}
          </p>
        </section>
      ) : null}

      <section aria-labelledby="daftar-layanan" className="grid gap-4 sm:grid-cols-2">
        <h2 id="daftar-layanan" className="sr-only">
          Daftar layanan
        </h2>
        {services.length === 0 ? (
          <div className="rounded-lg border border-slate-100 bg-white p-6 text-sm text-slate-500 shadow-sm sm:col-span-2 sm:p-8">
            <p>Belum ada layanan yang tersedia saat ini.</p>
          </div>
        ) : (
          services.map((s) => {
            const Icon = ICON_MAP[s.icon] ?? BadgeCheck;
            return (
              <div
                key={s.id}
                className="rounded-lg border border-slate-100 bg-white p-5 shadow-sm transition hover:shadow-md sm:p-6"
              >
                <span
                  className="grid h-11 w-11 place-items-center rounded-lg bg-brand/10 text-brand"
                  aria-hidden="true"
                >
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-3 font-heading text-lg font-bold text-brand-strong">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{s.description}</p>
              </div>
            );
          })
        )}
      </section>

      <section
        aria-labelledby="alur"
        className="rounded-lg bg-brand-strong p-6 text-white shadow sm:p-8"
      >
        <h2 id="alur" className="flex items-center gap-2 font-heading text-xl font-bold">
          <BadgeCheck className="h-5 w-5 text-accent" aria-hidden="true" /> Cara meminjam
        </h2>
        <ol className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          {[
            'Temukan buku di katalog dan catat lokasi raknya.',
            'Datang dengan kartu anggota pada jam operasional.',
            'Serahkan ke petugas sirkulasi untuk diproses.',
          ].map((step, i) => (
            <li key={i} className="rounded-lg bg-white/10 p-4">
              <span
                className="grid h-8 w-8 place-items-center rounded-full bg-accent font-heading text-sm font-bold text-brand-strong"
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <p className="mt-2 text-brand-soft/90">{step}</p>
            </li>
          ))}
        </ol>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/katalog"
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-brand-strong shadow transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            Mulai dari katalog <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link
            href="/tentang"
            className="inline-flex items-center rounded-lg border border-white/30 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            Tentang kami
          </Link>
        </div>
      </section>
    </div>
  );
}
