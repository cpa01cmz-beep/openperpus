'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BookOpen, X } from 'lucide-react';

const KEY = 'openperpus:onboarding-dismissed';

/** Dismissible onboarding banner — client island, localStorage persisted. */
export default function OnboardingBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* abaikan */
    }
    setVisible(false);
  };

  return (
    <div
      role="region"
      aria-label="Panduan pengguna baru"
      className="border-b border-brand-soft bg-brand-soft/60"
    >
      <div className="mx-auto flex w-full max-w-container items-center gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
        <BookOpen className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm text-[var(--ink)]/80 line-clamp-2 sm:whitespace-normal">
          Baru di sini?{' '}
          <Link
            href="/katalog"
            className="font-semibold text-brand underline-offset-2 hover:underline"
          >
            Jelajahi katalog
          </Link>{' '}
          lalu reservasi 1-klik — atau{' '}
          <Link href="/faq" className="font-semibold text-brand underline-offset-2 hover:underline">
            baca FAQ
          </Link>
          .
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Tutup panduan"
          className="grid h-8 w-8 min-h-[44px] min-w-[44px] shrink-0 place-items-center rounded-full text-[var(--ink)]/60 transition hover:bg-brand-soft hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
