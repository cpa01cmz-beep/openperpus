import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  Clock,
  Facebook,
  Instagram,
  Mail,
  MapPin,
  MessageCircle,
  Music2,
  Phone,
  Youtube,
} from 'lucide-react';
import { fetchBookBySlug, fetchPage, fetchSettings } from '@/lib/books';
import { getSiteUrl } from '@/lib/site';
import { sanitizeIlike } from '@/lib/search';
import Breadcrumb from '@/components/public/Breadcrumb';

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const s = await fetchSettings();
  const siteName = s.name ?? 'Perpustakaan';
  const title = `Kontak — ${siteName}`;
  const description = s.address
    ? `Hubungi ${siteName}: ${s.address}`
    : `Alamat, telepon, jam operasional, dan media sosial ${siteName}.`;
  const canonical = `${getSiteUrl()}/kontak`;
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

function hourLabel(h: Record<string, string | undefined>) {
  const hari = h.hari ?? h.day ?? '-';
  const buka = h.buka ?? h.open ?? '';
  const tutup = h.tutup ?? h.close ?? '';
  return { hari, jam: buka && tutup ? `${buka} – ${tutup}` : buka || tutup || '—' };
}

const SOCIAL_ICON: Record<string, typeof Facebook> = {
  facebook: Facebook,
  instagram: Instagram,
  youtube: Youtube,
  tiktok: Music2,
  whatsapp: MessageCircle,
};

