import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { THEMES } from "../src/lib/themes";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/** T-theme-single: theme has ONE control surface (ThemeSwitcher → active_theme).
 * Legacy duplicates (theme_primary/theme_accent color pickers + second
 * active_theme dropdown in SettingsForm) confused admins: values saved but
 * never read by any render path. Full cleanup removes them everywhere.
 */
describe("T-theme-single no legacy theme duplicates", () => {
  it("SettingsForm has no theme controls", () => {
    const src = read("src/components/admin/SettingsForm.tsx");
    expect(src.includes("theme_primary"), "SettingsForm must not reference theme_primary").toBe(false);
    expect(src.includes("theme_accent"), "SettingsForm must not reference theme_accent").toBe(false);
    expect(src.includes("active_theme"), "SettingsForm must not duplicate active_theme control").toBe(false);
    expect(src.includes("THEME_OPTIONS"), "SettingsForm must not ship its own theme list").toBe(false);
  });

  it("settings API rejects legacy theme fields", () => {
    const src = read("src/app/api/settings/route.ts");
    expect(src.includes("theme_primary"), "API must not accept theme_primary").toBe(false);
    expect(src.includes("theme_accent"), "API must not accept theme_accent").toBe(false);
    expect(src.includes("__theme_obj__"), "API must not keep legacy theme-object alias").toBe(false);
  });

  it("LibrarySettings type has no legacy theme columns", () => {
    const src = read("src/lib/types.ts");
    expect(src.includes("theme_primary"), "types must not carry theme_primary").toBe(false);
    expect(src.includes("theme_accent"), "types must not carry theme_accent").toBe(false);
    expect(src.includes("active_theme"), "types must keep the single active_theme source").toBe(true);
  });
});

/** T-SS-DEDUPE (S4 perf): :root must NOT restate the emerald token block.
 * Runtime truth is the inline style in layout.tsx + [data-theme] blocks;
 * :root keeps only a minimal fallback (brand/surface/ink + font loaders).
 * Single source for token VALUES is src/lib/themes.ts; globals.css only
 * carries the CSS var plumbing per theme.
 */
describe("T-SS-DEDUPE :root does not duplicate emerald", () => {
  const THEME_IDS = ["emerald", "midnight", "paper", "brutalist", "ocean"];
  const TOKENS = [
    "brand",
    "brand-soft",
    "brand-strong",
    "accent",
    "accent-soft",
    "surface",
    "ink",
    "heading",
  ];

  const rootBlock = (css: string) => {
    const m = css.match(/:root\s*\{([\s\S]*?)\}/);
    return m ? m[1]! : "";
  };

  const themeBlock = (css: string, id: string) => {
    const m = css.match(new RegExp(`\\[data-theme="${id}"\\]\\s*\\{([\\s\\S]*?)\\}`));
    return m ? m[1]! : "";
  };

  it(":root does NOT restate the emerald block", () => {
    const css = read("src/app/globals.css");
    const root = rootBlock(css);
    // Emerald-only duplicates that must live solely in [data-theme="emerald"].
    const emeraldDuplicates = [
      "--brand-soft: #ecfdf5",
      "--brand-strong: #065f46",
      "--accent: #f59e0b",
      "--accent-soft: #fffbeb",
      "--heading: #065f46",
    ];
    for (const dup of emeraldDuplicates) {
      expect(
        root.includes(dup),
        `:root must NOT restate emerald token "${dup}" (single source is [data-theme="emerald"] + layout inline style)`
      ).toBe(false);
    }
  });

  it("all 8 tokens x 5 themes present in themes.ts", () => {
    for (const id of THEME_IDS) {
      expect(THEMES[id], `themes.ts must define theme "${id}"`).toBeDefined();
      for (const t of TOKENS) {
        expect(
          (THEMES[id]!.tokens as Record<string, string>)[t],
          `themes.ts [${id}] must define token "${t}"`
        ).toBeTruthy();
      }
    }
  });

  it("all 8 tokens x 5 themes present in globals.css [data-theme] blocks", () => {
    const css = read("src/app/globals.css");
    for (const id of THEME_IDS) {
      const block = themeBlock(css, id);
      expect(block.length > 0, `globals.css must keep [data-theme="${id}"] block`).toBe(true);
      for (const t of TOKENS) {
        expect(
          block.includes(`--${t}:`),
          `globals.css [data-theme="${id}"] must define --${t}`
        ).toBe(true);
      }
    }
  });
});
