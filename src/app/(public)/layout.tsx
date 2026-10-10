import type { Metadata } from 'next';
import Navbar from '@/components/public/Navbar';
import OnboardingBanner from '@/components/public/OnboardingBanner';
import Footer from '@/components/public/Footer';
import { fetchSettings } from '@/lib/books';
import { getOgImage, getSiteName } from '@/lib/settings';
import { fetchHeaderMenus, fetchFooterMenus } from '@/lib/menus';
import { getSiteUrl } from '@/lib/site';
import { getEffectiveThemeFromSettings } from '@/lib/theme-overrides';

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const s = await fetchSettings();
  const siteName = getSiteName(s);
  const title = s.seo_title ?? siteName;
  const description = s.seo_desc ?? s.tagline ?? 'Katalog, berita, dan layanan perpustakaan.';
  const ogImage = getOgImage(s);
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
      siteName,
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [ogImage] },
  };
}

/** Layout grup publik: Navbar + Footer dinamis dari library_settings + tabel menus. */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const [settings, headerMenus, footerMenus] = await Promise.all([
    fetchSettings(),
    fetchHeaderMenus(),
    fetchFooterMenus(),
  ]);
  const siteName = getSiteName(settings);
  const effective = getEffectiveThemeFromSettings(settings);
  const themeId = effective.id;
  const siteUrl = getSiteUrl();
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${siteUrl}#organization`,
        name: siteName,
        url: siteUrl,
        ...(settings.logo_url ? { logo: settings.logo_url } : {}),
      },
      {
        '@type': 'Library',
        '@id': `${siteUrl}#library`,
        name: siteName,
        url: siteUrl,
        ...(settings.tagline ? { description: settings.tagline } : {}),
        parentOrganization: { '@id': `${siteUrl}#organization` },
      },
      {
        '@type': 'WebSite',
        '@id': `${siteUrl}#website`,
        name: siteName,
        url: siteUrl,
        publisher: { '@id': `${siteUrl}#organization` },
      },
    ],
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Navbar
        siteName={siteName}
        tagline={settings.tagline}
        logoUrl={settings.logo_url}
        themeId={themeId}
        settings={settings}
        menus={headerMenus}
      />
      <OnboardingBanner />
      <main className="mx-auto w-full max-w-container flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {children}
      </main>
      <Footer settings={settings} themeId={themeId} menus={footerMenus} />
    </div>
  );
}
