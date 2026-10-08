/** Loading state grup admin: skeleton tabel, bukan layar blank. */
export default function AdminLoading() {
  return (
    <div aria-busy="true" aria-label="Memuat data admin" className="grid gap-4">
      <div className="entri h-8 w-48 animate-pulse rounded-[var(--radius-sm)] bg-brand-soft/60" />
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="kartu h-20 animate-pulse bg-brand-soft/50" />
        ))}
      </div>
      <div className="kartu overflow-hidden rounded-[var(--radius-lg)]">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-12 animate-pulse border-b border-rule bg-brand-soft/30 last:border-b-0 odd:bg-brand-soft/60"
          />
        ))}
      </div>
    </div>
  );
}
