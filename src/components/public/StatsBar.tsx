import { BookCopy, LibraryBig, Newspaper, Shapes } from 'lucide-react';

type Props = {
  totalBooks: number;
  totalCopies: number;
  totalCategories: number;
  totalArticles: number;
};

/** Strip statistik koleksi — satu baris ledger: label entri + angka tabular,
 *  mobile-first grid 2 kolom di atas strip bergaris. */
export default function StatsBar({
  totalBooks,
  totalCopies,
  totalCategories,
  totalArticles,
}: Props) {
  const items = [
    { icon: LibraryBig, value: totalBooks, label: 'Judul Buku' },
    { icon: BookCopy, value: totalCopies, label: 'Eksemplar' },
    { icon: Shapes, value: totalCategories, label: 'Kategori' },
    { icon: Newspaper, value: totalArticles, label: 'Berita & Artikel' },
  ];

  return (
    <section
      aria-label="Statistik perpustakaan"
      className="grid grid-cols-2 gap-x-6 gap-y-0 rounded-[var(--radius-md)] border border-[var(--ink)] bg-[var(--surface)] px-4 shadow-[var(--shadow-sm)] sm:grid-cols-4"
    >
      {items.map((it, i) => (
        <div
          key={it.label}
          className={`flex items-baseline justify-between gap-3 py-3 ${
            i > 0 ? 'border-t border-[var(--ink)] sm:border-t-0 sm:border-l sm:pl-4' : ''
          }`}
        >
          <span className="flex min-w-0 items-baseline gap-2">
            <it.icon
              className="h-3.5 w-3.5 shrink-0 translate-y-0.5 text-brand"
              aria-hidden="true"
            />
            <span className="entri text-xs uppercase leading-tight tracking-[0.05em] text-[var(--ink)]/70">
              {it.label}
            </span>
          </span>
          <span className="entri shrink-0 text-base font-bold text-[var(--ink)] sm:text-lg">
            {it.value.toLocaleString('id-ID')}
          </span>
        </div>
      ))}
    </section>
  );
}
