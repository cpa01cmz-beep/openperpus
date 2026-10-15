import type { ComponentType } from 'react';
import type { Book } from '@/lib/types';
import BazaarCatalog from './BazaarCatalog';

/**
 * Registry override section homepage per theme.
 *
 * Masalah yang diperbaiki: section homepage (`featured`, `stats`, ...)
 * markup-nya hardcoded di `src/app/(public)/page.tsx`, sehingga theme baru
 * hanya bisa mengganti token + header/hero/footer — layout section tidak
 * pernah bisa mengikuti gaya theme. Registry ini memberi tiap theme cara
 * mendaftarkan komponen section-nya sendiri tanpa menyentuh page.tsx.
 *
 * Kontrak:
 * - `resolveSectionComponent(themeId, sectionId)` -> komponen override
 *   atau `null` (pakai markup default page.tsx). Tidak pernah throw.
 * - Theme yang tidak mendaftar override render persis seperti sebelumnya
 *   (nol perubahan visual untuk theme lama).
 */
export type HomeSectionId =
  'hero' | 'announcement' | 'stats' | 'welcome' | 'featured' | 'news' | 'testimonials';

/** Props section katalog (override `featured`). */
export type FeaturedSectionProps = {
  books: Book[];
};

const SECTION_OVERRIDES: Partial<
  Record<string, Partial<Record<HomeSectionId, ComponentType<FeaturedSectionProps>>>>
> = {
  bazaar: {
    featured: BazaarCatalog,
  },
};

/** Komponen override untuk theme + section, atau null bila pakai default. */
export function resolveSectionComponent(
  themeId: string | null | undefined,
  sectionId: HomeSectionId
): ComponentType<FeaturedSectionProps> | null {
  if (!themeId) return null;
  return SECTION_OVERRIDES[themeId]?.[sectionId] ?? null;
}
