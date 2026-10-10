'use client';

/**
 * src/components/admin/LayoutPicker.tsx — pemilih layout terkunci (Fase 3).
 * Tema dikunci: hanya variant header/hero/footer dalam matriks famili base
 * (src/lib/theme-compat.ts) + urutan homepageSections yang bisa diubah.
 * Sketch terisolasi: opsi sketch-* disembunyikan untuk base non-hand.
 *
 * Tanpa dependensi baru: useState biasa, tanpa lib DnD (Naik/Turun manual).
 * Menyimpan via PUT /api/settings/theme { theme_overrides: { layout } }.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ALLOWED_LAYOUT, familyOf, type SectionId } from '@/lib/theme-compat';
import { getTheme } from '@/lib/themes';
import { errMsg } from '@/lib/admin-errors';
import {
  LAYOUT_DRAFT_EVENT,
  SECTION_LABELS_ID,
  VARIANT_LABELS_ID,
  buildDraft,
  type LayoutDraft,
} from '@/lib/layout-draft';

type InitialOverrides = {
  layout?: Record<string, unknown>;
} | null;

type Props = {
  currentBase: string;
  initialOverrides: InitialOverrides;
  onDraftChange?: (draft: LayoutDraft) => void;
};

type SectionRow = {
  id: SectionId;
  enabled: boolean;
};

type Status = 'idle' | 'saving' | 'saved' | 'error';

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2';

function VariantSelect({
  id,
  label,
  value,
  options,
  baseValue,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly string[];
  baseValue: string;
  onChange: (v: string) => void;
}) {
  const isDefault = value === baseValue;
  return (
    <div className="grid gap-1.5">
      <label
        htmlFor={id}
        className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-700"
      >
        {label}
        {isDefault && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            Bawaan preset
          </span>
        )}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`rounded-xl border px-3 py-2 text-sm text-slate-900 transition hover:border-slate-400 ${FOCUS_RING}`}
      >
        {options.map((key) => (
          <option key={key} value={key}>
            {VARIANT_LABELS_ID[key] ?? key} · {key}
          </option>
        ))}
      </select>
      <p className="text-xs text-slate-500">
        Blok: <code>{value}</code>
      </p>
    </div>
  );
}

export default function LayoutPicker({ currentBase, initialOverrides, onDraftChange }: Props) {
  const router = useRouter();
  const family = familyOf(currentBase);
  const allowed = ALLOWED_LAYOUT[family];
  const baseLayout = getTheme(currentBase).layout;
  const sketchLocked = family !== 'hand';

  const [initial] = useState(() => buildDraft(currentBase, initialOverrides));
  const [header, setHeader] = useState(initial.headerVariant);
  const [hero, setHero] = useState(initial.heroVariant);
  const [footer, setFooter] = useState(initial.footerVariant);
  const [rows, setRows] = useState<SectionRow[]>(() =>
    initial.sections.map((s) => ({ id: s.id as SectionId, enabled: s.enabled }))
  );
  const [status, setStatus] = useState<Status>('idle');
  const [notice, setNotice] = useState('');

  const enabledCount = useMemo(() => rows.filter((r) => r.enabled).length, [rows]);
  const canSave = enabledCount >= 1 && status !== 'saving';

  const draft: LayoutDraft = useMemo(
    () => ({
      base: currentBase,
      headerVariant: header,
      heroVariant: hero,
      footerVariant: footer,
      sections: rows.map((r, i) => ({ id: r.id, enabled: r.enabled, order: i })),
    }),
    [currentBase, header, hero, footer, rows]
  );

  // Siarkan draf ke LayoutPreview (event) + konsumen opsional (callback).
  useEffect(() => {
    onDraftChange?.(draft);
    window.dispatchEvent(new CustomEvent<LayoutDraft>(LAYOUT_DRAFT_EVENT, { detail: draft }));
  }, [draft, onDraftChange]);

  function move(id: SectionId, dir: -1 | 1) {
    setRows((prev) => {
      const i = prev.findIndex((r) => r.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      const [row] = next.splice(i, 1);
      next.splice(j, 0, row as SectionRow);
      return next;
    });
    setStatus('idle');
  }

  function toggle(id: SectionId) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));
    setStatus('idle');
    setNotice('');
  }

  async function onSave() {
    setNotice('');
    if (enabledCount < 1) {
      setStatus('error');
      setNotice('Minimal 1 section harus aktif.');
      return;
    }
    setStatus('saving');
    try {
      const res = await fetch('/api/settings/theme', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theme_overrides: {
            layout: {
              headerVariant: header,
              heroVariant: hero,
              footerVariant: footer,
              homepageSections: rows.map((r, i) => ({ id: r.id, enabled: r.enabled, order: i })),
            },
          },
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errMsg(json, 'Gagal menyimpan komposisi layout.'));
      setStatus('saved');
      setNotice('Komposisi layout tersimpan.');
      router.refresh();
    } catch (e) {
      setStatus('error');
      setNotice((e as Error).message);
    }
  }

  async function onReset() {
    const ok = window.confirm(
      'Kembalikan komposisi layout ke bawaan preset? Draf yang belum disimpan akan hilang.'
    );
    if (!ok) return;
    setNotice('');
    setStatus('saving');
    try {
      const res = await fetch('/api/settings/theme', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme_overrides: null, reset: true }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errMsg(json, 'Gagal mereset komposisi layout.'));
      const defaults = buildDraft(currentBase, null);
      setHeader(defaults.headerVariant);
      setHero(defaults.heroVariant);
      setFooter(defaults.footerVariant);
      setRows(defaults.sections.map((s) => ({ id: s.id as SectionId, enabled: s.enabled })));
      setStatus('saved');
      setNotice('Komposisi dikembalikan ke bawaan preset.');
      router.refresh();
    } catch (e) {
      setStatus('error');
      setNotice((e as Error).message);
    }
  }

  return (
    <section
      aria-label="Pemilih komposisi layout"
      className="grid max-w-4xl gap-5 rounded-2xl border bg-white p-6"
    >
      <div>
        <h2 className="font-semibold">Komposisi Layout</h2>
        <p className="text-sm text-slate-500">
          Tema dikunci pada preset <strong>{getTheme(currentBase).name}</strong> — hanya susunan
          blok yang dapat diubah. Hanya admin yang dapat menyimpan (librarian 403).
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <VariantSelect
          id="layout-header-variant"
          label="Header"
          value={header}
          options={allowed.headers}
          baseValue={baseLayout.headerVariant}
          onChange={(v) => {
            setHeader(v);
            setStatus('idle');
          }}
        />
        <VariantSelect
          id="layout-hero-variant"
          label="Hero"
          value={hero}
          options={allowed.heroes}
          baseValue={baseLayout.heroVariant}
          onChange={(v) => {
            setHero(v);
            setStatus('idle');
          }}
        />
        <VariantSelect
          id="layout-footer-variant"
          label="Footer"
          value={footer}
          options={allowed.footers}
          baseValue={baseLayout.footerVariant}
          onChange={(v) => {
            setFooter(v);
            setStatus('idle');
          }}
        />
      </div>
      {sketchLocked && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Navigasi sketch terkunci untuk tema sketch — opsi sketch tidak tersedia pada preset ini.
        </p>
      )}

      <div className="grid gap-2">
        <h3 className="text-sm font-medium text-slate-700">Urutan section beranda</h3>
        {enabledCount < 1 && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            Minimal 1 section harus aktif.
          </p>
        )}
        <ul className="grid gap-2">
          {rows.map((row, i) => {
            const label = SECTION_LABELS_ID[row.id] ?? row.id;
            return (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2"
              >
                <span
                  aria-hidden="true"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700"
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-800">{label}</span>
                  <code className="block text-xs text-slate-500">{row.id}</code>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={row.enabled}
                  aria-label={`${label} aktif`}
                  onClick={() => toggle(row.id)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${FOCUS_RING} ${
                    row.enabled
                      ? 'bg-slate-900 text-white'
                      : 'border border-slate-300 text-slate-600 hover:border-slate-400'
                  }`}
                >
                  {row.enabled ? 'Aktif' : 'Mati'}
                </button>
                <span className="flex gap-1">
                  <button
                    type="button"
                    aria-label={`Naikkan ${label}`}
                    disabled={i === 0}
                    onClick={() => move(row.id, -1)}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition disabled:opacity-40 ${FOCUS_RING} hover:border-slate-400`}
                  >
                    Naik
                  </button>
                  <button
                    type="button"
                    aria-label={`Turunkan ${label}`}
                    disabled={i === rows.length - 1}
                    onClick={() => move(row.id, 1)}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition disabled:opacity-40 ${FOCUS_RING} hover:border-slate-400`}
                  >
                    Turun
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <div aria-live="polite" className="grid gap-2">
        {status === 'error' && notice && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            Gagal. {notice}
          </p>
        )}
        {status === 'saved' && notice && (
          <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
            Tersimpan. {notice}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!canSave}
            onClick={onSave}
            className={`rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition disabled:opacity-50 ${FOCUS_RING} hover:bg-slate-700`}
          >
            {status === 'saving' ? 'Menyimpan…' : 'Simpan'}
          </button>
          <button
            type="button"
            disabled={status === 'saving'}
            onClick={onReset}
            className={`rounded-xl border px-4 py-2 text-sm font-medium text-slate-700 transition disabled:opacity-50 ${FOCUS_RING} hover:border-slate-400`}
          >
            Reset ke preset
          </button>
        </div>
      </div>
    </section>
  );
}
