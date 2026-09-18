import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/** T-HEADERS (S2 edge): neutral header tokenization.
 * ClassicHeader (emerald-classic), CenteredHeader, SplitHeader (brutalist-bar)
 * must use bg-[var(--surface)] / text-[var(--ink)] / rounded-[var(--radius-md)]
 * like MinimalHeader, with zero hardcoded slate/white/rounded bleed.
 */
describe("T-HEADERS neutral header tokenization", () => {
  const FILES = [
    "src/components/layout/variants/headers/ClassicHeader.tsx",
    "src/components/layout/variants/headers/CenteredHeader.tsx",
    "src/components/layout/variants/headers/SplitHeader.tsx",
  ];

  it("has zero bg-white bleed", () => {
    for (const f of FILES) {
      const src = read(f);
      expect(src.includes("bg-white"), `${f} must not contain bg-white`).toBe(false);
    }
  });

  it("has zero text-slate-* bleed", () => {
    for (const f of FILES) {
      const src = read(f);
      expect(/text-slate-\d/.test(src), `${f} must not contain text-slate-*`).toBe(false);
    }
  });

  it("has zero border-slate-* bleed", () => {
    for (const f of FILES) {
      const src = read(f);
      expect(/border-slate-\d/.test(src), `${f} must not contain border-slate-*`).toBe(false);
    }
  });

  it("has zero hardcoded rounded-xl / rounded-lg bleed", () => {
    for (const f of FILES) {
      const src = read(f);
      expect(src.includes("rounded-xl"), `${f} must not contain rounded-xl`).toBe(false);
      expect(src.includes("rounded-lg"), `${f} must not contain rounded-lg`).toBe(false);
    }
  });

  it("uses bg-[var(--surface)] + rounded-[var(--radius-md)] tokens", () => {
    for (const f of FILES) {
      const src = read(f);
      expect(src.includes("bg-[var(--surface)]"), `${f} must use bg-[var(--surface)]`).toBe(true);
      expect(
        src.includes("rounded-[var(--radius-md)]"),
        `${f} must use rounded-[var(--radius-md)]`
      ).toBe(true);
    }
  });

  it("uses text-[var(--ink)] neutral ink", () => {
    for (const f of FILES) {
      const src = read(f);
      expect(src.includes("text-[var(--ink)]"), `${f} must use text-[var(--ink)]`).toBe(true);
    }
  });
});
