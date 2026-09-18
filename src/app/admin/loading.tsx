/** Loading state grup admin: skeleton tabel, bukan layar blank. */
export default function AdminLoading() {
  return (
    <div aria-busy="true" aria-label="Memuat data admin" className="grid gap-4">
      <div className="h-8 w-48 animate-pulse rounded-lg bg-slate-100" />
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100" />
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-12 animate-pulse border-b bg-slate-50 last:border-b-0 odd:bg-slate-100"
          />
        ))}
      </div>
    </div>
  );
}
