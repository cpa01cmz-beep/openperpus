import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { THEMES } from "../src/lib/themes";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/** T-BRUTALIST: rigid industrial-brutalist tokens + StackedHero treatment.
 * Radius 0, hard offset shadows, Archivo + Space vars, 2px black borders,
 * uppercase display, zero soft radius/blur in brutalist tree.
 */
describe("T-BRUTALIST brutalist rigid tokens", () => {
  const brutalist = THEMES["brutalist"];

  it("exists with brutalist-manifesto routing", () => {
    expect(brutalist, "themes.ts must define brutalist").toBeDefined();
    expect(brutalist!.layout.heroVariant).toBe("brutalist-manifesto");
    expect(brutalist!.layout.headerVariant).toBe("brutalist-bar");
    expect(brutalist!.layout.footerVariant).toBe("brutalist-index");
  });

  it("radius sm/md/lg == 0", () => {
    expect(brutalist!.radius.sm).toBe("0");
    expect(brutalist!.radius.md).toBe("0");
    expect(brutalist!.radius.lg).toBe("0");
  });

  it("shadows are hard 2px/4px/8px offsets in #111110", () => {
    expect(brutalist!.shadow.sm).toBe("2px 2px 0 0 #111110");
    expect(brutalist!.shadow.md).toBe("4px 4px 0 0 #111110");
    expect(brutalist!.shadow.lg).toBe("8px 8px 0 0 #111110");
  });

  it("Archivo + Space font vars", () => {
    expect(brutalist!.fonts.heading).toContain("Archivo");
    expect(brutalist!.fonts.heading).toContain("var(--font-archivo)");
    expect(brutalist!.fonts.body).toContain("Space");
    expect(brutalist!.fonts.body).toContain("var(--font-space)");
  });

  it("container 80rem / section 2.5rem", () => {
    expect(brutalist!.spacing.container).toBe("80rem");
    expect(brutalist!.spacing.section).toBe("2.5rem");
  });

  it("globals.css [data-theme=brutalist] mirrors rigid tokens", () => {
    const css = read("src/app/globals.css");
    const m = css.match(/\[data-theme="brutalist"\]\s*\{([\s\S]*?)\}/);
    expect(m, "globals.css must keep [data-theme=brutalist] block").toBeTruthy();
    const block = m![1]!;
    expect(block).toContain("--radius-sm: 0");
    expect(block).toContain("--radius-md: 0");
    expect(block).toContain("--radius-lg: 0");
    expect(block).toContain("--shadow-sm: 2px 2px 0 0 #111110");
    expect(block).toContain("--shadow-md: 4px 4px 0 0 #111110");
    expect(block).toContain("--shadow-lg: 8px 8px 0 0 #111110");
    expect(block).toContain("Archivo");
    expect(block).toContain("Space");
    expect(block).toContain("--container: 80rem");
    expect(block).toContain("--spacing-section: 2.5rem");
  });
});

describe("T-BRUTALIST StackedHero rigid treatment", () => {
  const src = () => read("src/components/hero/variants/StackedHero.tsx");

  it("zero soft radius in brutalist tree", () => {
    const s = src();
    expect(s.includes("rounded-lg"), "must have zero rounded-lg").toBe(false);
    expect(s.includes("rounded-xl"), "must have zero rounded-xl").toBe(false);
    expect(s.includes("rounded-2xl"), "must have zero rounded-2xl").toBe(false);
    expect(s.includes("rounded-full"), "must have zero rounded-full").toBe(false);
  });

  it("zero soft shadows + blur in brutalist tree", () => {
    const s = src();
    expect(s.includes("shadow-sm"), "must have zero shadow-sm").toBe(false);
    expect(s.includes("shadow-md"), "must have zero shadow-md").toBe(false);
    expect(s.includes("backdrop-blur"), "must have zero backdrop-blur").toBe(false);
    // Soft tailwind `shadow` / `shadow-lg` without hard offset is forbidden;
    // hard shadows must be explicit offset utilities.
    const hasSoftShadowClass =
      /(?:^|["'\s])shadow(?:-lg)?(?:["'\s])/.test(s) && !s.includes("shadow-[");
    expect(hasSoftShadowClass, "must not use soft shadow/shadow-lg").toBe(false);
  });

  it("2px black borders", () => {
    const s = src();
    expect(s.includes("border-2"), "must use 2px borders").toBe(true);
    const hasBlack =
      s.includes("border-[#111110]") ||
      s.includes("border-black") ||
      s.includes("border-ink");
    expect(hasBlack, "borders must be black ink").toBe(true);
  });

  it("offset hard shadows", () => {
    const s = src();
    const hasHard =
      s.includes("shadow-[2px_2px_0_0_") ||
      s.includes("shadow-[4px_4px_0_0_") ||
      s.includes("shadow-[8px_8px_0_0_") ||
      s.includes("var(--shadow");
    expect(hasHard, "must use offset hard shadows").toBe(true);
  });

  it("uppercase Archivo display", () => {
    const s = src();
    expect(s.includes("uppercase"), "must use uppercase display").toBe(true);
    expect(s.includes("font-heading"), "must use Archivo heading token").toBe(true);
  });
});
