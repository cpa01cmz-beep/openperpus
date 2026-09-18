import { BookCardSkeleton } from "@/components/public/BookCard";

/** Loading state grup publik: skeleton, bukan layar blank. */
export default function PublicLoading() {
  return (
    <div aria-busy="true" aria-label="Memuat konten" className="space-y-6">
      <div className="aspect-[16/10] w-full animate-pulse rounded-[var(--radius-lg)] bg-[var(--brand-soft)] sm:aspect-[21/9]" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <BookCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
