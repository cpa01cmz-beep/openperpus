import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { THEMES } from "../src/lib/themes";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/** T-PAPER (S1 paper flat editorial): warm monochrome flat, no gradients.
 * Owns ONLY: EditorialHero.tsx, MinimalFooter.tsx, themes.ts paper block,
 * globals.css [data-theme=paper] block.
 */
describe("T-PAPER paper flat editorial", () => {
  const heroPath = "src/components/hero/variants/EditorialHero.tsx";
  const footerPath = "src/components/layout/variants/footers/MinimalFooter.tsx";

  it("zero bg-gradient-to-* in paper tree", () => {
    const sources = [
      read(heroPath),
      read(footerPath),
      read("src/lib/themes.ts"),
      read("src/app/globals.css"),
    ];
    for (const src of sources) {
      expect(src.includes("bg-gradient-to-"), "paper tree must have zero bg-gradient-to-*").toBe(false);
      expect(src.includes("bg-gradient-"), "paper tree must have zero bg-gradient-*").toBe(false);
    }
    // No gradient utility inside the two owned components at all.
    expect(read(heroPath).includes("gradient"), "EditorialHero must not use gradients").toBe(false);
    expect(read(footerPath).includes("gradient"), "MinimalFooter must not use gradients").toBe(false);
  });

  it("Source Serif + Source Sans vars", () => {
    const paper = THEMES["paper"];
    expect(paper, "themes.ts must define paper").toBeDefined();
    expect(paper!.fonts.heading).toContain("--font-source-serif");
    expect(paper!.fonts.heading).toMatch(/Source Serif/);
    expect(paper!.fonts.body).toContain("--font-source-sans");
    expect(paper!.fonts.body).toMatch(/Source Sans/);
    const css = read("src/app/globals.css");
    const m = css.match(/\[data-theme="paper"\]\s*\{([\s\S]*?)\}/);
    expect(m, "globals.css must keep [data-theme=paper] block").toBeTruthy();
    const block = m![1]!;
    expect(block).toContain("--font-source-serif");
    expect(block).toContain("--font-source-sans");
    expect(block).toMatch(/Source Serif/);
    expect(block).toMatch(/Source Sans/);
  });

  it("flat shadows opacity<=0.08", () => {
    const paper = THEMES["paper"];
    const shadows = Object.values(paper!.shadow as Record<string, string>);
    expect(shadows.length > 0, "paper must define shadows").toBe(true);
    for (const s of shadows) {
      expect(s.includes("rgb(43 38 34"), `paper shadow must stay warm ink, got "${s}"`).toBe(true);
      const opacities = [...s.matchAll(/\/\s*0\.(\d+)/g)].map((x) => parseFloat(`0.${x[1]}`));
      expect(opacities.length > 0, `paper shadow must carry explicit opacity, got "${s}"`).toBe(true);
      for (const o of opacities) {
        expect(o, `paper shadow opacity ${o} must be <= 0.08, got "${s}"`).toBeLessThanOrEqual(0.08);
      }
    }
    const css = read("src/app/globals.css");
    const block = css.match(/\[data-theme="paper"\]\s*\{([\s\S]*?)\}/)![1]!;
    for (const key of ["--shadow-sm", "--shadow-md", "--shadow-lg"]) {
      expect(block.includes(key), `paper css block must define ${key}`).toBe(true);
    }
  });

  it("radius<=0.375rem", () => {
    const paper = THEMES["paper"];
    const radii = Object.values(paper!.radius as Record<string, string>);
    expect(radii.length > 0, "paper must define radii").toBe(true);
    for (const r of radii) {
      const v = parseFloat(r);
      expect(Number.isNaN(v), `paper radius "${r}" must be numeric rem`).toBe(false);
      expect(v, `paper radius ${r} must be <= 0.375rem`).toBeLessThanOrEqual(0.375);
    }
    const css = read("src/app/globals.css");
    const block = css.match(/\[data-theme="paper"\]\s*\{([\s\S]*?)\}/)![1]!;
    expect(block).toContain("--radius-lg: 0.375rem");
  });

  it("paper tree flat: hairlines over shadows", () => {
    const hero = read(heroPath);
    const footer = read(footerPath);
    // Flat editorial: no shadow utilities in owned components — depth via hairline borders.
    expect(hero.includes("shadow-"), "EditorialHero must be flat: no shadow-* utilities (use hairline borders)").toBe(false);
    expect(footer.includes("shadow-"), "MinimalFooter must be flat: no shadow-* utilities (use hairline borders)").toBe(false);
    expect(hero.includes("border"), "EditorialHero must use hairline borders").toBe(true);
    expect(footer.includes("border-t"), "MinimalFooter colophon must keep hairline top border").toBe(true);
    // Editorial serif rhythm via heading token.
    expect(hero.includes("font-heading"), "EditorialHero must use serif heading rhythm").toBe(true);
    expect(footer.includes("font-heading"), "MinimalFooter colophon brand must use serif").toBe(true);
  });

  it("paper editorial tokens: paper #FAF7F2, sage #6F7D6C, section 6rem airy", () => {
    const paper = THEMES["paper"];
    const tokens = paper!.tokens as Record<string, string>;
    expect(tokens["surface"]).toBe("#FAF7F2");
    expect(tokens["brand"]).toBe("#6F7D6C");
    expect((paper!.spacing as Record<string, string>)["section"]).toBe("6rem");
    const css = read("src/app/globals.css");
    const block = css.match(/\[data-theme="paper"\]\s*\{([\s\S]*?)\}/)![1]!;
    expect(block).toContain("--surface: #FAF7F2");
    expect(block).toContain("--brand: #6F7D6C");
    expect(block).toContain("--spacing-section: 6rem");
    expect(paper!.description).toMatch(/no gradients/i);
  });
});
