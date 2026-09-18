import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/** T-DETAIL (S2 edge): book detail page tokenization.
 * katalog/[slug]/page.tsx renders on midnight surface #0B1220 — it must use
 * bg-[var(--surface)] / text-[var(--ink)] / rounded-[var(--radius-*)] tokens
 * with zero hardcoded slate/white/rounded bleed (QA: 10-16% near-white FAIL).
 */
describe("T-DETAIL book detail tokenization", () => {
  const FILE = "src/app/(public)/katalog/[slug]/page.tsx";

  it("has zero bg-white bleed", () => {
    const src = read(FILE);
    expect(src.includes("bg-white"), `${FILE} must not contain bg-white`).toBe(false);
  });

  it("has zero bg-slate-* bleed", () => {
    const src = read(FILE);
    expect(/bg-slate-\d/.test(src), `${FILE} must not contain bg-slate-*`).toBe(false);
  });

  it("has zero text-slate-* bleed", () => {
    const src = read(FILE);
    expect(/text-slate-\d/.test(src), `${FILE} must not contain text-slate-*`).toBe(false);
  });

  it("has zero border-slate-* bleed", () => {
    const src = read(FILE);
    expect(/border-slate-\d/.test(src), `${FILE} must not contain border-slate-*`).toBe(false);
  });

  it("has zero hardcoded rounded-lg / rounded-xl bleed", () => {
    const src = read(FILE);
    expect(src.includes("rounded-lg"), `${FILE} must not contain rounded-lg`).toBe(false);
    expect(src.includes("rounded-xl"), `${FILE} must not contain rounded-xl`).toBe(false);
  });

  it("uses bg-[var(--surface)] token surfaces", () => {
    const src = read(FILE);
    expect(src.includes("bg-[var(--surface)]"), `${FILE} must use bg-[var(--surface)]`).toBe(
      true
    );
  });

  it("uses text-[var(--ink)] neutral ink", () => {
    const src = read(FILE);
    expect(src.includes("text-[var(--ink)]"), `${FILE} must use text-[var(--ink)]`).toBe(true);
  });

  it("uses rounded-[var(--radius-*)] token radii", () => {
    const src = read(FILE);
    expect(
      src.includes("rounded-[var(--radius-"),
      `${FILE} must use rounded-[var(--radius-*)]`
    ).toBe(true);
  });

  it("keeps brand tokens intact", () => {
    const src = read(FILE);
    expect(src.includes("bg-brand"), `${FILE} must keep bg-brand CTA`).toBe(true);
    expect(src.includes("text-brand"), `${FILE} must keep text-brand accents`).toBe(true);
  });
});
