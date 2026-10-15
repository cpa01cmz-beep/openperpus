import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { stockState, type Book } from '@/lib/types';
import { coverSrc } from '@/lib/cover';

/** Kartu katalog ala kartu produk toko-shopee: badge miring, spec,
 *  baris ketersediaan, CTA hard-shadow. "Harga" dipetakan ke stok. */
function BazaarBookCard({ book }: { book: Book }) {
  const stock = stockState(book);
  const cover = coverSrc(book.cover_url, 400) ?? book.cover_url;
  const spec = [book.author ?? 'Penulis tidak diketahui', book.year ? `${book.year}` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <article className="relative flex flex-col overflow-hidden rounded-[var(--radius-md)] border-2 border-[var(--ink)] bg-[var(--surface)] shadow-[var(--shadow-lg)] transition hover:-translate-y-1 focus-within:-translate-y-1">
      <div className="relative aspect-[16/9] w-full overflow-hidden border-b-2 border-[var(--ink)] bg-brand-soft">
        {cover ? (
          <Image
            src={cover}
            alt={`Sampul ${book.title}`}
            width={400}
            height={300}
            sizes="(max-width:640px) 100vw, (max-width:1024px) 50vw, 33vw"
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className="grid h-full w-full place-items-center bg-gradient-to-br from-brand to-brand-strong p-4 text-center font-heading text-sm font-bold uppercase text-[var(--surface)]"
            aria-hidden="true"
          >
            {book.title}
          </div>
        )}
        <span className="absolute left-3 top-3 inline-flex -rotate-2 items-center rounded-full border-2 border-[var(--ink)] bg-[var(--surface)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-brand shadow-[var(--shadow-sm)]">
          {stock.label}
        </span>
      </div>
      <h3 className="px-5 pt-4 font-heading text-base font-bold uppercase leading-tight text-heading">
        <Link
          href={`/katalog/${book.slug}`}
          className="rounded transition hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {book.title}
        </Link>
      </h3>
      <p className="px-5 text-sm text-[var(--ink)]/65">{spec}</p>
      <p className="mx-5 mt-3 border-t-2 border-dashed border-[var(--ink)]/25 pt-2.5 text-lg font-bold text-heading">
        {book.stock_available > 0 ? `Tersedia ${book.stock_available} eks.` : 'Sedang dipinjam'}
      </p>
      <Link
        href={`/katalog/${book.slug}`}
        aria-label={`Pinjam ${book.title}`}
        className="m-5 mt-3 inline-flex min-h-[44px] items-center justify-center rounded-lg border-2 border-[var(--ink)] bg-accent px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-white shadow-[0_3px_0_0_var(--ink)] transition hover:translate-y-[1px] hover:shadow-[0_2px_0_0_var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        Pinjam Sekarang
      </Link>
    </article>
  );
}

/** Section katalog bazaar: grup kategori + kartu produk.
 *  Dipakai via registry override saat theme aktif `bazaar`. */
export default function BazaarCatalog({ books }: { books: Book[] }) {
  const groups = new Map<string, Book[]>();
  for (const b of books.slice(0, 8)) {
    const key = b.categories?.name?.trim() || 'Lainnya';
    const list = groups.get(key) ?? [];
    list.push(b);
    groups.set(key, list);
  }

  return (
    <section aria-labelledby="bazaar-katalog">
      <h2
        id="bazaar-katalog"
        className="font-heading text-[clamp(1.75rem,_1.2rem_+_2.5vw,_2.75rem)] font-bold uppercase leading-[1.05] tracking-[-0.01em] text-heading"
      >
        Katalog
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-[var(--ink)]/65 sm:text-base">
        Satu perpus, semua kebutuhan bacamu. Semua gratis dipinjam, tanpa biaya tersembunyi.
      </p>
      {groups.size > 0 ? (
        <div className="mt-6 grid gap-8">
          {[...groups.entries()].map(([name, list]) => (
            <div key={name}>
              <h3 className="flex flex-wrap items-baseline gap-3 border-b-[3px] border-[var(--ink)] pb-2 font-heading text-[clamp(1.5rem,_1.2rem_+_1.5vw,_2rem)] font-bold uppercase text-heading">
                {name}
                <span className="rounded-full bg-brand px-2.5 py-1 font-body text-[11px] font-bold uppercase tracking-wide text-white">
                  {list.length} buku
                </span>
              </h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((b) => (
                  <BazaarBookCard key={b.id} book={b} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-[var(--radius-md)] border-2 border-dashed border-[var(--ink)]/25 bg-[var(--surface)] px-6 py-12 text-center text-sm text-[var(--ink)]/65">
          Koleksi unggulan belum tersedia. Silakan jelajahi{' '}
          <Link href="/katalog" className="font-semibold text-brand underline">
            katalog
          </Link>
          .
        </div>
      )}
      <div className="mt-6 text-center">
        <Link
          href="/katalog"
          className="inline-flex min-h-[48px] items-center gap-2 rounded-[10px] border-2 border-[var(--ink)] bg-accent px-6 py-3 text-sm font-bold uppercase tracking-wide text-white shadow-[0_4px_0_0_var(--ink)] transition hover:translate-y-[2px] hover:shadow-[0_2px_0_0_var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          Lihat Semua Buku <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
