import { notFound, permanentRedirect } from "next/navigation";
import { fetchBookBySlug, fetchSettings } from "@/lib/books";

export const revalidate = 60;

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props) {
  const [book, settings] = await Promise.all([
    fetchBookBySlug(params.slug),
    fetchSettings(),
  ]);
  if (!book) return { title: "Buku tidak ditemukan" };
  return {
    title: `${book.title} — ${settings.name ?? "Perpustakaan"}`,
    description:
      book.description?.slice(0, 160) ?? `Detail buku ${book.title}.`,
  };
}

/**
 * Alias kontrak lama `/buku/[slug]` → kanonis `/katalog/[slug]`.
 * Mempertahankan semantik 404 bila slug tak ada, lalu redirect permanen
 * agar tidak ada duplikasi URL detail buku.
 */
export default async function BukuAliasPage({ params }: Props) {
  const book = await fetchBookBySlug(params.slug);
  if (!book) notFound();
  permanentRedirect(`/katalog/${params.slug}`);
}
