import type { Metadata } from 'next';
import Navbar from '@/components/public/Navbar';
import Footer from '@/components/public/Footer';
import { fetchSettings } from '@/lib/books';
import { getSiteUrl } from '@/lib/site';

export const revalidate = 60;

const OG_IMAGE = '/og-default.jpg';

export async function generateMetadata(): Promise<Metadata> {
  const s = await fetchSettings();
  const title = s.seo_title ?? s.name ?? 'Perpustakaan Digital';
  const description = s.seo_desc ?? s.tagline ?? 'Katalog, berita, dan layanan perpustakaan.';
  return {
    title,
    description,
    alternates: { canonical: getSiteUrl() },
    openGraph: {
      title,
      description,
      type: 'website',
      locale: 'id_ID',
      url: getSiteUrl(),
      siteName: s.name ?? 'Perpustakaan Digital',
      images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [OG_IMAGE] },
  };
}

/** Layout grup publik: Navbar + Footer dinamis dari library_settings. */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const settings = await fetchSettings();
  const siteName = settings.name ?? 'Perpustakaan Digital';
  const themeId = settings.active_theme ?? 'emerald';

  return (
    <div className="flex min-h-dvh flex-col">
      <Navbar
        siteName={siteName}
        tagline={settings.tagline}
        logoUrl={settings.logo_url}
        themeId={themeId}
        settings={settings}
      />
      <main className="mx-auto w-full max-w-container flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {children}
      </main>
      <Footer settings={settings} themeId={themeId} />
    </div>
  );
}
