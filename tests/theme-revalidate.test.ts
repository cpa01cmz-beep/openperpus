import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(process.cwd(), "src/app/api/settings/route.ts"), "utf8");

/** T-theme-cache: PUT settings must purge the settings cache + public routes.
 * Runtime proof (2026-09-18): PUT /api/settings → 200 active_theme=midnight,
 * but public `/` still rendered data-theme=emerald (stale unstable_cache).
 * getLibrarySettings() caches 3600s (tag "settings"), fetchSettings() 60s
 * (tag "settings"), pages revalidate 60 — none are purged by the PUT.
 */
describe("T-theme-cache settings PUT purges theme cache", () => {
  it("route imports revalidateTag + revalidatePath from next/cache", () => {
    expect(src.includes("revalidateTag"), "PUT must call revalidateTag — settings cache otherwise stays stale").toBe(true);
    expect(src.includes("revalidatePath"), "PUT must call revalidatePath — public pages otherwise render stale theme").toBe(true);
    expect(
      src.includes('from "next/cache"') || src.includes("from 'next/cache'"),
      "revalidate helpers must come from next/cache"
    ).toBe(true);
  });

  it("route purges the settings tag after successful update", () => {
    expect(
      src.includes('revalidateTag("settings"') || src.includes("revalidateTag('settings'"),
      "PUT must revalidateTag(\"settings\") — tag used by getLibrarySettings() + fetchSettings()"
    ).toBe(true);
  });

  it("route purges the public homepage path after successful update", () => {
    expect(
      src.includes('revalidatePath("/")') || src.includes("revalidatePath('/')"),
      "PUT must revalidatePath(\"/\") — homepage data-theme otherwise stays stale"
    ).toBe(true);
  });
});
