import type { Banner } from "@/lib/books";

/** Shared hero props across all variants (same contract as public/Hero). */
export type HeroProps = {
  banners: Banner[];
  siteName: string;
  tagline?: string | null;
};
