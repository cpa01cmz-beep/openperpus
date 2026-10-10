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
import {
  LAYOUT_DRAFT_EVENT,
  sectionLabel,
  variantLabel,
  type LayoutDraft,
} from '@/lib/layout-draft';

// Re-export untuk kompatibilitas impor lama (implementasi di server-safe
// src/lib/layout-draft.ts agar bisa dipakai Server Component juga).
export {
  LAYOUT_DRAFT_EVENT,
  SECTION_LABELS_ID,
  VARIANT_LABELS_ID,
  buildDraft,
  sectionLabel,
  variantLabel,
  type LayoutDraft,
  type LayoutDraftSection,
} from '@/lib/layout-draft';

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