/** Kontak: alamat/telepon/jam/sosmed 100% dari library_settings + pages (slug 'kontak'). */
export default async function KontakPage({
  searchParams,
}: {
  searchParams?: Promise<{ buku?: string | string[] }>;
}) {
  const sp = (await searchParams) ?? {};
  const rawBuku = Array.isArray(sp.buku) ? sp.buku[0] : sp.buku;
  const buku = rawBuku ? sanitizeIlike(rawBuku) : '';
  const [settings, page, book] = await Promise.all([
    fetchSettings(),
    fetchPage('kontak'),
    buku ? fetchBookBySlug(buku) : Promise.resolve(null),
  ]);
  const siteName = settings.name ?? 'Perpustakaan Digital';
  const rawWaNumber = settings.socials?.whatsapp?.trim() || settings.phone?.trim() || '';
  const waDigits = rawWaNumber.replace(/\D/g, '');
  const waHref =
    book && waDigits
      ? `https://wa.me/${waDigits}?text=${encodeURIComponent(`Halo, saya mau reservasi buku "${book.title}"`)}`
      : null;

  const hours = Array.isArray(settings.operational_hours) ? settings.operational_hours : [];
  const socialEntries = Object.entries(settings.socials ?? {}).filter(([, v]) =>
    Boolean(v?.trim?.())
  );
  const hasContact = Boolean(settings.address || settings.phone || settings.email);

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
              { '@type': 'ListItem', position: 2, name: 'Kontak', item: `${getSiteUrl()}/kontak` },
            ],
          }),
        }}
      />
      <Breadcrumb items={[{ label: 'Beranda', href: '/' }, { label: 'Kontak' }]} />
      {/* Kop kartu indeks: judul + baris entri di bawah garis kembar */}
      <header className="kartu px-5 pb-6 pt-7 sm:px-8 sm:pt-9">
        <div className="kartu-kop pb-4">
          <h1 className="font-heading text-3xl font-bold leading-[1.05] tracking-[-0.02em] text-heading sm:text-4xl">
            Kontak {siteName}
          </h1>
        </div>
        <p className="entri mt-3 text-xs uppercase tracking-[0.08em] text-ink/70 sm:text-sm">
          Hubungi kami
        </p>
        <p className="mt-2 max-w-2xl text-sm text-ink/70 sm:text-base">
          {page?.excerpt ??
            'Alamat, telepon, jam layanan, dan kanal resmi kami — kunjungi atau hubungi langsung.'}
        </p>
      </header>

      {buku &&
        (book ? (
          <section
            aria-label="Konteks reservasi"
            role="status"
            className="kartu lubang relative px-5 pb-10 pt-5 sm:px-6 sm:pt-6"
          >
            <div className="kartu-kop pb-3">
              <h2 className="font-heading text-lg font-bold text-heading">
                Reservasi: {book.title}
              </h2>
            </div>
            <p className="mt-3 text-sm text-ink/70">
              Sebutkan judul ini saat menghubungi petugas sirkulasi.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <Link
                href={`/katalog/${book.slug}`}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-[var(--radius-md)] bg-brand px-5 py-2.5 text-sm font-semibold text-surface shadow-[var(--shadow-sm)] transition hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                Lihat buku <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              {waHref ? (
                <a
                  href={waHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-[var(--radius-md)] border border-brand/40 bg-[var(--surface)] px-5 py-2.5 text-sm font-semibold text-brand transition hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <MessageCircle className="h-4 w-4" aria-hidden="true" />
                  Reservasi via WA
                </a>
              ) : (
                <p className="w-full text-sm text-ink/70">
                  Nomor WA petugas belum tersedia hubungi via telepon/email di bawah.
                </p>
              )}
            </div>
          </section>
        ) : (
          <section
            aria-label="Konteks reservasi"
            role="status"
            className="kartu bg-accent-soft px-5 pb-7 pt-5 sm:px-6 sm:pt-6"
          >
            <div className="kartu-kop border-[var(--rule-strong)] pb-3">
              <h2 className="font-heading text-lg font-bold text-heading">Buku tidak ditemukan</h2>
            </div>
            <p className="mt-3 text-sm text-ink/70">
              Judul yang Anda maksud tidak tersedia. Jelajahi katalog untuk memilih buku lain.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <Link
                href="/katalog"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-[var(--radius-md)] bg-accent px-5 py-2.5 text-sm font-semibold text-surface shadow-[var(--shadow-sm)] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                Jelajahi katalog <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </section>
        ))}

      {page?.content_md && (
        <section
          aria-label="Informasi kontak tambahan"
          className="kartu px-5 pb-8 pt-5 sm:px-8 sm:pt-6"
        >
          <p className="whitespace-pre-line text-sm leading-relaxed text-ink/80 sm:text-base">
            {page.content_md}
          </p>
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {/* alamat & kontak */}
        <section aria-labelledby="kontak-info" className="kartu px-5 pb-8 pt-6 sm:px-7">
          <div className="kartu-kop pb-3">
            <h2 id="kontak-info" className="font-heading text-xl font-bold text-heading">
              Alamat & Kontak
            </h2>
          </div>
          {hasContact ? (
            <ul className="mt-4 grid gap-2 text-sm sm:text-base">
              {settings.address && (
                <li className="flex items-start gap-2.5 py-1 text-ink/80">
                  <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
                  <span>{settings.address}</span>
                </li>
              )}
              {settings.phone && (
                <li>
                  <a
                    href={`tel:${settings.phone}`}
                    className="inline-flex min-h-[44px] items-center gap-2.5 rounded-[var(--radius-sm)] font-semibold text-brand transition hover:text-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <Phone className="h-5 w-5 shrink-0" aria-hidden="true" />
                    {settings.phone}
                  </a>
                </li>
              )}
              {settings.email && (
                <li>
                  <a
                    href={`mailto:${settings.email}`}
                    className="inline-flex min-h-[44px] items-center gap-2.5 rounded-[var(--radius-sm)] font-semibold text-brand transition hover:text-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <Mail className="h-5 w-5 shrink-0" aria-hidden="true" />
                    {settings.email}
                  </a>
                </li>
              )}
            </ul>
          ) : (
            <p className="entri mt-4 text-sm uppercase tracking-[0.08em] text-ink/70">
              Informasi kontak belum diisi admin. Silakan kembali lagi nanti.
            </p>
          )}

          {socialEntries.length > 0 && (
            <div className="mt-5 border-t border-rule pt-5">
              <h3 className="entri text-xs uppercase tracking-[0.04em] text-ink/70">
                Media sosial
              </h3>
              <ul className="mt-3 flex flex-wrap gap-2">
                {socialEntries.map(([key, url]) => {
                  const Icon = SOCIAL_ICON[key.toLowerCase()] ?? MessageCircle;
                  return (
                    <li key={key}>
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`${siteName} di ${key}`}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-[var(--radius-sm)] border border-rule bg-[var(--surface)] px-4 py-2 text-sm font-medium capitalize text-ink shadow-[var(--shadow-sm)] transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                      >
                        <Icon className="h-4 w-4 text-brand" aria-hidden="true" />
                        {key}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>

        {/* jam operasional */}
        <section aria-labelledby="kontak-jam" className="kartu px-5 pb-8 pt-6 sm:px-7">
          <div className="kartu-kop pb-3">
            <h2
              id="kontak-jam"
              className="flex items-center gap-2 font-heading text-xl font-bold text-heading"
            >
              <Clock className="h-5 w-5 text-brand" aria-hidden="true" />
              Jam Operasional
            </h2>
          </div>
          {hours.length > 0 ? (
            <ul className="batang mt-4">
              {hours.map((h, i) => {
                const { hari, jam } = hourLabel(h as Record<string, string | undefined>);
                return (
                  <li
                    key={i}
                    className="entri flex items-center justify-between gap-3 py-3 pl-7 pr-4 text-sm sm:text-base"
                  >
                    <span className="font-medium text-ink/80">{hari}</span>
                    <span className="font-semibold text-brand">{jam}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="entri mt-4 text-sm uppercase tracking-[0.08em] text-ink/70">
              Jadwal layanan menyusul — akan tampil otomatis setelah diisi admin.
            </p>
          )}
          <p className="mt-4 text-xs leading-relaxed text-ink/70">
            Layanan tutup pada hari libur nasional kecuali diumumkan lain melalui pengumuman di
            beranda.
          </p>
        </section>
      </div>

      {/* Kartu pengumuman penutup: baris entri + dua kontrol */}
      <section
        aria-labelledby="kontak-cta"
        className="kartu lubang relative px-5 pb-10 pt-6 sm:px-8"
      >
        <div className="kartu-kop pb-3">
          <h2 id="kontak-cta" className="font-heading text-xl font-bold text-heading">
            Sebelum berkunjung
          </h2>
        </div>
        <p className="mt-3 max-w-[70ch] text-sm text-ink/80 sm:text-base">
          Cek ketersediaan koleksi di katalog atau baca jawaban atas pertanyaan umum.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/katalog"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-[var(--radius-md)] bg-brand px-5 py-2.5 text-sm font-semibold text-surface shadow-[var(--shadow-sm)] transition hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Jelajahi katalog <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link
            href="/faq"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-[var(--radius-md)] border border-rule bg-[var(--surface)] px-5 py-2.5 text-sm font-semibold text-brand transition hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Lihat FAQ
          </Link>
        </div>
      </section>
    </div>
  );
}
