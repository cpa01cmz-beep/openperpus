import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, BookOpen, Star } from 'lucide-react';
import BookCard from '@/components/public/BookCard';
import Breadcrumb from '@/components/public/Breadcrumb';
import ReserveButton from '@/components/public/ReserveButton';
import WishlistButton from '@/components/public/WishlistButton';
import { fetchBookBySlug, fetchBooks, fetchSettings, ratingNumber, stockState } from '@/lib/books';
import { coverSrc } from '@/lib/cover';
import { getSiteUrl } from '@/lib/site';

export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  // Window selaras sitemap (limit 500): detail di luar window tetap OK via ISR (revalidate 60).
  const books = await fetchBooks({ limit: 500 });
  return books.map((b) => ({ slug: b.slug }));
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const [book, settings] = await Promise.all([fetchBookBySlug(slug), fetchSettings()]);
  if (!book) return { title: 'Buku tidak ditemukan' };
  const siteName = settings.name ?? 'Perpustakaan';
  const title = `${book.title} — ${siteName}`;
  const description = book.description?.slice(0, 160) ?? `Detail buku ${book.title}.`;
  const url = `${getSiteUrl()}/katalog/${slug}`;
  const ogImage = coverSrc(book.cover_url, 640) ?? '/og-default.jpg';
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      type: 'book',
      locale: 'id_ID',
      url,
      siteName,
      images: [{ url: ogImage, alt: `Sampul ${book.title}` }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [ogImage] },
  };
}

