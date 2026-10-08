import type { Metadata } from 'next';
import CatalogExplorer from '@/components/public/CatalogExplorer';
import { fetchBooksPaged, fetchCategories, fetchSettings } from '@/lib/books';
import { getSiteUrl } from '@/lib/site';
import Breadcrumb from '@/components/public/Breadcrumb';

export const revalidate = 60;

export async function generateMetadata({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}): Promise<Metadata> {
  const s = await fetchSettings();
  const sp = (await searchParams) ?? {};
  const siteUrl = getSiteUrl();
  const title = `Katalog Buku — ${s.name ?? 'Perpustakaan'}`;
  const description = `Telusuri koleksi ${s.name ?? 'perpustakaan'} berdasarkan judul, penulis, kategori, dan ketersediaan.`;
  const canonical = `${siteUrl}/katalog`;
  const hasParams = Boolean(sp.q || sp.page || sp.sort || sp.kategori || sp.tersedia);
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
export default async function KatalogPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const perPage = Math.min(48, Math.max(1, Number(sp.per_page ?? 24) || 24));
  const q = (sp.q ?? '').trim();
  const kategori = (sp.kategori ?? '').trim() || undefined;
  const sortRaw = (sp.sort ?? 'terbaru').trim();
  const sort =
    sortRaw === 'judul' || sortRaw === 'rating' || sortRaw === 'stok' ? sortRaw : 'terbaru';
  const tersedia = sp.tersedia === '1';

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
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  return (
    <div className="space-y-5">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@graph': [
              {
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
              },
              {
                '@type': 'BreadcrumbList',
                itemListElement: [
                  { '@type': 'ListItem', position: 1, name: 'Beranda', item: getSiteUrl() },
                  {
                    '@type': 'ListItem',
                    position: 2,
                    name: 'Katalog',
                    item: `${getSiteUrl()}/katalog`,
                  },
                ],
              },
            ],
          }),
        }}
      />
      <Breadcrumb items={[{ label: 'Beranda', href: '/' }, { label: 'Katalog' }]} />
      {/* Kop laci: judul kartu indeks + baris entri hitungan hasil/halaman */}
      <header className="kartu px-5 pb-6 pt-7 sm:px-8 sm:pt-9">
        <div className="kartu-kop pb-4">
          <h1 className="font-heading text-3xl font-bold leading-[1.05] tracking-[-0.02em] text-heading sm:text-4xl">
            Katalog Buku
          </h1>
        </div>
        <p className="entri mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs uppercase tracking-[0.08em] text-ink/70 sm:text-sm">
          <span className="flex gap-2">
            <span>Hasil</span>
            <span className="font-semibold text-ink">{total}</span>
          </span>
          <span className="flex gap-2">
            <span>Halaman</span>
            <span className="font-semibold text-ink">
              {page} / {totalPages}
            </span>
          </span>
        </p>
        <p className="mt-2 max-w-2xl text-sm text-ink/70 sm:text-base">
          Cari {total > 0 ? `${total} koleksi` : 'koleksi'} berdasarkan judul, penulis, penerbit,
          atau ISBN. Data stok diperbarui otomatis dari sistem sirkulasi.
        </p>
      </header>

      {/* urutan judul: h1 (halaman) → h2 (wilayah hasil) → h3 (kartu buku) */}
      <h2 className="sr-only">Hasil katalog</h2>

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
