'use client';

/**
 * src/components/admin/LayoutPreview.tsx — panel pratinjau DRAF komposisi
 * layout (Fase 3). TIDAK menyimpan apa pun; hanya merender ringkasan blok
 * terpilih + urutan sections yang aktif + tautan beranda di tab baru.
 *
 * Menerima snapshot awal via props `{draft}` lalu mengikuti perubahan draf
 * dari LayoutPicker melalui event `LAYOUT_DRAFT_EVENT` (tanpa wrapper /
 * state lifting — page tetap server component).
 *
 * Mengekspor pula tipe + helper MURNI (client-safe) yang dipakai bersama:
 * - `LayoutDraft` / `LayoutDraftSection`
 * - `LAYOUT_DRAFT_EVENT`
 * - `SECTION_LABELS_ID` / `VARIANT_LABELS_ID` (label Bahasa Indonesia)
 * - `buildDraft(baseId, rawOverrides)` — snapshot draf awal dari
 *   theme_overrides mentah DB ( dipakai LayoutPicker + page.tsx ).
 */

import { useEffect, useState } from 'react';
import { ALLOWED_LAYOUT, SECTION_IDS, familyOf } from '@/lib/theme-compat';
import { getTheme } from '@/lib/themes';

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

  const baseRows: { id: string; enabled: boolean }[] = (SECTION_IDS as readonly string[]).map(
    (id) => {
      const found = base.homepageSections.find((s) => s.id === id);
      return { id, enabled: found ? !!found.enabled : true };
    }
  );

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
    for (const b of baseRows) {
      if (!seen.has(b.id)) merged.push(b);
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

export default function LayoutPreview({ draft }: { draft: LayoutDraft }) {
  const [live, setLive] = useState<LayoutDraft>(draft);

  useEffect(() => {
    const handler = (e: Event) => {
      setLive((e as CustomEvent<LayoutDraft>).detail);
    };
    window.addEventListener(LAYOUT_DRAFT_EVENT, handler);
    return () => window.removeEventListener(LAYOUT_DRAFT_EVENT, handler);
  }, []);

  const ordered = [...live.sections].sort((a, b) => a.order - b.order);
  const enabled = ordered.filter((s) => s.enabled);
  const disabledCount = ordered.length - enabled.length;

  return (
    <section
      aria-label="Pratinjau draf layout"
      className="grid max-w-4xl gap-4 rounded-2xl border bg-white p-6"
    >
      <div>
        <h2 className="font-semibold">Pratinjau Draf</h2>
        <p className="text-sm text-slate-500">
          Ringkasan draf yang sedang diubah — belum tersimpan sampai tombol Simpan ditekan.
        </p>
      </div>

      <dl className="grid gap-2 text-sm">
        <div className="flex items-baseline justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
          <dt className="font-medium text-slate-600">Header</dt>
          <dd className="text-right text-slate-900">
            {variantLabel(live.headerVariant)}{' '}
            <code className="text-xs text-slate-500">{live.headerVariant}</code>
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
          <dt className="font-medium text-slate-600">Hero</dt>
          <dd className="text-right text-slate-900">
            {variantLabel(live.heroVariant)}{' '}
            <code className="text-xs text-slate-500">{live.heroVariant}</code>
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
          <dt className="font-medium text-slate-600">Footer</dt>
          <dd className="text-right text-slate-900">
            {variantLabel(live.footerVariant)}{' '}
            <code className="text-xs text-slate-500">{live.footerVariant}</code>
          </dd>
        </div>
      </dl>

      <div className="grid gap-2">
        <h3 className="text-sm font-medium text-slate-700">
          Urutan section aktif ({enabled.length})
        </h3>
        {enabled.length === 0 ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            Tidak ada section aktif. Minimal 1 section harus aktif.
          </p>
        ) : (
          <ol className="grid gap-1.5">
            {enabled.map((s, i) => (
              <li
                key={s.id}
                className="flex items-center gap-3 rounded-lg border px-3 py-1.5 text-sm"
              >
                <span
                  aria-hidden="true"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white"
                >
                  {i + 1}
                </span>
                <span className="font-medium text-slate-800">{sectionLabel(s.id)}</span>
                <code className="text-xs text-slate-500">{s.id}</code>
              </li>
            ))}
          </ol>
        )}
        {disabledCount > 0 && (
          <p className="text-xs text-slate-500">
            {disabledCount} section nonaktif:{' '}
            {ordered
              .filter((s) => !s.enabled)
              .map((s) => sectionLabel(s.id))
              .join(', ')}
            .
          </p>
        )}
      </div>

      <div>
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium text-slate-800 transition hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
        >
          Buka beranda di tab baru
          <span aria-hidden="true">↗</span>
        </a>
      </div>
    </section>
  );
}
