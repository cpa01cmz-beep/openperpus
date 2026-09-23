'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { House, RotateCcw, TriangleAlert, WifiOff, Loader2 } from 'lucide-react';
import { captureException } from '@/lib/observability';

const BASE_RETRY_DELAY = 1000;
const MAX_RETRIES = 3;

export interface GlobalErrorPageProps {
  error: Error & { digest?: string; requestId?: string };
  reset: () => void;
}

export default function GlobalErrorPage({ error, reset }: GlobalErrorPageProps) {
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
    console.error('[GlobalErrorBoundary]', {
      timestamp,
      requestId,
      message: error.message,
      stack: error.stack,
    });
    captureException(error, { requestId, timestamp, boundary: 'global-error' });
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
    <html lang="id">
      <body>
        <section
          aria-labelledby="err-title"
          role="alert"
          className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 py-16 text-center sm:py-24"
        >
          <span className="grid h-16 w-16 place-items-center rounded-3xl bg-amber-400 text-emerald-950 shadow-lg">
            <TriangleAlert className="h-8 w-8" aria-hidden="true" />
          </span>
          <p className="rounded-full border border-rose-200 bg-rose-100 px-3 py-1 text-xs font-bold uppercase tracking-widest text-rose-800">
            Terjadi kendala sistem
          </p>
          <h1 id="err-title" className="font-serif text-3xl font-bold text-slate-900 sm:text-4xl">
            Maaf, ada gangguan di server.
          </h1>
          <p className="max-w-md text-sm leading-relaxed text-slate-500 sm:text-base">
            {isOnline
              ? 'Silakan coba muat ulang halaman. Jika masih bermasalah, kembali lagi beberapa saat.'
              : 'Sepertinya Anda sedang offline. Periksa koneksi internet dan coba lagi.'}
          </p>
          {!isOnline && (
            <p className="flex items-center justify-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <WifiOff className="h-4 w-4" aria-hidden="true" />
              Mode offline — beberapa fitur mungkin tidak tersedia.
            </p>
          )}
          {(error.digest || error.requestId) && (
            <p className="rounded-lg bg-slate-100 px-3 py-1.5 font-mono text-[11px] text-slate-500">
              Kode: {error.digest ?? error.requestId}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={handleRetry}
              disabled={isRetrying || retryCount >= MAX_RETRIES}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-700 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-emerald-700/30 bg-white px-5 text-sm font-semibold text-emerald-800 transition hover:border-emerald-700 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
            >
              <House className="h-4 w-4" aria-hidden="true" />
              Kembali ke Beranda
            </Link>
          </div>
        </section>
      </body>
    </html>
  );
}
