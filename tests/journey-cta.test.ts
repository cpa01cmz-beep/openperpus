import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/** S-journey-cta: catalog detail CTA must go somewhere live, never dead ?aksi=pinjam.
 * RED first: katalog/[slug] links to ?aksi=pinjam/?aksi=reservasi (self-reload dead-end,
 * LoanForm + reservation-checkout are staff-only) until rewired to /kontak?buku=slug
 * (public live route) with visible availability + 44px targets + empty-state CTA.
 */
describe("S-journey-cta dead CTA never reloads", () => {
  const katalogDetail = () => read("src/app/(public)/katalog/[slug]/page.tsx");

  it("detail has zero dead ?aksi= links", () => {
    const src = katalogDetail();
    expect(src.includes("aksi=pinjam"), "detail must not contain aksi=pinjam dead-end").toBe(false);
    expect(src.includes("?aksi="), "detail must not contain any ?aksi= dead-end reload").toBe(false);
  });

  it("available-state primary CTA links to live /kontak?buku=slug", () => {
    const src = katalogDetail();
    expect(
      src.includes("/kontak?buku="),
      "available CTA must link to /kontak?buku=slug (live public route)"
    ).toBe(true);
  });

  it("out-of-stock path links to live reservation/contact, never disabled-only", () => {
    const src = katalogDetail();
    // must still offer a live next step when stock is empty
    const hasLiveFallback =
      src.includes("/kontak?buku=") || src.includes('href="/reservasi"') || src.includes('href="/kontak"');
    expect(hasLiveFallback, "out-of-stock must offer live /kontak?buku=slug fallback").toBe(true);
    expect(src.includes("Stok Habis"), "out-of-stock visible state must keep Stok Habis label").toBe(true);
  });
});

describe("S-journey-cta visible availability state", () => {
  it("detail renders stock count + badge with polite live region", () => {
    const src = read("src/app/(public)/katalog/[slug]/page.tsx");
    expect(src.includes("stock_available"), "detail must render stock_available count").toBe(true);
    expect(src.includes("tersedia"), "detail must show visible tersedia availability text").toBe(true);
    expect(src.includes("aria-live"), "availability region must be announced via aria-live").toBe(true);
  });

  it("BookCard keeps visible stock badge and links to live detail", () => {
    const src = read("src/components/public/BookCard.tsx");
    expect(src.includes("stockState"), "BookCard must show stockState badge").toBe(true);
    expect(src.includes("/katalog/${"), "BookCard must link to live /katalog/[slug] detail").toBe(true);
    expect(src.includes("aksi="), "BookCard must never link to dead ?aksi=").toBe(false);
  });
});

describe("S-journey-cta 44px touch targets (mobile lane reuse)", () => {
  it("detail CTAs inherit min-h-[44px] pattern", () => {
    const src = read("src/app/(public)/katalog/[slug]/page.tsx");
    expect(src.includes("min-h-[44px]"), "detail CTAs must include min-h-[44px]").toBe(true);
  });
});

describe("S-journey-cta empty-state CTA", () => {
  it("detail offers live CTA when no related books", () => {
    const src = read("src/app/(public)/katalog/[slug]/page.tsx");
    // related.length > 0 branch exists; empty branch must still guide forward
    expect(src.includes('href="/katalog"'), "empty related state must link back to live /katalog").toBe(true);
  });

  it("buku/[slug] alias never strands user on dead CTA", () => {
    const src = read("src/app/(public)/buku/[slug]/page.tsx");
    expect(src.includes("aksi="), "buku alias must never contain dead ?aksi=").toBe(false);
    expect(
      src.includes("permanentRedirect") && src.includes("/katalog/"),
      "buku alias must redirect to canonical /katalog/[slug]"
    ).toBe(true);
  });
});