/** Detail buku: cover, metadata, deskripsi, ketersediaan, CTA reservasi/pinjam. */
export default async function BookDetailPage({ params }: Props) {
  const { slug } = await params;
  const book = await fetchBookBySlug(slug);
  if (!book) notFound();

  const stock = stockState(book);
  const rating = ratingNumber(book.rating_avg);
  const available = (Number(book.stock_available) || 0) > 0;
  const cover = coverSrc(book.cover_url, 560) ?? '/og-default.jpg';

  const settings = await fetchSettings();
  const rawWa = settings.socials?.whatsapp?.trim() || settings.phone?.trim() || '';
  const waDigits = rawWa.replace(/\D/g, '');
  const waHref = waDigits
    ? `https://wa.me/${waDigits}?text=${encodeURIComponent(`Halo, saya mau reservasi buku "${book.title}"`)}`
    : null;

  const related = book.category_id
    ? (await fetchBooks({ categoryId: book.category_id, limit: 5 }))
        .filter((b) => b.id !== book.id)
        .slice(0, 4)
    : [];

  const tone =
    stock.tone === 'emerald' ? 'tersedia' : stock.tone === 'amber' ? 'antre' : 'dipinjam';

  const meta: { label: string; value: string }[] = [
    { label: 'Penulis', value: book.author ?? '—' },
    { label: 'Penerbit', value: book.publisher ?? '—' },
    { label: 'Tahun', value: book.year ? String(book.year) : '—' },
    { label: 'ISBN', value: book.isbn ?? '—' },
    { label: 'Halaman', value: book.pages ? `${book.pages} hlm` : '—' },
    { label: 'Bahasa', value: book.language ?? 'Indonesia' },
    {
      label: 'Lokasi rak',
      value: book.racks ? `${book.racks.code} · ${book.racks.name}` : 'Tanya petugas',
    },
  ];
  if (book.categories?.name) meta.push({ label: 'Kategori', value: book.categories.name });

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Book',
        name: book.title,
        author: book.author,
        isbn: book.isbn,
        inLanguage: book.language ?? 'id',
        image: cover ?? undefined,
        url: `${getSiteUrl()}/katalog/${slug}`,
        offers: {
          '@type': 'Offer',
          availability:
            (Number(book.stock_available) || 0) > 0
              ? 'https://schema.org/InStock'
              : 'https://schema.org/OutOfStock',
          price: '0',
          priceCurrency: 'IDR',
        },
        ...(rating > 0
          ? {
              aggregateRating: {
                '@type': 'AggregateRating',
                ratingValue: rating.toFixed(1),
                bestRating: '5',
                ratingCount: 1,
              },
            }
          : {}),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Beranda', item: getSiteUrl() },
          { '@type': 'ListItem', position: 2, name: 'Katalog', item: `${getSiteUrl()}/katalog` },
          {
            '@type': 'ListItem',
            position: 3,
            name: book.title,
            item: `${getSiteUrl()}/katalog/${slug}`,
          },
        ],
      },
    ],
  };

  return (
    <div className="space-y-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Breadcrumb
        items={[
          { label: 'Beranda', href: '/' },
          { label: 'Katalog', href: '/katalog' },
          { label: book.title },
        ]}
      />
      <Link
        href="/katalog"
        className="inline-flex min-h-[44px] items-center gap-1.5 self-start text-sm font-medium text-ink/70 transition hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Kembali ke katalog
      </Link>

      {/* Verso kartu katalog: kop ber-garis, baris entri bibliografi, cap ketersediaan */}
      <article className="kartu lubang relative px-4 pb-10 pt-5 sm:px-6 sm:pt-6">
        <div className="grid gap-5 sm:grid-cols-[240px_1fr] sm:gap-7 lg:grid-cols-[280px_1fr]">
          {/* sampul + pelat nomor panggil */}
          <div>
            <div className="pelat mb-3 flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
              <span className="entri text-xs uppercase tracking-[0.04em] opacity-70">
                Nomor panggil
              </span>
              <span className="pelat-plat">{book.racks ? book.racks.code : '—'}</span>
            </div>
            <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--rule)] bg-[var(--surface)]">
              <div className="relative aspect-[3/4] w-full bg-brand-soft">
                {book.cover_url ? (
                  <Image
                    src={cover}
                    alt={`Sampul ${book.title}`}
                    width={560}
                    height={747}
                    sizes="(max-width: 640px) 100vw, 280px"
                    priority
                    fetchPriority="high"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div
                    className="grid h-full w-full place-items-center p-6 text-center"
                    aria-hidden="true"
                  >
                    <div>
                      <BookOpen className="mx-auto h-10 w-10 text-brand" />
                      <p className="mt-2 font-heading text-lg font-bold text-heading">
                        {book.title}
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <div className="kartu-kop flex items-center justify-between gap-2 p-4">
                <span className="entri flex items-center gap-1.5 text-sm font-semibold text-[var(--ink)]">
                  <Star
                    className={`h-4 w-4 ${rating > 0 ? 'fill-accent text-accent' : 'text-ink/30'}`}
                    aria-hidden="true"
                  />
                  {rating > 0 ? `${rating.toFixed(1)} / 5` : 'Belum dinilai'}
                </span>
                <span className="stempel" data-state={tone}>
                  {stock.label}
                </span>
              </div>
            </div>
          </div>

          {/* kop judul + entri bibliografi + ketersediaan + CTA */}
          <div className="min-w-0">
            <div className="kartu-kop pb-4">
              <h1 className="font-heading text-3xl font-bold leading-[1.06] tracking-[-0.02em] text-heading sm:text-4xl">
                {book.title}
              </h1>
            </div>

            <dl className="entri mt-4 grid gap-1.5 text-sm">
              {meta.map((m) => (
                <div key={m.label} className="flex gap-4">
                  <dt className="w-28 shrink-0 text-xs uppercase tracking-[0.08em] text-ink/70">
                    {m.label}
                  </dt>
                  <dd className="min-w-0 flex-1 break-words text-[var(--ink)]" title={m.value}>
                    {m.value}
                  </dd>
                </div>
              ))}
              <div className="flex gap-4">
                <dt className="w-28 shrink-0 text-xs uppercase tracking-[0.08em] text-ink/70">
                  Stok
                </dt>
                <dd className="min-w-0 flex-1 text-[var(--ink)]">
                  {book.stock_available} tersedia / {book.stock_total} eksemplar
                </dd>
              </div>
            </dl>

            {/* CTA: 1-klik reservasi anggota (POST /api/reservations) + WA fallback */}
            <div className="mt-5 flex flex-wrap gap-3" aria-live="polite">
              <p className="w-full text-sm font-semibold text-[var(--ink)]" role="status">
                {available ? (
                  <>
                    {book.stock_available} tersedia / {book.stock_total} eksemplar — siap dipinjam
                  </>
                ) : (
                  <>Stok habis — semua {book.stock_total} eksemplar sedang dipinjam</>
                )}
              </p>
              {available ? (
                <>
                  <ReserveButton
                    bookId={book.id}
                    slug={book.slug}
                    title={book.title}
                    waHref={waHref}
                  />
                  <WishlistButton slug={book.slug} title={book.title} />
                  <Link
                    href={`/kontak?buku=${book.slug}`}
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[var(--radius-md)] border border-brand/40 bg-[var(--surface)] px-6 py-3 text-sm font-semibold text-brand transition hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    Pinjam Buku <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    disabled
                    aria-disabled="true"
                    title="Stok habis — tombol pinjam nonaktif"
                    className="inline-flex min-h-[44px] cursor-not-allowed items-center justify-center rounded-[var(--radius-md)] border border-rule bg-[var(--surface)] px-6 py-3 text-sm font-bold text-ink/50"
                  >
                    Stok Habis
                  </button>
                  <ReserveButton
                    bookId={book.id}
                    slug={book.slug}
                    title={book.title}
                    waHref={waHref}
                    variant="queue"
                  />
                </>
              )}
              {waHref && (
                <a
                  href={waHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[var(--radius-md)] border border-brand/40 bg-[var(--surface)] px-5 py-3 text-sm font-semibold text-brand transition hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  Tanya via WA
                </a>
              )}
            </div>
            <p className="mt-3 max-w-[70ch] text-xs text-ink/70">
              {available
                ? 'Peminjaman & reservasi diproses petugas sirkulasi. Bawa kartu anggota saat pengambilan.'
                : 'Semua eksemplar sedang dipinjam. Masuk antrean agar dihubungi saat buku kembali.'}
            </p>

            {book.description && (
              <section aria-labelledby="deskripsi" className="mt-6">
                <h2 id="deskripsi" className="font-heading text-xl font-bold text-heading">
                  Deskripsi
                </h2>
                <p className="mt-2 max-w-[70ch] whitespace-pre-line text-sm leading-relaxed text-ink/80 sm:text-base">
                  {book.description}
                </p>
              </section>
            )}
          </div>
        </div>
      </article>

      {related.length > 0 ? (
        <section aria-labelledby="terkait">
          <h2 id="terkait" className="font-heading text-xl font-bold text-heading sm:text-2xl">
            Buku Terkait
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            {related.map((b, n) => (
              <div
                key={b.id}
                className="riffle [&>*]:h-full"
                style={{ ['--i' as never]: n } as React.CSSProperties}
              >
                <BookCard book={b} />
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section
          aria-labelledby="terkait-kosong"
          className="kartu px-5 pb-7 pt-5 text-left sm:px-6"
        >
          <div className="kartu-kop pb-3">
            <h2 id="terkait-kosong" className="font-heading text-lg font-bold text-heading">
              Buku Terkait
            </h2>
          </div>
          <p className="entri mt-3 text-sm uppercase tracking-[0.08em] text-ink/70">
            Belum ada buku terkait
          </p>
          <p className="mt-2 max-w-sm text-sm text-ink/70">
            Jelajahi seluruh koleksi untuk menemukan bacaan lain yang tersedia.
          </p>
          <Link
            href="/katalog"
            className="mt-4 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[var(--radius-md)] bg-brand px-5 py-2.5 text-sm font-semibold text-surface shadow-[var(--shadow-sm)] transition hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Jelajahi katalog <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </section>
      )}
    </div>
  );
}
