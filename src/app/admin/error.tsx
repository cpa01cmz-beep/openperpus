'use client';

import Link from 'next/link';
import { House, RotateCcw, TriangleAlert } from 'lucide-react';

export interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/** Error boundary admin: pesan generik + tombol coba lagi. */
export default function ErrorPage({ error, reset }: ErrorPageProps) {
  return (
    <section
      aria-labelledby="err-title"
      role="alert"
      className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 py-16 text-center sm:py-24"
    >
      <span className="grid h-16 w-16 place-items-center rounded-[var(--radius-md)] bg-accent text-surface shadow-[var(--shadow-md)]">
        <TriangleAlert className="h-8 w-8" aria-hidden="true" />
      </span>
      <span className="stempel">Terjadi kendala</span>
      <h1 id="err-title" className="font-heading text-3xl font-bold text-heading sm:text-4xl">
        Maaf, halaman admin mengalami gangguan.
      </h1>
      <p className="max-w-md text-sm leading-relaxed text-ink/70 sm:text-base">
        Silakan coba muat ulang halaman. Jika masih bermasalah, kembali lagi beberapa saat.
      </p>
      {error.digest && (
        <p className="entri rounded-[var(--radius-sm)] border border-rule bg-brand-soft/60 px-3 py-1.5 text-xs text-ink/70">
          Kode: {error.digest}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-sm)] bg-brand px-5 text-sm font-semibold text-surface shadow-[var(--shadow-sm)] transition hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Coba lagi
        </button>
        <Link
          href="/admin"
          className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--rule)] bg-[var(--surface)] px-5 text-sm font-semibold text-brand transition hover:border-brand hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <House className="h-4 w-4" aria-hidden="true" />
          Kembali ke Dashboard
        </Link>
      </div>
    </section>
  );
}
