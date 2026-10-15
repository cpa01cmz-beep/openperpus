/** Loading state grup admin: skeleton tabel, bukan layar blank. */
export default function AdminLoading() {
  return (
    <div aria-busy="true" aria-label="Memuat data admin" className="grid gap-4">
      <div className="h-8 w-48 animate-pulse rounded-lg bg-[var(--ink)]/5" />
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-[var(--radius-lg)] bg-[var(--ink)]/5"
          />
        ))}
      </div>
      <div className="overflow-hidden rounded-[var(--radius-lg)] border">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-12 animate-pulse border-b bg-[var(--ink)]/5 last:border-b-0 odd:bg-[var(--ink)]/5"
          />
        ))}
      </div>
    </div>
  );
}
