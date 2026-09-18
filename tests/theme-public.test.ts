import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/** T-PUBLIC: footer + public-card neutral tokenization (S2).
 * ClassicFooter is owned by emerald — skipped here.
 * Render set (brutalist + midnight): StackedFooter + BookCard +
 * TestimonialCard + StatsBar + FaqAccordion. SearchBar + CatalogExplorer
 * are owned too and must stay neutral. shared.tsx carries the merge point.
 */
const OWNED = [
  "src/components/layout/variants/footers/StackedFooter.tsx",
  "src/components/layout/variants/shared.tsx",
  "src/components/public/BookCard.tsx",
  "src/components/public/TestimonialCard.tsx",
  "src/components/public/StatsBar.tsx",
  "src/components/public/FaqAccordion.tsx",
  "src/components/public/SearchBar.tsx",
  "src/components/public/CatalogExplorer.tsx",
] as const;

const RENDER_SET = [
  "src/components/public/BookCard.tsx",
  "src/components/public/TestimonialCard.tsx",
  "src/components/public/StatsBar.tsx",
  "src/components/public/FaqAccordion.tsx",
] as const;

describe("T-PUBLIC footer + public cards neutral tokenization", () => {
  it("FOOTER_VARIANTS routes midnight/brutalist/ocean to StackedFooter", () => {
    const registry = read("src/components/layout/variants/registry.ts");
    for (const key of ["midnight-extended", "brutalist-index", "ocean-harbor"]) {
      expect(registry.includes(`'${key}': StackedFooter`), `${key} must map to StackedFooter`).toBe(true);
    }
  });

  it("brutalist + midnight themes define surface/ink tokens", () => {
    const themes = read("src/lib/themes.ts");
    expect(themes.includes("id: 'brutalist'")).toBe(true);
    expect(themes.includes("id: 'midnight'")).toBe(true);
    expect(themes.includes("surface: '#0B1220'"), "midnight surface must stay #0B1220").toBe(true);
  });

  it.each(OWNED)("%s has zero bg-white / text-slate-N / border-slate-100", (p) => {
    const s = read(p);
    expect(s.includes("bg-white"), `${p}: must have zero bg-white`).toBe(false);
    expect(/text-slate-\d/.test(s), `${p}: must have zero text-slate-N`).toBe(false);
    expect(s.includes("border-slate-100"), `${p}: must have zero border-slate-100`).toBe(false);
  });

  it.each(OWNED)("%s has zero leftover slate scale", (p) => {
    const s = read(p);
    // `translate-*` utilities contain the substring "slate-" — exclude them.
    expect(/(?:^|[^a-zA-Z])slate-/.test(s), `${p}: must have zero slate-*`).toBe(false);
  });

  it("StackedFooter stays a neutral dark band (mirrors ClassicFooter overlay tokens)", () => {
    const s = read("src/components/layout/variants/footers/StackedFooter.tsx");
    expect(s.includes("bg-brand-strong"), "footer band stays brand-strong").toBe(true);
    expect(s.includes("border-[var(--surface)]/10"), "dividers use --surface overlay").toBe(true);
    expect(s.includes("bg-[var(--surface)]/10"), "social buttons use --surface overlay").toBe(true);
    expect(s.includes("bg-[var(--surface)]/5"), "hour rows use --surface overlay").toBe(true);
    expect(s.includes("text-[var(--surface)]"), "overlay text uses --surface").toBe(true);
    expect(s.includes("rounded-[var(--radius-md)]"), "radius uses vars").toBe(true);
    expect(/rounded-(sm|md|lg|xl)(?=\s|"|')/.test(s), "must have zero bare rounded").toBe(false);
    expect(s.includes("text-white"), "must have zero text-white").toBe(false);
  });

  it.each(RENDER_SET)("%s uses neutral surface/ink tokens", (p) => {
    const s = read(p);
    expect(s.includes("bg-[var(--surface)]"), `${p}: must use bg-[var(--surface)]`).toBe(true);
    expect(s.includes("text-[var(--ink)]"), `${p}: must use text-[var(--ink)]`).toBe(true);
    expect(s.includes("border-[var(--ink)]"), `${p}: must use border-[var(--ink)]`).toBe(true);
  });

  it.each(RENDER_SET)("%s uses radius vars, no bare rounded-lg/md/xl", (p) => {
    const s = read(p);
    expect(s.includes("rounded-[var(--radius-"), `${p}: must use rounded-[var(--radius-*)]`).toBe(true);
    expect(/rounded-(sm|md|lg|xl)(?=\s|"|')/.test(s), `${p}: must have zero bare rounded-md/lg`).toBe(false);
  });

  it("cards keep brand/accent tokens (neutral only, no hue shift)", () => {
    const book = read("src/components/public/BookCard.tsx");
    expect(book.includes("bg-brand-soft")).toBe(true);
    expect(book.includes("text-brand")).toBe(true);
    expect(book.includes("fill-accent text-accent")).toBe(true);
    const testi = read("src/components/public/TestimonialCard.tsx");
    expect(testi.includes("text-accent")).toBe(true);
    expect(testi.includes("bg-brand")).toBe(true);
    const faq = read("src/components/public/FaqAccordion.tsx");
    expect(faq.includes("bg-brand text-white")).toBe(true);
    expect(faq.includes("focus:ring-brand")).toBe(true);
  });

  it("shared.tsx still exports the footer merge point", () => {
    const s = read("src/components/layout/variants/shared.tsx");
    expect(s.includes("FOOTER_LINKS")).toBe(true);
    expect(s.includes("SOCIAL_ICON")).toBe(true);
    expect(s.includes("hourLabel")).toBe(true);
  });
});
