import CatalogExplorer from "@/components/public/CatalogExplorer";
import { fetchBooksPaged, fetchCategories, fetchSettings } from "@/lib/books";

export const revalidate = 60;

export async function generateMetadata() {
  const s = await fetchSettings();
  return {
    title: `Katalog Buku — ${s.name ?? "Perpustakaan"}`,
    description: `Telusuri koleksi ${s.name ?? "perpustakaan"} berdasarkan judul, penulis, kategori, dan ketersediaan.`,
  };
}

type SearchParams = {
  page?: string;
  per_page?: string;
  q?: string;
  kategori?: string;
  sort?: string;
  tersedia?: string;
};

/** Katalog: server-paginated via searchParams page/per_page (<=24 baris/halaman). */
export default async function KatalogPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const page = Math.max(1, Number(searchParams?.page ?? 1) || 1);
  const perPage = Math.min(48, Math.max(1, Number(searchParams?.per_page ?? 24) || 24));
  const q = (searchParams?.q ?? "").trim();
  const kategori = (searchParams?.kategori ?? "").trim() || undefined;
  const sortRaw = (searchParams?.sort ?? "terbaru").trim();
  const sort =
    sortRaw === "judul" || sortRaw === "rating" || sortRaw === "stok" ? sortRaw : "terbaru";
  const tersedia = searchParams?.tersedia === "1";

  const [{ books, total }, categories] = await Promise.all([
    fetchBooksPaged({
      page,
      perPage,
      q: q || undefined,
      categoryId: kategori,
      sort,
      availableOnly: tersedia || undefined,
    }),
    fetchCategories(),
  ]);

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-600">OPAC</p>
        <h1 className="mt-1 font-serif text-3xl font-bold text-emerald-950 sm:text-4xl">
          Katalog Buku
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--ink)]/60 sm:text-base">
          Cari {total > 0 ? `${total} koleksi` : "koleksi"} berdasarkan judul, penulis,
          penerbit, atau ISBN. Data stok diperbarui otomatis dari sistem sirkulasi.
        </p>
      </header>

      <CatalogExplorer
        books={books}
        categories={categories}
        total={total}
        page={page}
        perPage={perPage}
        initialQ={q}
        initialCategoryId={kategori ?? null}
        initialSort={sort}
        initialAvailableOnly={tersedia}
      />
    </div>
  );
}
