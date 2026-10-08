import { describe, expect, it } from 'vitest';
import { THEMES, themes } from '@/lib/themes';

/** Kontrak kontras WCAG AA — dunia Kartu Katalog, 5 material.
 *  Pasangan ini dipakai nyata di komponen (tombol, link, chip, stempel,
 *  announcement). Gagal di sini = teks tak terbaca di satu tema. */

const THEME_IDS = ['emerald', 'midnight', 'paper', 'brutalist', 'ocean'] as const;

function srgb(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`bukan hex 6 digit: ${hex}`);
  const n = parseInt(m[1]!, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
}

export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Pasangan yang benar-benar dipakai komponen → minimal 4.5:1 (AA teks kecil). */
const PAIRS: Array<
  [
    fg: keyof (typeof THEMES)['emerald']['tokens'],
    bg: keyof (typeof THEMES)['emerald']['tokens'],
    where: string,
  ]
> = [
  ['ink', 'surface', 'body di atas latar kartu'],
  ['heading', 'surface', 'judul di atas latar kartu'],
  ['surface', 'brand', 'label tombol utama di atas bg-brand'],
  ['surface', 'accent', 'label tombol aksi di atas bg-accent'],
  ['surface', 'brand-strong', 'label tombol solid di atas bg-brand-strong'],
  ['brand', 'surface', 'link/text-brand'],
  ['brand', 'brand-soft', 'chip bg-brand-soft + text-brand'],
  ['accent', 'surface', 'text-accent (label seksi)'],
  ['accent', 'accent-soft', 'notice bg-accent-soft + text-accent'],
  ['heading', 'brand-soft', 'kartu bertekstur brand-soft'],
  ['heading', 'accent-soft', 'pengumuman bg-accent-soft'],
];

describe('kontras WCAG AA kelima tema', () => {
  for (const id of THEME_IDS) {
    it(`${id}: semua pasangan teks ≥ 4.5:1`, () => {
      const t = THEMES[id]!;
      const toks = t.tokens as Record<string, string>;
      for (const [fg, bg, where] of PAIRS) {
        const ratio = contrast(toks[fg]!, toks[bg]!);
        expect(
          ratio,
          `${id}: ${fg} (${toks[fg]}) di atas ${bg} (${toks[bg]}) = ${ratio.toFixed(2)}:1 — ${where}`
        ).toBeGreaterThanOrEqual(4.5);
      }
    });

    it(`${id}: tema memiliki warna latar & tinta sendiri (bukan default putih-hitam)`, () => {
      const toks = THEMES[id]!.tokens as Record<string, string>;
      expect(toks.surface).toMatch(/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i);
      expect(toks.ink).toMatch(/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i);
      expect(toks.surface?.toLowerCase()).not.toBe(toks.ink?.toLowerCase());
    });
  }

  it('setiap tema memakai pasangan warna yang berbeda dari tetangganya', () => {
    const signatures = themes.map(
      (t) =>
        `${t.tokens.surface}|${t.tokens.brand}|${t.tokens.accent}|${t.fonts.heading}|${t.radius.lg}`
    );
    expect(new Set(signatures).size).toBe(themes.length);
  });
});
