'use client';

import Link from 'next/link';
import { House, RotateCcw, TriangleAlert } from 'lucide-react';

export interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/** Error boundary publik: pesan generik + tombol coba lagi — kartu laci yang tersangkut. */
export default function ErrorPage({ error, reset }: ErrorPageProps) {
  return (
    <section
      aria-labelledby="err-title"
      role="alert"
      className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 py-16 sm:py-24"
    >
      <div className="kartu lubang relative w-full px-5 pb-10 pt-7 text-center sm:px-8">
        <span
          aria-hidden="true"
          className="grid h-14 w-14 place-items-center rounded-[var(--radius-sm)] border border-rule bg-accent-soft text-accent"
        >
          <TriangleAlert className="h-7 w-7" />
        </span>
        <p className="stempel mt-4">Terjadi kendala</p>
        <div className="kartu-kop mt-4 pb-4">
          <h1
            id="err-title"
            className="font-heading text-3xl font-bold tracking-[-0.02em] text-heading sm:text-4xl"
          >
            Maaf, halaman ini mengalami gangguan.
          </h1>
        </div>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink/70 sm:text-base">
          Silakan coba muat ulang halaman. Jika masih bermasalah, kembali lagi beberapa saat.
        </p>
        {error.digest && (
          <p className="entri mx-auto mt-4 rounded-[var(--radius-sm)] border border-rule bg-[var(--surface)] px-3 py-1.5 text-xs text-ink/70">
            Kode: {error.digest}
          </p>
        )}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-[var(--radius-md)] bg-brand px-5 py-2.5 text-sm font-semibold text-surface shadow-[var(--shadow-sm)] transition hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Coba lagi
          </button>
          <Link
            href="/"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-[var(--radius-md)] border border-rule bg-[var(--surface)] px-5 py-2.5 text-sm font-semibold text-brand transition hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <House className="h-4 w-4" aria-hidden="true" />
            Kembali ke Beranda
          </Link>
        </div>
      </div>
    </section>
  );
}
