import Image from "next/image";
import Link from "next/link";
import { BookOpen, Star } from "lucide-react";
import { ratingNumber, stockState, type Book } from "@/lib/types";

const toneClass: Record<string, string> = {
  emerald: "bg-brand-soft text-brand border-brand-soft",
  amber: "bg-accent-soft text-accent border-accent-soft",
  rose: "bg-rose-100 text-rose-800 border-rose-200",
};

/** Kartu buku: cover, rating, badge stok. Seluruh kartu berupa link aksesibel. */
export default function BookCard({ book }: { book: Book }) {
  const stock = stockState(book);
  const rating = ratingNumber(book.rating_avg);

  return (
    <Link
      href={`/katalog/${book.slug}`}
      aria-label={`Detail buku ${book.title}`}
      className="group flex flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--ink)]/10 bg-[var(--surface)] shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-brand-soft">
        {book.cover_url ? (
          <Image
            src={book.cover_url}
            alt={`Sampul ${book.title}`}
            width={400}
            height={533}
            sizes="(max-width:640px) 50vw, (max-width:1024px) 33vw, 20vw"
            unoptimized
            loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-gradient-to-br from-brand to-brand p-4 text-center" aria-hidden="true">
            <div>
              <BookOpen className="mx-auto h-8 w-8 text-accent" />
              <p className="mt-2 line-clamp-3 font-heading text-sm font-bold text-[var(--surface)]">{book.title}</p>
            </div>
          </div>
        )}
        <span
          className={`absolute left-2 top-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold shadow-sm ${toneClass[stock.tone]}`}
        >
          {stock.label}
        </span>
        {book.featured && (
          <span className="absolute right-2 top-2 rounded-full bg-accent px-2.5 py-1 text-[11px] font-bold text-brand-strong shadow-sm">
            Unggulan
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3 sm:p-4">
        {book.categories?.name && (
          <p className="text-[11px] font-semibold uppercase tracking-wide text-brand">
            {book.categories.name}
          </p>
        )}
        <h3 className="line-clamp-2 font-heading text-sm font-bold leading-snug text-[var(--ink)] group-hover:text-brand sm:text-base">
          {book.title}
        </h3>
        <p className="truncate text-xs text-[var(--ink)]/60 sm:text-sm">
          {book.author ?? "Penulis tidak diketahui"}
          {book.year ? ` · ${book.year}` : ""}
        </p>
        <p className="mt-auto flex items-center gap-1 pt-2 text-xs font-medium text-[var(--ink)]/70">
          <Star
            className={`h-3.5 w-3.5 ${rating > 0 ? "fill-accent text-accent" : "text-[var(--ink)]/25"}`}
            aria-hidden="true"
          />
          <span>
            {rating > 0 ? `${rating.toFixed(1)} / 5` : "Belum ada rating"}
          </span>
        </p>
      </div>
    </Link>
  );
}

/** Skeleton kartu buku untuk loading state. */
export function BookCardSkeleton() {
  return (
    <div aria-hidden="true" className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--ink)]/10 bg-[var(--surface)] shadow-sm">
      <div className="aspect-[3/4] w-full animate-pulse bg-[var(--ink)]/10" />
      <div className="space-y-2 p-4">
        <div className="h-3 w-1/3 animate-pulse rounded bg-[var(--ink)]/10" />
        <div className="h-4 w-full animate-pulse rounded bg-[var(--ink)]/10" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-[var(--ink)]/10" />
      </div>
    </div>
  );
}
