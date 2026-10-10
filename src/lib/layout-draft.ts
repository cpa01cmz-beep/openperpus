/**
 * src/lib/layout-draft.ts — tipe + label + builder snapshot draf komposisi
 * layout (Fase 3).
 *
 * SERVER-SAFE: modul murni tanpa 'use client', tanpa React, tanpa
 * window/document. Boleh diimpor Server Component (mis.
 * src/app/admin/pengaturan/page.tsx), Client Component (LayoutPicker,
 * LayoutPreview), maupun test node.
 *
 * JANGAN pindahkan kembali ke modul 'use client': Server Component yang
 * memanggil fungsi dari modul client akan throw saat render
 * ("Attempted to call ... from the server but ... is on the client")
 * dan menjatuhkan seluruh halaman ke error boundary admin.
 */

import { ALLOWED_LAYOUT, SECTION_IDS, familyOf } from './theme-compat';
import { getTheme } from './themes';

export type LayoutDraftSection = {
  id: string;
  enabled: boolean;
  order: number;
};

export type LayoutDraft = {
  base: string;
  headerVariant: string;
  heroVariant: string;
  footerVariant: string;
  sections: LayoutDraftSection[];
};

/** Nama event jembatan LayoutPicker -> LayoutPreview (satu arah). */
export const LAYOUT_DRAFT_EVENT = 'openperpus:layout-draft';

/** Label Indonesia untuk 7 section homepage. */
export const SECTION_LABELS_ID: Record<string, string> = {
  hero: 'Hero',
  announcement: 'Pengumuman',
  stats: 'Statistik',
  welcome: 'Sambutan',
  featured: 'Koleksi Unggulan',
  news: 'Berita',
  testimonials: 'Testimoni',
};

/** Label Indonesia untuk variant blok yang dikenal; tak dikenal -> key mentah. */
export const VARIANT_LABELS_ID: Record<string, string> = {
  // header
  'emerald-classic': 'Klasik Emerald',
  'midnight-slim': 'Ramping Midnight',
  'paper-minimal': 'Minimal Paper',
  'brutalist-bar': 'Bar Brutalist',
  'ocean-wave': 'Gelombang Ocean',
  'sketch-notebook': 'Buku Catatan Sketch',
  // footer
  'emerald-standard': 'Standar Emerald',
  'midnight-extended': 'Luas Midnight',
  'paper-colophon': 'Kolofon Paper',
  'brutalist-index': 'Indeks Brutalist',
  'ocean-harbor': 'Pelabuhan Ocean',
  'sketch-margin': 'Margin Sketch',
  // hero
  'emerald-centered': 'Terpusat Emerald',
  'midnight-showcase': 'Etalase Midnight',
  'paper-editorial': 'Editorial Paper',
  'brutalist-manifesto': 'Manifesto Brutalist',
  'ocean-tide': 'Pasang Ocean',
  'sketch-doodle': 'Coretan Sketch',
  // alias struktural netral
  classic: 'Klasik',
  centered: 'Terpusat',
  minimal: 'Minimal',
  standard: 'Standar',
  colophon: 'Kolofon',
  stacked: 'Bertumpuk',
  extended: 'Luas',
  index: 'Indeks',
  harbor: 'Pelabuhan',
  split: 'Terbagi',
  'top-bar': 'Bilah Atas',
  topbar: 'Bilah Atas',
  editorial: 'Editorial',
  sketch: 'Sketsa',
  doodle: 'Coretan',
};

export function variantLabel(key: string): string {
  return VARIANT_LABELS_ID[key] ?? key;
}

export function sectionLabel(id: string): string {
  return SECTION_LABELS_ID[id] ?? id;
}

function asLayoutRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const layout = (input as { layout?: unknown }).layout;
  if (!layout || typeof layout !== 'object' || Array.isArray(layout)) return {};
  return layout as Record<string, unknown>;
}

function pickVariant(raw: unknown, allowed: readonly string[], fallback: string): string {
  return typeof raw === 'string' && raw.length > 0 && allowed.includes(raw) ? raw : fallback;
}

/**
 * Bangun snapshot draf dari theme_overrides mentah (DB).
 * - Variant di luar matriks famili -> bawaan preset base.
 * - Sections meniru merge server: sort by (order,index), dedupe first-win,
 *   sections tak disebut ikut base di belakang, kosong/invalid -> base.
 */
export function buildDraft(baseId: string, rawOverrides: unknown): LayoutDraft {
  const family = familyOf(baseId);
  const allowed = ALLOWED_LAYOUT[family];
  const base = getTheme(baseId).layout;
  const raw = asLayoutRecord(rawOverrides);

  const headerVariant = pickVariant(raw.headerVariant, allowed.headers, base.headerVariant);
  const heroVariant = pickVariant(raw.heroVariant, allowed.heroes, base.heroVariant);
  const footerVariant = pickVariant(raw.footerVariant, allowed.footers, base.footerVariant);

  // Urutan bawaan = urutan preset base (bukan urutan kanonis SECTION_IDS),
  // selaras dengan mergeHomepageSections() server.
  const baseRows: { id: string; enabled: boolean }[] = base.homepageSections.map((s) => ({
    id: s.id,
    enabled: !!s.enabled,
  }));

  const list: unknown[] = Array.isArray(raw.homepageSections) ? raw.homepageSections : [];
  const seen = new Set<string>();
  const decorated: { id: string; enabled: boolean; rank: number; index: number }[] = [];
  list.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
    const rec = entry as Record<string, unknown>;
    if (typeof rec.id !== 'string' || !(SECTION_IDS as readonly string[]).includes(rec.id)) {
      return;
    }
    if (seen.has(rec.id)) return;
    seen.add(rec.id);
    decorated.push({
      id: rec.id,
      enabled: typeof rec.enabled === 'boolean' ? rec.enabled : true,
      rank:
        typeof rec.order === 'number' && Number.isInteger(rec.order)
          ? (rec.order as number)
          : Number.MAX_SAFE_INTEGER,
      index,
    });
  });

  let merged: { id: string; enabled: boolean }[];
  if (decorated.length > 0) {
    decorated.sort((a, b) => (a.rank === b.rank ? a.index - b.index : a.rank - b.rank));
    merged = decorated.map((d) => ({ id: d.id, enabled: d.enabled }));
    for (const b of base.homepageSections) {
      if (!seen.has(b.id)) merged.push({ id: b.id, enabled: !!b.enabled });
    }
  } else {
    merged = baseRows;
  }

  return {
    base: baseId,
    headerVariant,
    heroVariant,
    footerVariant,
    sections: merged.map((r, i) => ({ id: r.id, enabled: r.enabled, order: i })),
  };
}
