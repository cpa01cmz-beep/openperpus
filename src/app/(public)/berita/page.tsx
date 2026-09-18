import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Newspaper } from "lucide-react";
import { fetchArticles, fetchSettings } from "@/lib/books";

export const revalidate = 60;

export async function generateMetadata() {
  const s = await fetchSettings();
  return {
    title: `Berita & Artikel — ${s.name ?? "Perpustakaan"}`,
    description: `Kabar, kegiatan, dan artikel literasi dari ${s.name ?? "perpustakaan"}.`,
  };
}

/** Arsip berita: kartu dari tabel articles (status published). */
export default async function BeritaPage() {
  const [articles] = await Promise.all([fetchArticles(24)]);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Kabar perpustakaan</p>
        <h1 className="mt-1 font-heading text-3xl font-bold text-heading sm:text-4xl">
          Berita & Artikel
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500 sm:text-base">
          Kegiatan, pengumuman, dan bacaan literasi terbaru.
        </p>
      </header>

      {articles.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((a) => (
            <Link
              key={a.id}
              href={`/berita/${a.slug}`}
              className="group overflow-hidden rounded-lg border border-slate-100 bg-white shadow-sm transition hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <div className="aspect-[16/9] w-full overflow-hidden bg-brand-soft">
                {a.cover_url ? (
                  <Image src={a.cover_url} alt={a.title} width={640} height={360} sizes="(max-width:640px) 100vw, 33vw" unoptimized loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
                ) : (
                  <div className="grid h-full w-full place-items-center bg-gradient-to-br from-brand to-brand p-4 text-center" aria-hidden="true">
                    <Newspaper className="h-8 w-8 text-accent" />
                  </div>
                )}
              </div>
              <div className="p-4 sm:p-5">
                <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-brand">
                  {a.category ?? "Berita"}
                  {a.published_at && (
                    <time dateTime={a.published_at} className="font-normal normal-case tracking-normal text-slate-400">
                      {new Date(a.published_at).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
                    </time>
                  )}
                </p>
                <h2 className="mt-1 line-clamp-2 font-heading text-lg font-bold leading-snug text-heading group-hover:text-brand">
                  {a.title}
                </h2>
                {a.excerpt && <p className="mt-1.5 line-clamp-2 text-sm text-slate-500">{a.excerpt}</p>}
                <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand">
                  Baca selengkapnya <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-6 py-14 text-center">
          <Newspaper className="mx-auto h-10 w-10 text-slate-300" aria-hidden="true" />
          <h2 className="mt-3 font-heading text-lg font-bold text-slate-800">Belum ada berita</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
            Berita yang dipublikasikan pustakawan akan muncul di sini.
          </p>
        </div>
      )}
    </div>
  );
}
