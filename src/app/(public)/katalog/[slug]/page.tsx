import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Building2,
  Calendar,
  Hash,
  Languages,
  MapPin,
  Star,
} from 'lucide-react';
import BookCard from '@/components/public/BookCard';
import { fetchBookBySlug, fetchBooks, fetchSettings, ratingNumber, stockState } from '@/lib/books';
import { getSiteUrl } from '@/lib/site';

export const revalidate = 60;

type Props = { params: { slug: string } };

export async function generateStaticParams() {
  const books = await fetchBooks({ limit: 100 });
  return books.map((b) => ({ slug: b.slug }));
}

export async function generateMetadata({ params }: Props) {
  const [book, settings] = await Promise.all([fetchBookBySlug(params.slug), fetchSettings()]);
  if (!book) return { title: 'Buku tidak ditemukan' };
  const siteName = settings.name ?? 'Perpustakaan';
  const title = `${book.title} — ${siteName}`;
  const description = book.description?.slice(0, 160) ?? `Detail buku ${book.title}.`;
  const url = `${getSiteUrl()}/katalog/${params.slug}`;
  const image = book.cover_url ?? '/og-default.jpg';
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
      images: [{ url: image, alt: `Sampul ${book.title}` }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

/** Detail buku: cover, metadata, deskripsi, ketersediaan, CTA reservasi/pinjam. */
export default async function BookDetailPage({ params }: Props) {
  const book = await fetchBookBySlug(params.slug);
  if (!book) notFound();

  const stock = stockState(book);
  const rating = ratingNumber(book.rating_avg);
  const available = (Number(book.stock_available) || 0) > 0;

  const related = book.category_id
    ? (await fetchBooks({ categoryId: book.category_id, limit: 5 }))
        .filter((b) => b.id !== book.id)
        .slice(0, 4)
    : [];

  const tone =
    stock.tone === 'emerald'
      ? 'bg-brand-soft text-brand border-brand-soft'
      : stock.tone === 'amber'
        ? 'bg-accent-soft text-accent border-accent-soft'
        : 'bg-rose-100 text-rose-800 border-rose-200';

  const meta: { icon: typeof Hash; label: string; value: string }[] = [
    { icon: BookOpen, label: 'Penulis', value: book.author ?? '—' },
    { icon: Building2, label: 'Penerbit', value: book.publisher ?? '—' },
    { icon: Calendar, label: 'Tahun', value: book.year ? String(book.year) : '—' },
    { icon: Hash, label: 'ISBN', value: book.isbn ?? '—' },
    { icon: BookOpen, label: 'Halaman', value: book.pages ? `${book.pages} hlm` : '—' },
    { icon: Languages, label: 'Bahasa', value: book.language ?? 'Indonesia' },
    {
      icon: MapPin,
      label: 'Lokasi rak',
      value: book.racks ? `${book.racks.code} · ${book.racks.name}` : 'Tanya petugas',
    },
  ];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Book',
    name: book.title,
    author: book.author,
    isbn: book.isbn,
    inLanguage: book.language ?? 'id',
    image: book.cover_url ?? undefined,
    url: `${getSiteUrl()}/katalog/${params.slug}`,
  };

  return (
    <div className="space-y-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Link
        href="/katalog"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--ink)]/60 transition hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Kembali ke katalog
      </Link>

      <article className="grid gap-6 sm:grid-cols-[240px_1fr] sm:gap-8 lg:grid-cols-[280px_1fr]">
        {/* cover */}
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--ink)]/10 bg-[var(--surface)] shadow-[var(--shadow-sm)]">
          <div className="relative aspect-[3/4] w-full bg-brand-soft">
            {book.cover_url ? (
              <Image
                src={book.cover_url}
                alt={`Sampul ${book.title}`}
                width={560}
                height={747}
                sizes="(max-width: 640px) 100vw, 280px"
                unoptimized
                className="h-full w-full object-cover"
              />
            ) : (
              <div
                className="grid h-full w-full place-items-center bg-gradient-to-br from-brand to-brand p-6 text-center"
                aria-hidden="true"
              >
                <div>
                  <BookOpen className="mx-auto h-10 w-10 text-accent" />
                  <p className="mt-2 font-heading text-lg font-bold text-white">{book.title}</p>
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 p-4">
            <span className="flex items-center gap-1 text-sm font-semibold text-[var(--ink)]">
              <Star
                className={`h-4 w-4 ${rating > 0 ? 'fill-accent text-accent' : 'text-[var(--ink)]/30'}`}
                aria-hidden="true"
              />
              {rating > 0 ? `${rating.toFixed(1)} / 5` : 'Belum dinilai'}
            </span>
            <span className={`rounded-full border px-3 py-1 text-xs font-bold ${tone}`}>
              {stock.label}
            </span>
          </div>
        </div>

        {/* info */}
        <div>
          {book.categories?.name && (
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand">
              {book.categories.name}
            </p>
          )}
          <h1 className="mt-1 font-heading text-3xl font-bold leading-tight text-heading sm:text-4xl">
            {book.title}
          </h1>

          <dl className="mt-5 grid grid-cols-1 gap-2.5 rounded-[var(--radius-lg)] border border-[var(--ink)]/10 bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)] sm:grid-cols-2">
            {meta.map((m) => (
              <div
                key={m.label}
                className="flex items-start gap-2.5 rounded-[var(--radius-md)] bg-[var(--brand-soft)]/60 px-3 py-2.5"
              >
                <m.icon className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                <div className="min-w-0">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink)]/50">
                    {m.label}
                  </dt>
                  <dd className="truncate text-sm font-medium text-[var(--ink)]" title={m.value}>
                    {m.value}
                  </dd>
                </div>
              </div>
            ))}
            <div className="flex items-start gap-2.5 rounded-[var(--radius-md)] bg-[var(--brand-soft)]/60 px-3 py-2.5">
              <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink)]/50">
                  Stok
                </dt>
                <dd className="text-sm font-medium text-[var(--ink)]">
                  {book.stock_available} tersedia / {book.stock_total} eksemplar
                </dd>
              </div>
            </div>
          </dl>

          {/* CTA: live journey — kontak with buku slug (petugas sirkulasi), never dead reload */}
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
                <Link
                  href={`/kontak?buku=${book.slug}`}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[var(--radius-md)] bg-brand px-6 py-3 text-sm font-bold text-white shadow transition hover:bg-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  Pinjam Buku <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link
                  href={`/kontak?buku=${book.slug}`}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[var(--radius-md)] border border-brand-soft bg-[var(--surface)] px-6 py-3 text-sm font-semibold text-brand shadow-sm transition hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  Reservasi
                </Link>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  title="Stok habis — tombol pinjam nonaktif"
                  className="inline-flex min-h-[44px] cursor-not-allowed items-center justify-center rounded-[var(--radius-md)] bg-[var(--ink)]/10 px-6 py-3 text-sm font-bold text-[var(--ink)]/50"
                >
                  Stok Habis
                </button>
                <Link
                  href={`/kontak?buku=${book.slug}`}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[var(--radius-md)] bg-accent px-6 py-3 text-sm font-bold text-brand-strong shadow transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  Masuk Antrean Reservasi
                </Link>
              </>
            )}
          </div>
          <p className="mt-3 text-xs text-[var(--ink)]/60">
            {available
              ? 'Peminjaman & reservasi diproses petugas sirkulasi. Bawa kartu anggota saat pengambilan.'
              : 'Semua eksemplar sedang dipinjam. Masuk antrean agar dihubungi saat buku kembali.'}
          </p>

          {book.description && (
            <section aria-labelledby="deskripsi" className="mt-6">
              <h2 id="deskripsi" className="font-heading text-xl font-bold text-heading">
                Deskripsi
              </h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-[var(--ink)]/80 sm:text-base">
                {book.description}
              </p>
            </section>
          )}
        </div>
      </article>

      {related.length > 0 ? (
        <section aria-labelledby="terkait">
          <h2 id="terkait" className="font-heading text-xl font-bold text-heading sm:text-2xl">
            Buku Terkait
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            {related.map((b) => (
              <BookCard key={b.id} book={b} />
            ))}
          </div>
        </section>
      ) : (
        <section
          aria-labelledby="terkait-kosong"
          className="grid place-items-center rounded-[var(--radius-lg)] border border-dashed border-[var(--ink)]/10 bg-[var(--surface)] px-6 py-10 text-center"
        >
          <h2 id="terkait-kosong" className="font-heading text-lg font-bold text-heading">
            Belum ada buku terkait
          </h2>
          <p className="mt-1 max-w-sm text-sm text-[var(--ink)]/60">
            Jelajahi seluruh koleksi untuk menemukan bacaan lain yang tersedia.
          </p>
          <Link
            href="/katalog"
            className="mt-4 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[var(--radius-lg)] bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Jelajahi katalog <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </section>
      )}
    </div>
  );
}
