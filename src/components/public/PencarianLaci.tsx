'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';

export type PencarianKategori = { id: string; name: string };

type Props = {
  siteName: string;
  tagline?: string | null;
  categories?: PencarianKategori[];
  className?: string;
};

/**
 * Pelat depan laci: kop surat (kartu indeks) + tab pembatas laci
 * + satu kolom pencarian kerja ke /katalog. Server-safe, tanpa state klien.
 * Hanya memakai parameter yang dibaca /katalog: q, kategori, tersedia, sort, page.
 */
export default function PencarianLaci({
  siteName,
  tagline,
  categories = [],
  className = '',
}: Props) {
  const tabs = categories.slice(0, 3);
  /* Kontrak FIRST VIEWPORT: tab membawa q yang sedang diketik. */
  const [q, setQ] = useState('');
  const hrefKategori = (id?: string) => {
    const p = new URLSearchParams();
    if (id) p.set('kategori', id);
    const needle = q.trim();
    if (needle) p.set('q', needle);
    const qs = p.toString();
    return qs ? `/katalog?${qs}` : '/katalog';
  };

  return (
    <div className={`grid gap-4 ${className}`}>
      {/* Kop surat: nama + tagline sebagai baris entri, nomor panggil kiri-atas */}
      <div
        className="kartu lubang riffle relative px-5 pb-10 pt-6 sm:px-8 sm:pt-8"
        style={{ ['--i' as never]: 0 } as React.CSSProperties}
      >
        <span
          aria-hidden="true"
          className="entri absolute left-4 top-4 border border-[var(--rule-strong)] px-1.5 py-0.5 text-xs uppercase tracking-[0.04em] opacity-70 sm:left-6 sm:top-6"
        >
          020 ABA
        </span>
        <span aria-hidden="true" className="stempel absolute right-4 top-4 sm:right-6 sm:top-6">
          OPAC
        </span>
        <div className="kartu-kop pb-4 sm:pl-24">
          <p className="entri text-2xl font-bold leading-[1.05] tracking-[-0.02em] sm:text-3xl lg:text-4xl">
            {siteName}
          </p>
          {tagline ? (
            <p className="entri mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs opacity-80 sm:text-sm">
              <span className="flex gap-2">
                <span className="opacity-60">TGL</span>
                <span>{new Date().toLocaleDateString('id-ID')}</span>
              </span>
              <span className="flex gap-2">
                <span className="opacity-60">KAT</span>
                <span className="first-letter:uppercase">{tagline}</span>
              </span>
            </p>
          ) : null}
        </div>
      </div>

      {/* Pelat label laci: tab guide-card di atas kolom pencarian */}
      <div className="pelat px-3 pb-3 pt-0 sm:px-4 sm:pb-4">
        <nav aria-label="Kategori cepat" className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
          <ul className="flex min-w-min gap-1 pt-3 sm:gap-1.5">
            <li className="riffle" style={{ ['--i' as never]: 1 } as React.CSSProperties}>
              <Link href={hrefKategori()} className="tab-laci">
                Semua
              </Link>
            </li>
            {tabs.map((t, n) => (
              <li
                key={t.id}
                className="riffle"
                style={{ ['--i' as never]: n + 2 } as React.CSSProperties}
              >
                <Link href={hrefKategori(t.id)} className="tab-laci">
                  {t.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <form
          method="get"
          action="/katalog"
          role="search"
          aria-label="Pencarian katalog"
          className="flex flex-col gap-2 border border-t-0 border-[var(--rule)] bg-[var(--surface)] p-3 sm:flex-row sm:items-center sm:p-4"
        >
          <label htmlFor="laci-q" className="sr-only">
            Cari di katalog
          </label>
          <input
            id="laci-q"
            type="search"
            name="q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoComplete="off"
            placeholder="Judul, pengarang, atau kata kunci…"
            className="entri min-h-[44px] w-full min-w-0 rounded-[var(--radius-sm)] border border-[var(--rule)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)] focus:border-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)] sm:flex-1"
          />
          <button
            type="submit"
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[var(--brand-strong)] px-5 text-sm font-bold text-[var(--surface)] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            Cari
          </button>
        </form>
      </div>
    </div>
  );
}
