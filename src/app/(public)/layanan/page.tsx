import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BadgeCheck, BookMarked, Clock, LibraryBig, Users } from 'lucide-react';
import { fetchPage, fetchSettings } from '@/lib/books';
import { getSiteUrl } from '@/lib/site';
import Breadcrumb from '@/components/public/Breadcrumb';

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const s = await fetchSettings();
  const siteName = s.name ?? 'Perpustakaan';
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

const DEFAULT_SERVICES = [
  {
    icon: BookMarked,
    title: 'Peminjaman & Pengembalian',
    desc: 'Pinjam koleksi fisik dengan kartu anggota. Perpanjang masa pinjam sebelum jatuh tempo agar terhindar dari denda.',
  },
  {
    icon: LibraryBig,
    title: 'Katalog Daring (OPAC)',
    desc: 'Telusuri seluruh koleksi dari ponsel — cek ketersediaan, lokasi rak, dan status stok secara real-time.',
  },
  {
    icon: Users,
    title: 'Keanggotaan',
    desc: 'Daftar menjadi anggota untuk meminjam, mereservasi buku, dan menerima kabar kegiatan literasi.',
  },
  {
    icon: Clock,
    title: 'Reservasi & Antrean',
    desc: 'Buku yang sedang dipinjam bisa diantre. Anda akan dihubungi petugas saat eksemplar tersedia.',
  },
];

/** Layanan: render dari pages (slug 'layanan') + kartu layanan + jam operasional dinamis. */
export default async function LayananPage() {
  const [settings, page] = await Promise.all([fetchSettings(), fetchPage('layanan')]);
  const siteName = settings.name ?? 'Perpustakaan Digital';

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
      {/* Kop kartu indeks: judul + entri ringkas */}
      <header className="kartu px-5 pb-6 pt-7 sm:px-8 sm:pt-9">
        <div className="kartu-kop pb-4">
          <h1 className="font-heading text-3xl font-bold leading-[1.05] tracking-[-0.02em] text-heading sm:text-4xl">
            Layanan {siteName}
          </h1>
        </div>
        <p className="entri mt-3 text-xs uppercase tracking-[0.08em] text-ink/70 sm:text-sm">
          {DEFAULT_SERVICES.length} entri tercatat
        </p>
        <p className="mt-2 max-w-2xl text-sm text-ink/70 sm:text-base">
          {page?.excerpt ??
            'Seluruh layanan sirkulasi dan informasi — dirender dinamis dari sistem.'}
        </p>
      </header>

      {page?.content_md ? (
        <section aria-label="Deskripsi layanan" className="kartu px-5 pb-8 pt-5 sm:px-8 sm:pt-6">
          <p className="whitespace-pre-line text-sm leading-relaxed text-ink/80 sm:text-base">
            {page.content_md}
          </p>
        </section>
      ) : null}

      {/* Kartu layanan: kop + entri deskripsi, ikon dari dunia */}
      <section aria-labelledby="daftar-layanan" className="grid gap-4 sm:grid-cols-2">
        <h2 id="daftar-layanan" className="sr-only">
          Daftar layanan
        </h2>
        {DEFAULT_SERVICES.map((s, n) => (
          <div
            key={s.title}
            style={{ ['--i' as never]: n } as React.CSSProperties}
            className="kartu riffle px-5 pb-7 pt-5 sm:px-6"
          >
            <div className="kartu-kop flex items-center gap-2.5 pb-3">
              <span
                aria-hidden="true"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-brand-soft text-brand"
              >
                <s.icon className="h-5 w-5" />
              </span>
              <h3 className="font-heading text-lg font-bold leading-snug text-heading">
                {s.title}
              </h3>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-ink/80">{s.desc}</p>
          </div>
        ))}
      </section>

      {/* Kartu pengumuman alur meminjam */}
      <section aria-labelledby="alur" className="kartu lubang relative px-5 pb-10 pt-6 sm:px-8">
        <div className="kartu-kop flex items-center gap-2 pb-4">
          <BadgeCheck className="h-5 w-5 text-brand" aria-hidden="true" />
          <h2 id="alur" className="font-heading text-xl font-bold text-heading">
            Cara meminjam
          </h2>
        </div>
        <ol className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          {[
            'Temukan buku di katalog dan catat lokasi raknya.',
            'Datang dengan kartu anggota pada jam operasional.',
            'Serahkan ke petugas sirkulasi untuk diproses.',
          ].map((step, i) => (
            <li
              key={i}
              className="rounded-[var(--radius-sm)] border border-rule bg-[var(--surface)] px-4 py-4"
            >
              <span
                aria-hidden="true"
                className="entri inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-sm)] bg-brand px-2 text-sm text-surface"
              >
                {i + 1}
              </span>
              <p className="mt-2 text-ink/80">{step}</p>
            </li>
          ))}
        </ol>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/katalog"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-[var(--radius-md)] bg-brand px-5 py-2.5 text-sm font-semibold text-surface shadow-[var(--shadow-sm)] transition hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Mulai dari katalog <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link
            href="/tentang"
            className="inline-flex min-h-[44px] items-center rounded-[var(--radius-md)] border border-rule bg-[var(--surface)] px-5 py-2.5 text-sm font-semibold text-brand transition hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Tentang kami
          </Link>
        </div>
      </section>
    </div>
  );
}
