import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** S-roi1 Kontak banner WA prefill 1-klik (WA-PREFILL-01..04).
 * Banner valid-slug hari ini hanya teks + "Lihat buku" (tanpa CTA WA).
 * Gherkin: lihat .omo/plans/roi-stories.md S-roi1.
 */
describe('WA-PREFILL-01 banner valid slug menampilkan CTA WA prefill', () => {
  it('renders wa.me link with encoded title, new tab, WA label', () => {
    const src = read('src/app/(public)/kontak/page.tsx');
    expect(
      src.includes('https://wa.me/'),
      'banner must render href starting "https://wa.me/"'
    ).toBe(true);
    expect(src.includes('encodeURIComponent'), 'WA text must use encodeURIComponent(title)').toBe(
      true
    );
    const hasLabel = src.includes('Chat WA') || src.includes('Reservasi via WA');
    expect(hasLabel, 'WA link label must contain "Chat WA" or "Reservasi via WA"').toBe(true);
    expect(src.includes('target="_blank"'), 'WA link must open in new tab (target="_blank")').toBe(
      true
    );
    expect(src.includes('rel="noreferrer"'), 'WA link must have rel="noreferrer"').toBe(true);
  });
});

describe('WA-PREFILL-02 nomor WA diambil dari settings, fallback telepon', () => {
  it('uses digit-stripped number from socials.whatsapp fallback phone', () => {
    const src = read('src/app/(public)/kontak/page.tsx');
    expect(src.includes('socials'), 'WA number must read settings.socials').toBe(true);
    expect(src.includes('whatsapp'), 'WA number must read socials.whatsapp').toBe(true);
    expect(src.includes('settings.phone'), 'WA number must fallback to settings.phone').toBe(true);
    const hasDigitStrip = src.includes('replace(/\\D/g') || src.includes('replace(/[^0-9]/g');
    expect(
      hasDigitStrip,
      'WA number must digit-strip (replace(/\\D/g, "")) so "+" / spaces never leak'
    ).toBe(true);
    expect(src.includes('wa.me/${'), 'wa.me href must interpolate stripped digits').toBe(true);
  });
});

describe('WA-PREFILL-03 tanpa nomor admin tidak ada link mati', () => {
  it('shows fallback text instead of dead wa.me link when no number', () => {
    const src = read('src/app/(public)/kontak/page.tsx');
    expect(
      src.includes('Nomor WA petugas belum tersedia'),
      'must show fallback "Nomor WA petugas belum tersedia hubungi via telepon/email di bawah."'
    ).toBe(true);
    const hasConditional =
      src.includes('waHref') || src.includes('waDigits') || src.includes('waNumber');
    expect(
      hasConditional,
      'WA link must be conditional on number availability (no dead link)'
    ).toBe(true);
  });
});

describe('WA-PREFILL-04 slug jahat tidak bocor ke href WA', () => {
  it('builds WA href from encoded book.title, never raw slug', () => {
    const src = read('src/app/(public)/kontak/page.tsx');
    expect(src.includes('sanitizeIlike'), 'kontak must keep sanitizeIlike for slug').toBe(true);
    expect(src.includes('https://wa.me/'), 'WA href must exist to assert its source').toBe(true);
    expect(
      src.includes('encodeURIComponent(book.title') || src.includes('encodeURIComponent(`Halo'),
      'WA text must encode book.title (fetched via sanitized slug), never raw slug'
    ).toBe(true);
    const leaksRawSlug =
      src.includes('wa.me/${buku') || src.includes('wa.me/${slug') || src.includes('wa.me/${raw');
    expect(leaksRawSlug, 'WA href must never interpolate raw slug').toBe(false);
    expect(src.includes('Buku tidak ditemukan'), 'must keep "Buku tidak ditemukan" fallback').toBe(
      true
    );
    expect(src.includes('href="/katalog"'), 'fallback must keep link to "/katalog"').toBe(true);
  });
});
