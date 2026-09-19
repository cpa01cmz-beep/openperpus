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
      <div className="h-12 rounded-[var(--radius-lg)] bg-[var(--ink)]/5" />
      <div className="flex gap-2">
        <div className="h-9 w-20 rounded-full bg-[var(--ink)]/5" />
        <div className="h-9 w-24 rounded-full bg-[var(--ink)]/5" />
        <div className="h-9 w-20 rounded-full bg-[var(--ink)]/5" />
      </div>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="rounded-[var(--radius-lg)] border border-[var(--ink)]/10 bg-[var(--surface)] p-4"
        >
          <div className="h-4 w-3/4 rounded bg-[var(--ink)]/10" />
          <div className="mt-2 h-3 w-1/2 rounded bg-[var(--ink)]/5" />
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
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Bantuan</p>
        <h1 className="mt-1 font-heading text-3xl font-bold text-heading sm:text-4xl">
          Pertanyaan Umum
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500 sm:text-base">
          Jawaban cepat seputar keanggotaan, peminjaman, dan layanan {siteName}.
        </p>
      </header>

      <FaqAccordion faqs={faqs} />

      <section
        aria-labelledby="butuh-bantuan"
        className="rounded-lg bg-brand-strong p-6 text-white shadow sm:p-8"
      >
        <h2 id="butuh-bantuan" className="font-heading text-xl font-bold">
          Masih butuh bantuan?
        </h2>
        <p className="mt-2 text-sm text-brand-soft/90 sm:text-base">
          Hubungi petugas sirkulasi pada jam operasional atau kunjungi halaman kontak.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          {settings.phone && (
            <a
              href={`tel:${settings.phone}`}
              className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2.5 font-semibold transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <Phone className="h-4 w-4 text-accent" aria-hidden="true" />
              {settings.phone}
            </a>
          )}
          {settings.email && (
            <a
              href={`mailto:${settings.email}`}
              className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2.5 font-semibold transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <Mail className="h-4 w-4 text-accent" aria-hidden="true" />
              {settings.email}
            </a>
          )}
          <Link
            href="/kontak"
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 font-bold text-brand-strong shadow transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            Halaman kontak <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </div>
  );
}
