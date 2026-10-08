import Link from 'next/link';
import { BookOpen, House, LibraryBig } from 'lucide-react';

/** 404 generik: tidak hardcode nama perpus — identitas diambil dari layout dinamis. */
export default function NotFound() {
  return (
    <section
      aria-labelledby="nf-title"
      className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 py-16 text-center sm:py-24"
    >
      <span className="grid h-16 w-16 place-items-center rounded-[var(--radius-md)] border border-rule bg-accent-soft text-accent shadow-[var(--shadow-sm)]">
        <LibraryBig className="h-8 w-8" aria-hidden="true" />
      </span>
      <p className="stempel">404 · Halaman tidak ditemukan</p>
      <h1 id="nf-title" className="font-heading text-3xl font-bold text-heading sm:text-4xl">
        Sepertinya rak ini kosong.
      </h1>
      <p className="max-w-[68ch] text-sm leading-relaxed text-ink/75 sm:text-base">
        Halaman yang kamu cari sudah dipindah atau tidak tersedia. Yuk kembali menjelajah katalog
        Perpustakaan.
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-md)] bg-brand px-5 text-sm font-semibold text-surface transition hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          <House className="h-4 w-4" aria-hidden="true" />
          Kembali ke Beranda
        </Link>
        <Link
          href="/katalog"
          className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-md)] border border-rule bg-surface px-5 text-sm font-semibold text-brand transition hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          <BookOpen className="h-4 w-4" aria-hidden="true" />
          Jelajahi Katalog
        </Link>
      </div>
    </section>
  );
}
