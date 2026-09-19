'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, Search, SearchX, X } from 'lucide-react';

export type FaqItem = {
  id: string;
  question: string;
  answer: string;
  category: string | null;
};

/** Accordion FAQ: cari + filter kategori + <details> aksesibel + empty state. */
export default function FaqAccordion({ faqs }: { faqs: FaqItem[] }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string | null>(null);

  const categories = useMemo(
    () => Array.from(new Set(faqs.map((f) => f.category).filter(Boolean))) as string[],
    [faqs]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return faqs.filter((f) => {
      if (cat && f.category !== cat) return false;
      if (!needle) return true;
      return `${f.question} ${f.answer}`.toLowerCase().includes(needle);
    });
  }, [faqs, q, cat]);

  const reset = () => {
    setQ('');
    setCat(null);
  };

  return (
    <div className="space-y-4">
      {/* cari */}
      <div className="relative">
        <label htmlFor="cari-faq" className="sr-only">
          Cari pertanyaan
        </label>
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink)]/40"
          aria-hidden="true"
        />
        <input
          id="cari-faq"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari pertanyaan, mis. “denda”, “anggota”…"
          autoComplete="off"
          className="w-full rounded-[var(--radius-lg)] border border-[var(--ink)]/10 bg-[var(--surface)] py-3 pl-10 pr-10 text-sm text-[var(--ink)] shadow-sm transition placeholder:text-[var(--ink)]/40 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ('')}
            aria-label="Hapus pencarian"
            className="absolute right-2.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-[var(--ink)]/40 transition hover:bg-[var(--ink)]/10 hover:text-[var(--ink)]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* filter kategori */}
      {categories.length > 0 && (
        <div
          role="group"
          aria-label="Filter kategori pertanyaan"
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
        >
          <button
            type="button"
            onClick={() => setCat(null)}
            aria-pressed={cat === null}
            className={`shrink-0 min-h-[44px] rounded-full border px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
              cat === null
                ? 'border-brand bg-brand text-white shadow'
                : 'border-[var(--ink)]/10 bg-[var(--surface)] text-[var(--ink)]/70 hover:border-brand hover:text-brand'
            }`}
          >
            Semua
          </button>
          {categories.map((c) => {
            const active = cat === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCat(active ? null : c)}
                aria-pressed={active}
                className={`shrink-0 min-h-[44px] rounded-full border px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                  active
                    ? 'border-brand bg-brand text-white shadow'
                    : 'border-[var(--ink)]/10 bg-[var(--surface)] text-[var(--ink)]/70 hover:border-brand hover:text-brand'
                }`}
              >
                {c}
              </button>
            );
          })}
        </div>
      )}

      <p role="status" aria-live="polite" className="text-xs text-[var(--ink)]/60">
        Menampilkan {filtered.length} dari {faqs.length} pertanyaan
        {q.trim() && (
          <>
            {' '}
            untuk “<span className="font-semibold text-[var(--ink)]/80">{q.trim()}</span>”
          </>
        )}
      </p>

      {filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map((f) => (
            <details
              key={f.id}
              className="group rounded-[var(--radius-lg)] border border-[var(--ink)]/10 bg-[var(--surface)] shadow-sm transition open:shadow-md"
            >
              <summary className="flex cursor-pointer list-none items-start justify-between gap-3 rounded-[var(--radius-lg)] p-4 font-heading text-base font-bold text-heading transition hover:bg-brand-soft/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand sm:p-5 [&::-webkit-details-marker]:hidden">
                <span>
                  {f.category && (
                    <span className="mb-1 block font-sans text-[11px] font-semibold uppercase tracking-wide text-brand">
                      {f.category}
                    </span>
                  )}
                  {f.question}
                </span>
                <span
                  className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand/10 text-brand transition group-open:rotate-180"
                  aria-hidden="true"
                >
                  <ChevronDown className="h-4 w-4" />
                </span>
              </summary>
              <p className="whitespace-pre-line px-4 pb-4 text-sm leading-relaxed text-[var(--ink)]/70 sm:px-5 sm:pb-5 sm:text-base">
                {f.answer}
              </p>
            </details>
          ))}
        </div>
      ) : (
        <div className="grid place-items-center rounded-[var(--radius-lg)] border border-dashed border-[var(--ink)]/10 bg-[var(--surface)] px-6 py-14 text-center">
          <SearchX className="h-10 w-10 text-[var(--ink)]/25" aria-hidden="true" />
          <h2 className="mt-3 font-heading text-lg font-bold text-[var(--ink)]">
            {faqs.length === 0 ? 'Belum ada pertanyaan' : 'Tidak ada jawaban yang cocok'}
          </h2>
          <p className="mt-1 max-w-sm text-sm text-[var(--ink)]/60">
            {faqs.length === 0
              ? 'Daftar pertanyaan akan muncul di sini setelah diisi pustakawan.'
              : 'Coba kata kunci lain atau ubah kategori yang dipilih.'}
          </p>
          {(q || cat) && (
            <button
              type="button"
              onClick={reset}
              className="mt-4 rounded-[var(--radius-lg)] bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              Atur ulang filter
            </button>
          )}
        </div>
      )}
    </div>
  );
}
