'use client';

import Link from 'next/link';
import { House, RotateCcw, TriangleAlert } from 'lucide-react';

export interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/** Error boundary publik: pesan generik + tombol coba lagi. */
export default function ErrorPage({ error, reset }: ErrorPageProps) {
  return (
    <section
      aria-labelledby="err-title"
      role="alert"
      className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 py-16 text-center sm:py-24"
    >
      <span className="grid h-16 w-16 place-items-center rounded-[var(--radius-lg)] bg-amber-400 text-emerald-950 shadow-[var(--shadow-lg)]">
        <TriangleAlert className="h-8 w-8" aria-hidden="true" />
      </span>
      <p className="rounded-full border border-rose-200 bg-rose-100 px-3 py-1 text-xs font-bold uppercase tracking-widest text-rose-800">
        Terjadi kendala
      </p>
      <h1 id="err-title" className="font-serif text-3xl font-bold text-ink sm:text-4xl">
        Maaf, halaman ini mengalami gangguan.
      </h1>
      <p className="max-w-md text-sm leading-relaxed text-ink/60 sm:text-base">
        Silakan coba muat ulang halaman. Jika masih bermasalah, kembali lagi beberapa saat.
      </p>
      {error.digest && (
        <p className="rounded-lg bg-[var(--ink)]/5 px-3 py-1.5 font-mono text-xs text-ink/60">
          Kode: {error.digest}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-lg)] bg-emerald-700 px-5 text-sm font-semibold text-surface shadow-[var(--shadow-sm)] transition hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Coba lagi
        </button>
        <Link
          href="/"
          className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-lg)] border border-emerald-700/30 bg-surface px-5 text-sm font-semibold text-emerald-800 transition hover:border-emerald-700 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
        >
          <House className="h-4 w-4" aria-hidden="true" />
          Kembali ke Beranda
        </Link>
      </div>
    </section>
  );
}
