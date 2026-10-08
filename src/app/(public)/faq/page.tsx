import type { Metadata } from 'next';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ArrowRight, Mail, Phone } from 'lucide-react';
import type { FaqItem } from '@/components/public/FaqAccordion';
import { fetchSettings } from '@/lib/books';
import { getSiteUrl } from '@/lib/site';
import { createClient } from '@/lib/supabase/server';
import Breadcrumb from '@/components/public/Breadcrumb';

const FaqAccordion = dynamic(() => import('@/components/public/FaqAccordion'), {
  ssr: true,
  loading: () => <FaqSkeleton />,
});

function FaqSkeleton() {
  return (
    <div aria-hidden="true" className="animate-pulse space-y-3">
      <div className="h-11 w-full rounded-[var(--radius-md)] bg-[var(--ink)]/5" />
      <div className="flex gap-2">
        <div className="h-11 w-20 rounded-[var(--radius-sm)] bg-[var(--ink)]/5" />
        <div className="h-11 w-24 rounded-[var(--radius-sm)] bg-[var(--ink)]/5" />
        <div className="h-11 w-20 rounded-[var(--radius-sm)] bg-[var(--ink)]/5" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="kartu px-4 py-4">
          <div className="h-4 w-3/4 rounded-[var(--radius-sm)] bg-[var(--ink)]/10" />
          <div className="mt-2 h-3 w-1/2 rounded-[var(--radius-sm)] bg-[var(--ink)]/5" />
        </div>
      ))}
    </div>
  );
}

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const s = await fetchSettings();
  const siteName = s.name ?? 'Perpustakaan';
  const title = `FAQ — ${siteName}`;
  const description = `Jawaban atas pertanyaan umum seputar keanggotaan, peminjaman, dan layanan ${siteName}.`;
  const canonical = `${getSiteUrl()}/faq`;
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

/** FAQ aktif dari tabel faqs (diambil di page agar lib/ tak perlu diubah). */
async function fetchFaqs(): Promise<FaqItem[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('faqs')
      .select('id,question,answer,category')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error || !data) return [];
    return data as FaqItem[];
  } catch {
    return [];
  }
}

/** FAQ: cari + filter kategori + kartu bantuan dari settings. */
export default async function FaqPage() {
  const [settings, faqs] = await Promise.all([fetchSettings(), fetchFaqs()]);
  const siteName = settings.name ?? 'Perpustakaan Digital';
  const siteUrl = getSiteUrl();
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'FAQPage',
        name: `FAQ — ${siteName}`,
        url: `${siteUrl}/faq`,
        mainEntity: faqs.map((f) => ({
          '@type': 'Question',
          name: f.question,
          acceptedAnswer: { '@type': 'Answer', text: f.answer },
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Beranda', item: siteUrl },
          { '@type': 'ListItem', position: 2, name: 'FAQ', item: `${siteUrl}/faq` },
        ],
      },
    ],
  };

  return (
    <div className="space-y-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <Breadcrumb items={[{ label: 'Beranda', href: '/' }, { label: 'FAQ' }]} />
      {/* Kop kartu indeks: judul + entri hitungan di bawah garis */}
      <header className="kartu px-5 pb-6 pt-7 sm:px-8 sm:pt-9">
        <div className="kartu-kop pb-4">
          <h1 className="font-heading text-3xl font-bold leading-[1.05] tracking-[-0.02em] text-heading sm:text-4xl">
            Pertanyaan Umum
          </h1>
        </div>
        <p className="entri mt-3 text-xs uppercase tracking-[0.08em] text-ink/70 sm:text-sm">
          {faqs.length > 0 ? `${faqs.length} entri tercatat` : 'Belum ada entri tercatat'}
        </p>
        <p className="mt-2 max-w-2xl text-sm text-ink/70 sm:text-base">
          Jawaban cepat seputar keanggotaan, peminjaman, dan layanan {siteName}.
        </p>
      </header>

      <FaqAccordion faqs={faqs} />

      {/* Kartu pengumuman bantuan: baris entri kontak + kontrol pelat */}
      <section
        aria-labelledby="butuh-bantuan"
        className="kartu lubang relative px-5 pb-10 pt-6 sm:px-8"
      >
        <div className="kartu-kop pb-4">
          <h2 id="butuh-bantuan" className="font-heading text-xl font-bold text-heading">
            Masih butuh bantuan?
          </h2>
        </div>
        <p className="mt-3 max-w-[70ch] text-sm text-ink/80 sm:text-base">
          Hubungi petugas sirkulasi pada jam operasional atau kunjungi halaman kontak.
        </p>
        <div className="entri mt-4 grid gap-1.5 text-sm">
          {settings.phone && (
            <a
              href={`tel:${settings.phone}`}
              className="inline-flex min-h-[44px] items-center gap-2 self-start text-[var(--ink)] transition hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Phone className="h-4 w-4 text-brand" aria-hidden="true" />
              {settings.phone}
            </a>
          )}
          {settings.email && (
            <a
              href={`mailto:${settings.email}`}
              className="inline-flex min-h-[44px] items-center gap-2 self-start text-[var(--ink)] transition hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Mail className="h-4 w-4 text-brand" aria-hidden="true" />
              {settings.email}
            </a>
          )}
        </div>
        <div className="mt-4">
          <Link
            href="/kontak"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-[var(--radius-md)] bg-brand px-5 py-2.5 text-sm font-semibold text-surface shadow-[var(--shadow-sm)] transition hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Halaman kontak <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </div>
  );
}
