'use client';

import { useCallback, useMemo, useState } from 'react';
import { ChevronDown, Search, SearchX, X } from 'lucide-react';

export type FaqItem = {
  id: string;
  question: string;
  answer: string;
  category: string | null;
};

/** Accordion FAQ: cari + filter kategori + <details> aksesibel + empty state.
 * Single-open mode: opening one closes others.
 * Live region on answer content for screen readers. */
export default function FaqAccordion({ faqs }: { faqs: FaqItem[] }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null); // Single-open: store only one open ID

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

  // Single-open toggle: open clicked, close others
  const toggleOpen = useCallback((id: string) => {
    setOpen((current) => (current === id ? null : id));
  }, []);

  // Keyboard support: Escape to close
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, id: string) => {
      if (e.key === 'Escape' && open === id) {
        e.preventDefault();
        setOpen(null);
      }
    },
    [open]
  );

  const chipClass = (active: boolean) =>
    `tab-laci shrink-0 min-h-[44px] rounded-[var(--radius-sm)] focus-visible:outline-none focus-visible:ring-2 focus:ring-brand ${
      active
        ? 'border-brand bg-brand text-surface shadow-[var(--shadow-sm)]'
        : 'border-[var(--ink)] bg-[var(--surface)] text-[var(--ink)] hover:bg-brand-soft'
    }`;

  return (
    <div className="space-y-4">
      {/* cari — pelat laci */}
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
          className="entri min-h-[44px] w-full rounded-[var(--radius-md)] border border-[var(--ink)] bg-[var(--surface)] py-3 pl-10 pr-12 text-sm text-[var(--ink)] shadow-[var(--shadow-sm)] transition placeholder:text-[var(--ink)]/40 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ('')}
            aria-label="Hapus pencarian"
            className="absolute right-1 top-1/2 grid min-h-[44px] min-w-[44px] -translate-y-1/2 place-items-center rounded-[var(--radius-sm)] text-[var(--ink)]/40 transition hover:bg-brand-soft hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* filter kategori — tab pembatas laci */}
      {categories.length > 0 && (
        <div
          role="group"
          aria-label="Filter kategori pertanyaan"
          className="-mx-4 flex gap-0 overflow-x-auto border-b border-[var(--ink)] px-4 pb-0 sm:mx-0 sm:flex-wrap sm:px-0"
        >
          <button
            type="button"
            onClick={() => setCat(null)}
            aria-pressed={cat === null}
            className={chipClass(cat === null)}
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
                className={chipClass(active)}
              >
                {c}
              </button>
            );
          })}
        </div>
      )}

      <p role="status" aria-live="polite" className="entri text-xs text-[var(--ink)]/70">
        Menampilkan {filtered.length} dari {faqs.length} pertanyaan
        {q.trim() && (
          <>
            {' '}
            untuk “<span className="font-semibold text-[var(--ink)]">{q.trim()}</span>”
          </>
        )}
      </p>

      {(q || cat) && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] bg-brand text-surface px-5 py-2.5 text-sm font-semibold shadow-[var(--shadow-sm)] transition hover:bg-brand-strong focus:ring-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Atur ulang filter
          </button>
        </div>
      )}

      {filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map((f) => {
            const panelId = `faq-panel-${f.id}`;
            const expanded = open === f.id;
            return (
              <details
                key={f.id}
                open={expanded}
                onKeyDown={(e) => handleKeyDown(e, f.id)}
                onToggle={(e) => {
                  const detailsEl = e.target as HTMLDetailsElement;
                  if (detailsEl.open) {
                    toggleOpen(f.id);
                  } else if (open === f.id) {
                    setOpen(null);
                  }
                }}
                className="kartu group rounded-[var(--radius-md)] border border-[var(--ink)] bg-[var(--surface)] transition open:shadow-[var(--shadow-md)]"
              >
                <summary
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  className="kartu-kop flex cursor-pointer list-none items-start justify-between gap-3 rounded-[var(--radius-md)] bg-[var(--surface)] p-4 font-heading text-base font-bold text-[var(--ink)] transition hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand sm:p-5 [&::-webkit-details-marker]:hidden"
                >
                  <span>
                    {f.category && (
                      <span className="entri mb-1 block text-xs uppercase tracking-[0.05em] text-brand">
                        {f.category}
                      </span>
                    )}
                    {f.question}
                  </span>
                  <span
                    className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-sm)] border border-[var(--ink)] bg-brand-soft text-brand transition group-open:rotate-180"
                    aria-hidden="true"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </span>
                </summary>
                <div
                  id={panelId}
                  role="region"
                  aria-live="polite"
                  aria-labelledby={`faq-summary-${f.id}`}
                  className="whitespace-pre-line px-4 pb-5 text-sm leading-relaxed text-[var(--ink)]/75 sm:px-5 sm:text-base"
                >
                  {f.answer}
                </div>
              </details>
            );
          })}
        </div>
      ) : (
        <div className="grid place-items-center rounded-[var(--radius-md)] border border-dashed border-[var(--ink)] bg-[var(--surface)] px-6 py-14 text-center">
          <SearchX className="h-10 w-10 text-[var(--ink)]/30" aria-hidden="true" />
          <h2 className="mt-3 font-heading text-lg font-bold text-[var(--ink)]">
            {faqs.length === 0 ? 'Belum ada pertanyaan' : 'Tidak ada jawaban yang cocok'}
          </h2>
          <p className="mt-1 max-w-sm text-sm text-[var(--ink)]/70">
            {faqs.length === 0
              ? 'Daftar pertanyaan akan muncul di sini setelah diisi pustakawan.'
              : 'Coba kata kunci lain atau ubah kategori yang dipilih.'}
          </p>
        </div>
      )}
    </div>
  );
}
