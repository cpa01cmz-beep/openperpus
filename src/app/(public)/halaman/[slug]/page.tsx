import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { fetchPage, fetchSettings } from "@/lib/books";

export const revalidate = 60;

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props) {
  const [settings, page] = await Promise.all([
    fetchSettings(),
    fetchPage(params.slug),
  ]);
  const siteName = settings.name ?? "Perpustakaan";
  if (!page) return { title: `Halaman tidak ditemukan — ${siteName}` };
  return {
    title: `${page.title} — ${siteName}`,
    description: page.excerpt ?? `Halaman ${page.title} di ${siteName}.`,
  };
}

/** Halaman dinamis dari tabel pages (slug apa pun yang is_active). */
export default async function HalamanDetailPage({ params }: Props) {
  const page = await fetchPage(params.slug);
  if (!page) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 rounded text-sm font-medium text-slate-500 transition hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Kembali ke beranda
      </Link>

      <article className="overflow-hidden rounded-lg border border-slate-100 bg-white shadow-sm">
        <div className="p-5 sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand">
            Halaman informasi
          </p>
          <h1 className="mt-1 font-heading text-2xl font-bold leading-tight text-heading sm:text-4xl">
            {page.title}
          </h1>
          {page.excerpt && (
            <p className="mt-3 border-l-4 border-accent bg-accent-soft px-4 py-3 text-sm italic leading-relaxed text-slate-600 sm:text-base">
              {page.excerpt}
            </p>
          )}
          {page.content_md ? (
            <div className="mt-5 whitespace-pre-line text-sm leading-relaxed text-slate-700 sm:text-base">
              {page.content_md}
            </div>
          ) : (
            <p className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
              Konten halaman ini belum diisi admin.
            </p>
          )}
        </div>
      </article>
    </div>
  );
}
