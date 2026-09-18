import { BookCopy, LibraryBig, Newspaper, Shapes } from "lucide-react";

type Props = {
  totalBooks: number;
  totalCopies: number;
  totalCategories: number;
  totalArticles: number;
};

/** Strip statistik koleksi — ikon + angka, mobile-first grid 2 kolom. */
export default function StatsBar({ totalBooks, totalCopies, totalCategories, totalArticles }: Props) {
  const items = [
    { icon: LibraryBig, value: totalBooks, label: "Judul Buku" },
    { icon: BookCopy, value: totalCopies, label: "Eksemplar" },
    { icon: Shapes, value: totalCategories, label: "Kategori" },
    { icon: Newspaper, value: totalArticles, label: "Berita & Artikel" },
  ];

  return (
    <section aria-label="Statistik perpustakaan" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {items.map((it) => (
        <div
          key={it.label}
          className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--ink)]/10 bg-[var(--surface)] p-4 shadow-sm"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius-lg)] bg-brand/10 text-brand" aria-hidden="true">
            <it.icon className="h-5 w-5" />
          </span>
          <span>
            <span className="block font-heading text-xl font-bold text-heading sm:text-2xl">
              {it.value.toLocaleString("id-ID")}
            </span>
            <span className="block text-xs text-[var(--ink)]/60">{it.label}</span>
          </span>
        </div>
      ))}
    </section>
  );
}
