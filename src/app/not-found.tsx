import Link from "next/link";
import { BookOpen, House, LibraryBig } from "lucide-react";

/** 404 generik: tidak hardcode nama perpus — identitas diambil dari layout dinamis. */
export default function NotFound() {
  return (
    <section
      aria-labelledby="nf-title"
      className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 py-16 text-center sm:py-24"
    >
      <span className="grid h-16 w-16 place-items-center rounded-3xl bg-emerald-700 text-amber-300 shadow-lg">
        <LibraryBig className="h-8 w-8" aria-hidden="true" />
      </span>
      <p className="rounded-full border border-amber-200 bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-widest text-amber-900">
        404 · Halaman tidak ditemukan
      </p>
      <h1 id="nf-title" className="font-serif text-3xl font-bold text-slate-900 sm:text-4xl">
        Sepertinya rak ini kosong.
      </h1>
      <p className="max-w-md text-sm leading-relaxed text-slate-500 sm:text-base">
        Halaman yang kamu cari sudah dipindah atau tidak tersedia. Yuk kembali menjelajah katalog
        Perpustakaan.
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-700 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
        >
          <House className="h-4 w-4" aria-hidden="true" />
          Kembali ke Beranda
        </Link>
        <Link
          href="/katalog"
          className="inline-flex h-11 items-center gap-2 rounded-xl border border-emerald-700/30 bg-white px-5 text-sm font-semibold text-emerald-800 transition hover:border-emerald-700 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
        >
          <BookOpen className="h-4 w-4" aria-hidden="true" />
          Jelajahi Katalog
        </Link>
      </div>
    </section>
  );
}
