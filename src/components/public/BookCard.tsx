import type { CSSProperties } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { BookOpen, Star } from 'lucide-react';
import { ratingNumber, stockState, type Book } from '@/lib/types';
import { coverSrc } from '@/lib/cover';
import Badge from '@/components/ui/Badge';
import WishlistButton from '@/components/public/WishlistButton';

/** Kartu katalog: kop judul diketik, baris entri, nomor panggil, stempel
 *  ketersediaan (menekan saat kartu hover/fokus), lubang bor. */
export default function BookCard({ book, index = 0 }: { book: Book; index?: number }) {
  const stock = stockState(book);
  const rating = ratingNumber(book.rating_avg);
  const cover = coverSrc(book.cover_url, 400) ?? book.cover_url;
  const callNo = book.racks?.code ?? book.isbn ?? '—';

  return (
    <div className="flex flex-col gap-2">
      <Link
        href={`/katalog/${book.slug}`}
        aria-label={`Detail buku ${book.title}`}
        style={{ ['--i' as never]: index } as CSSProperties}
        className="kartu lubang riffle group relative flex flex-col overflow-hidden border-[var(--ink)] bg-[var(--surface)] rounded-[var(--radius-md)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <div className="relative aspect-[3/4] w-full overflow-hidden border-b border-[var(--ink)] bg-brand-soft">
          {cover ? (
            <Image
              src={cover}
              alt={`Sampul ${book.title}`}
              width={400}
              height={533}
              sizes="(max-width:640px) 50vw, (max-width:1024px) 33vw, 20vw"
              loading="lazy"
              fetchPriority="low"
              decoding="async"
              className="h-full w-full object-cover transition duration-300"
            />
          ) : (
            <div
              className="grid h-full w-full place-items-center p-4 text-center"
              aria-hidden="true"
            >
              <div>
                <BookOpen className="mx-auto h-8 w-8 text-accent" />
                <p className="mt-2 line-clamp-3 font-heading text-sm font-bold text-[var(--ink)]">
                  {book.title}
                </p>
              </div>
            </div>
          )}
          {book.featured && (
            <Badge
              tone="slate"
              className="absolute right-2 top-2 rounded-[var(--radius-sm)] border-[var(--ink)] bg-[var(--ink)] font-bold text-[var(--surface)] shadow-sm"
            >
              Unggulan
            </Badge>
          )}
        </div>

        <div className="kartu-kop flex flex-1 flex-col gap-1 bg-[var(--surface)] p-3 sm:p-4">
          <div className="entri flex items-baseline justify-between gap-2 text-xs uppercase tracking-[0.08em] text-brand">
            <span className="min-w-0 leading-tight">
              {book.categories?.name ?? 'Tanpa kategori'}
            </span>
            <span className="shrink-0 text-[var(--ink)]/50">{callNo}</span>
          </div>
          <h3 className="line-clamp-2 font-heading text-sm font-bold leading-snug text-[var(--ink)] group-hover:text-brand sm:text-base">
            {book.title}
          </h3>
          <p className="entri text-xs leading-snug text-[var(--ink)]/75">
            {book.author ?? 'Penulis tidak diketahui'}
            {book.year ? ` · ${book.year}` : ''}
          </p>
          <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2">
            <span className="stempel" data-state={stock.tone === 'rose' ? 'dipinjam' : undefined}>
              {stock.label}
            </span>
            <p className="entri flex items-center gap-1 text-xs text-[var(--ink)]/70">
              <Star
                className={`h-3.5 w-3.5 ${rating > 0 ? 'fill-accent text-accent' : 'text-[var(--ink)]/25'}`}
                aria-hidden="true"
              />
              <span>{rating > 0 ? `${rating.toFixed(1)} / 5` : 'Belum ada rating'}</span>
            </p>
          </div>
        </div>
      </Link>
      <WishlistButton slug={book.slug} title={book.title} />
    </div>
  );
}

/** Skeleton kartu katalog untuk loading state. */
export function BookCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="kartu lubang overflow-hidden rounded-[var(--radius-md)] border border-[var(--ink)] bg-[var(--surface)]"
    >
      <div className="aspect-[3/4] w-full animate-pulse bg-[var(--ink)]/10" />
      <div className="kartu-kop space-y-2 p-4">
        <div className="entri h-3 w-1/3 animate-pulse bg-[var(--ink)]/10" />
        <div className="h-4 w-full animate-pulse bg-[var(--ink)]/10" />
        <div className="entri h-3 w-2/3 animate-pulse bg-[var(--ink)]/10" />
      </div>
    </div>
  );
}
