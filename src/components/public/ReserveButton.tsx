'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookmarkCheck, Loader2, MessageCircle } from 'lucide-react';

type Props = {
  bookId: string;
  slug: string;
  title: string;
  /** WA deep-link petugas (fallback bila API gagal / tamu). */
  waHref: string | null;
  variant?: 'primary' | 'queue';
};

/** 1-klik reservasi: POST /api/reservations {book_id}. 401 → login, gagal → WA fallback. */
export default function ReserveButton({ bookId, slug, title, waHref, variant = 'primary' }: Props) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [msg, setMsg] = useState<string | null>(null);

  async function reserve() {
    setState('loading');
    setMsg(null);
    try {
      const res = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ book_id: bookId }),
      });
      if (res.status === 401) {
        router.push(`/login?next=${encodeURIComponent(`/katalog/${slug}`)}`);
        return;
      }
      const json = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) {
        throw new Error(json?.message ?? 'Reservasi gagal. Coba via WhatsApp.');
      }
      setState('done');
      setMsg(`Reservasi "${title}" tercatat — tunjukkan ke petugas saat pengambilan.`);
      router.refresh();
    } catch (e) {
      setState('error');
      setMsg(e instanceof Error ? e.message : 'Reservasi gagal.');
    }
  }

  if (state === 'done') {
    return (
      <p
        role="status"
        className="inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-brand-soft px-5 py-3 text-sm font-bold text-brand"
      >
        <BookmarkCheck className="h-4 w-4" aria-hidden="true" /> {msg}
      </p>
    );
  }

  const btn =
    variant === 'queue'
      ? 'bg-accent text-brand-strong hover:bg-accent focus-visible:ring-brand'
      : 'border border-brand-soft bg-[var(--surface)] text-brand shadow-sm hover:bg-brand-soft focus-visible:ring-brand';

  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={reserve}
        disabled={state === 'loading'}
        aria-live="polite"
        className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[var(--radius-md)] px-6 py-3 text-sm font-semibold shadow-sm transition focus-visible:outline-none focus-visible:ring-2 disabled:cursor-wait disabled:opacity-70 ${btn}`}
      >
        {state === 'loading' ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Memproses…
          </>
        ) : (
          <>
            <BookmarkCheck className="h-4 w-4" aria-hidden="true" />
            {variant === 'queue' ? 'Masuk Antrean (1-klik)' : 'Reservasi 1-klik'}
          </>
        )}
      </button>
      {state === 'error' && (
        <span role="alert" className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium text-rose-700">{msg}</span>
          {waHref ? (
            <a
              href={waHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-[var(--radius-md)] bg-[#25D366] px-4 py-2 text-sm font-bold text-white shadow transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" /> Reservasi via WA
            </a>
          ) : (
            <a
              href="/login"
              className="font-semibold text-brand underline-offset-2 hover:underline"
            >
              Masuk dulu sebagai anggota
            </a>
          )}
        </span>
      )}
    </span>
  );
}
