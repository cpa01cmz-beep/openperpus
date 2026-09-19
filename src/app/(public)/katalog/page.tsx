import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { fetchBooksPaged, fetchCategories, fetchSettings } from '@/lib/books';
import { getSiteUrl } from '@/lib/site';

const CatalogExplorer = dynamic(() => import('@/components/public/CatalogExplorer'), {
  ssr: true,
  loading: () => <CatalogSkeleton />,
});

function CatalogSkeleton() {
  return (
    <div aria-hidden="true" className="animate-pulse space-y-4">
      <div className="h-12 rounded-[var(--radius-lg)] bg-[var(--ink)]/5" />
      <div className="flex gap-2">
        <div className="h-9 w-24 rounded-full bg-[var(--ink)]/5" />
        <div className="h-9 w-20 rounded-full bg-[var(--ink)]/5" />
        <div className="h-9 w-28 rounded-full bg-[var(--ink)]/5" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--ink)]/10 bg-[var(--surface)]"
          >
            <div className="aspect-[3/4] bg-[var(--ink)]/5" />
            <div className="space-y-2 p-3">
              <div className="h-3 w-3/4 rounded bg-[var(--ink)]/10" />
              <div className="h-3 w-1/2 rounded bg-[var(--ink)]/5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export const revalidate = 60;

export async function generateMetadata({
  searchParams,
}: {
  searchParams?: SearchParams;
}): Promise<Metadata> {
  const s = await fetchSettings();
  const siteUrl = getSiteUrl();
  const title = `Katalog Buku — ${s.name ?? 'Perpustakaan'}`;
  const description = `Telusuri koleksi ${s.name ?? 'perpustakaan'} berdasarkan judul, penulis, kategori, dan ketersediaan.`;
  const canonical = `${siteUrl}/katalog`;
  const hasParams = Boolean(
    searchParams?.q ||
    searchParams?.page ||
    searchParams?.sort ||
    searchParams?.kategori ||
    searchParams?.tersedia
  );
  return {
    title,
    description,
    alternates: { canonical },
    ...(hasParams ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title,
      description,
      type: 'website',
      locale: 'id_ID',
      url: canonical,
      siteName: s.name ?? 'Perpustakaan',
      images: [{ url: '/og-default.jpg', width: 1200, height: 630, alt: title }],
    },
    twitter: { card: 'summary_large_image', title, description, images: ['/og-default.jpg'] },
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
export default async function KatalogPage({ searchParams }: { searchParams?: SearchParams }) {
  const page = Math.max(1, Number(searchParams?.page ?? 1) || 1);
  const perPage = Math.min(48, Math.max(1, Number(searchParams?.per_page ?? 24) || 24));
  const q = (searchParams?.q ?? '').trim();
  const kategori = (searchParams?.kategori ?? '').trim() || undefined;
  const sortRaw = (searchParams?.sort ?? 'terbaru').trim();
  const sort =
    sortRaw === 'judul' || sortRaw === 'rating' || sortRaw === 'stok' ? sortRaw : 'terbaru';
  const tersedia = searchParams?.tersedia === '1';

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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            name: 'Katalog Buku',
            url: `${getSiteUrl()}/katalog`,
            numberOfItems: total,
            itemListElement: books.slice(0, 24).map((b, i) => ({
              '@type': 'ListItem',
              position: (page - 1) * perPage + i + 1,
              url: `${getSiteUrl()}/katalog/${b.slug}`,
              name: b.title,
            })),
          }),
        }}
      />
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-600">OPAC</p>
        <h1 className="mt-1 font-serif text-3xl font-bold text-emerald-950 sm:text-4xl">
          Katalog Buku
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--ink)]/60 sm:text-base">
          Cari {total > 0 ? `${total} koleksi` : 'koleksi'} berdasarkan judul, penulis, penerbit,
          atau ISBN. Data stok diperbarui otomatis dari sistem sirkulasi.
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
