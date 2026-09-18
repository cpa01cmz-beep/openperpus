import type { Metadata } from "next";
import Navbar from "@/components/public/Navbar";
import Footer from "@/components/public/Footer";
import { fetchSettings } from "@/lib/books";

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const s = await fetchSettings();
  return {
    title: s.seo_title ?? s.name ?? "Perpustakaan Digital",
    description: s.seo_desc ?? s.tagline ?? "Katalog, berita, dan layanan perpustakaan.",
  };
}

/** Layout grup publik: Navbar + Footer dinamis dari library_settings. */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const settings = await fetchSettings();
  const siteName = settings.name ?? "Perpustakaan Digital";
  const themeId = settings.active_theme ?? "emerald";

  return (
    <div className="flex min-h-dvh flex-col">
      <Navbar siteName={siteName} tagline={settings.tagline} logoUrl={settings.logo_url} themeId={themeId} settings={settings} />
      <main className="mx-auto w-full max-w-container flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {children}
      </main>
      <Footer settings={settings} themeId={themeId} />
    </div>
  );
}
