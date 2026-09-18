import { unstable_cache } from "next/cache";
import {
  fetchSettings,
  type LibrarySettings,
  type OperationalHour,
} from "@/lib/books";

/**
 * Cache settings terpusat (docs/architecture.md §6).
 * Membungkus fetchSettings() dari @/lib/books TANPA mengubah file tersebut.
 */
export const SETTINGS_TAG = "settings";
export const SETTINGS_REVALIDATE = 3600;

/** Identitas perpus (single-row id=1), di-cache 1 jam, tag 'settings'. */
export const getLibrarySettings = unstable_cache(
  async (): Promise<LibrarySettings> => fetchSettings(),
  ["library-settings"],
  { tags: [SETTINGS_TAG], revalidate: SETTINGS_REVALIDATE }
);

/** Jam operasional sebagai array aman (fallback [] bila null). */
export function getOperationalHours(settings: LibrarySettings): OperationalHour[] {
  return Array.isArray(settings.operational_hours) ? settings.operational_hours : [];
}

/** Sosmed sebagai object aman (fallback {} bila null). */
export function getSocials(settings: LibrarySettings): Record<string, string> {
  return settings.socials && typeof settings.socials === "object" ? settings.socials : {};
}

/** Format satu baris jam: dukung kunci Indonesia (hari/buka/tutup) & Inggris (day/open/close). */
export function formatOperationalHour(h: OperationalHour): string {
  const hari = h.hari ?? h.day ?? "-";
  const buka = h.buka ?? h.open ?? "";
  const tutup = h.tutup ?? h.close ?? "";
  return buka || tutup ? `${hari}: ${buka}–${tutup}` : hari;
}
