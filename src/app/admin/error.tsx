'use client';

import Link from 'next/link';
import { House, RotateCcw, TriangleAlert } from 'lucide-react';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';

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
      <span className="grid h-16 w-16 place-items-center rounded-[var(--radius-lg)] bg-accent text-ink shadow-[var(--shadow-lg)]">
        <TriangleAlert className="h-8 w-8" aria-hidden="true" />
      </span>
      <Badge tone="rose">Terjadi kendala</Badge>
      <h1 id="err-title" className="font-serif text-3xl font-bold text-ink sm:text-4xl">
        Maaf, halaman admin mengalami gangguan.
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
        <Button type="button" variant="primary" size="lg" onClick={reset}>
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Coba lagi
        </Button>
        <Link
          href="/admin"
          className="inline-flex min-h-[48px] items-center gap-2 rounded-md border border-brand/30 bg-surface px-6 py-3 text-base font-semibold text-brand transition hover:border-brand hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          <House className="h-4 w-4" aria-hidden="true" />
          Kembali ke Dashboard
        </Link>
      </div>
    </section>
  );
}
