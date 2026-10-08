'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { House, RotateCcw, TriangleAlert, WifiOff, Loader2 } from 'lucide-react';
import { captureException } from '@/lib/observability';

const BASE_RETRY_DELAY = 1000;
const MAX_RETRIES = 3;

export interface ErrorPageProps {
  error: Error & { digest?: string; requestId?: string };
  reset: () => void;
}

/** Error boundary elegan: pesan generik + tombol coba lagi + retry backoff + offline awareness. */
export default function ErrorPage({ error, reset }: ErrorPageProps) {
  const [isOnline, setIsOnline] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const [nextRetryIn, setNextRetryIn] = useState(0);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const requestId = error.digest ?? error.requestId ?? 'unknown';
    const timestamp = new Date().toISOString();
    console.error('[ErrorBoundary]', {
      timestamp,
      requestId,
      message: error.message,
      stack: error.stack,
    });
    captureException(error, { requestId, timestamp, boundary: 'error' });
  }, [error]);

  const computeBackoff = (attempt: number): number => {
    return BASE_RETRY_DELAY * Math.pow(2, attempt - 1);
  };

  const handleRetry = () => {
    if (retryCount >= MAX_RETRIES) return;
    setIsRetrying(true);
    const attempt = retryCount + 1;
    const delay = computeBackoff(attempt);
    setNextRetryIn(delay);
    const timer = setTimeout(() => {
      setRetryCount(attempt);
      setIsRetrying(false);
      setNextRetryIn(0);
      reset();
    }, delay);
    return () => clearTimeout(timer);
  };

  return (
    <section
      aria-labelledby="err-title"
      role="alert"
      className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 py-16 text-center sm:py-24"
    >
      <span className="grid h-16 w-16 place-items-center rounded-[var(--radius-md)] border border-rule bg-accent-soft text-accent shadow-[var(--shadow-sm)]">
        <TriangleAlert className="h-8 w-8" aria-hidden="true" />
      </span>
      <p className="stempel">Terjadi kendala</p>
      <h1 id="err-title" className="font-heading text-3xl font-bold text-heading sm:text-4xl">
        Maaf, ada gangguan di Perpustakaan.
      </h1>
      <p className="max-w-[68ch] text-sm leading-relaxed text-ink/75 sm:text-base">
        {isOnline
          ? 'Silakan coba muat ulang halaman. Jika masih bermasalah, kembali lagi beberapa saat.'
          : 'Sepertinya Anda sedang offline. Periksa koneksi internet dan coba lagi.'}
      </p>
      {!isOnline && (
        <p className="flex items-center justify-center gap-2 rounded-[var(--radius-md)] border border-rule bg-accent-soft px-3 py-2 text-sm text-heading">
          <WifiOff className="h-4 w-4" aria-hidden="true" />
          Mode offline — beberapa fitur mungkin tidak tersedia.
        </p>
      )}
      {(error.digest || error.requestId) && (
        <p className="entri rounded-[var(--radius-sm)] border border-rule bg-surface px-3 py-1.5 text-xs text-ink/75">
          Kode: {error.digest ?? error.requestId}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={handleRetry}
          disabled={isRetrying || retryCount >= MAX_RETRIES}
          className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-md)] bg-brand px-5 text-sm font-semibold text-surface transition hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isRetrying ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Mencoba lagi dalam {nextRetryIn / 1000}s…
            </>
          ) : retryCount >= MAX_RETRIES ? (
            <>
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Maksimal coba lagi tercapai
            </>
          ) : (
            <>
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Coba Lagi
            </>
          )}
        </button>
        <Link
          href="/"
          className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-md)] border border-rule bg-surface px-5 text-sm font-semibold text-brand transition hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          <House className="h-4 w-4" aria-hidden="true" />
          Kembali ke Beranda
        </Link>
      </div>
    </section>
  );
}
