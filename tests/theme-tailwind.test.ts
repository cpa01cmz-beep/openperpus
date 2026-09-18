import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { THEMES } from "../src/lib/themes";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/** T-TAILWIND (S3 regression + S4 perf): tailwind.config.ts must wire every
 *  themes.ts token/font/radius/shadow/spacing key to CSS vars so utilities
 *  like bg-surface / text-ink / font-heading / rounded-lg / shadow-md /
 *  max-w-container / p-card resolve per-theme. Stale blue fallback #1a56db
 *  would leak silently on a var misspell — fallbacks stay emerald-correct.
 */
describe("T-TAILWIND tailwind var wiring", () => {
  const cfg = () => read("tailwind.config.ts");

  it("covers every themes.ts token key (8 tokens)", () => {
    const src = cfg();
    const varFor: Record<string, string> = {
      brand: "--brand",
      "brand-soft": "--brand-soft",
      "brand-strong": "--brand-strong",
      accent: "--accent",
      "accent-soft": "--accent-soft",
      surface: "--surface",
      ink: "--ink",
      heading: "--heading",
    };
    for (const [token, cssVar] of Object.entries(varFor)) {
      expect(
        src.includes(`var(${cssVar}`),
        `tailwind.config.ts must wire token "${token}" via var(${cssVar}, ...)`
      ).toBe(true);
    }
    // Cross-check registry really has 8 tokens x 5 themes.
    for (const t of Object.values(THEMES)) {
      expect(Object.keys(t.tokens).length).toBe(8);
    }
  });

  it("surface/ink utilities exist", () => {
    const src = cfg();
    expect(src.includes("surface"), "tailwind.config.ts must define a surface color entry").toBe(true);
    expect(src.includes("var(--surface"), "surface entry must use var(--surface, ...)").toBe(true);
    expect(src.includes("ink"), "tailwind.config.ts must define an ink color entry").toBe(true);
    expect(src.includes("var(--ink"), "ink entry must use var(--ink, ...)").toBe(true);
  });

  it("covers font / radius / shadow / spacing keys", () => {
    const src = cfg();
    // fonts per-theme: heading + body
    expect(src.includes("heading"), "fontFamily.heading must exist").toBe(true);
    expect(src.includes("var(--font-heading)"), "fontFamily.heading must use var(--font-heading)").toBe(true);
    expect(src.includes("body"), "fontFamily.body must exist").toBe(true);
    expect(src.includes("var(--font-body)"), "fontFamily.body must use var(--font-body)").toBe(true);
    // radius sm/md/lg
    for (const k of ["sm", "md", "lg"]) {
      expect(src.includes(`--radius-${k}`), `borderRadius.${k} must use var(--radius-${k})`).toBe(true);
      expect(src.includes(`--shadow-${k}`), `boxShadow.${k} must use var(--shadow-${k})`).toBe(true);
    }
    // spacing container/section/card
    expect(src.includes("--container"), "spacing must wire --container").toBe(true);
    expect(src.includes("--spacing-section"), "spacing must wire --spacing-section").toBe(true);
    expect(src.includes("--spacing-card"), "spacing must wire --spacing-card").toBe(true);
  });

  it("no silent blue fallback #1a56db, fallbacks stay emerald-correct", () => {
    const src = cfg().toLowerCase();
    expect(src.includes("#1a56db"), "stale blue fallback #1a56db must not ship (would leak on var misspell)").toBe(
      false
    );
    expect(src.includes("#1e40af"), "stale blue fallback #1e40af must not ship (emerald brand-strong is #065f46)").toBe(
      false
    );
    // Emerald-correct fallbacks must be present.
    for (const hex of ["#047857", "#ecfdf5", "#065f46", "#ffffff", "#0f172a"]) {
      expect(src.includes(hex), `emerald-correct fallback ${hex} must be present`).toBe(true);
    }
  });
});
