/**
 * src/lib/theme-overrides.ts — override LAYOUT-only Fase 1 (server-only).
 * Tema dikunci: hanya kunci `layout` yang diterima; tokens/fonts/radius/
 * shadow/spacing ditolak di API dengan 422 (lihat LOCKED_THEME_MESSAGE).
 *
 * Tanpa dependensi baru: validasi hand-rolled dengan antarmuka mirip Zod
 * ({ safeParse, parse }) agar route bisa `import { ThemeOverridesLayoutSchema }`.
 */
import 'server-only';

import { getTheme, type ThemeDef } from './themes';
import {
  SECTION_IDS,
  fallbackVariant,
  isCompatible,
  type LayoutKind,
  type SectionId,
} from './theme-compat';

/** Enam id tema yang dikenal (mirror CHECK 0020_sketch_theme.sql). */
export const THEME_IDS = ['emerald', 'midnight', 'paper', 'brutalist', 'ocean', 'sketch'] as const;

export type ThemeOverrideId = (typeof THEME_IDS)[number];

/** Pesan kunci-tema (Indonesia) untuk penolakan tokens/*. */
export const LOCKED_THEME_MESSAGE = 'Tema dikunci, hanya layout yang dapat diubah.';

const LOCKED_KEYS = ['tokens', 'fonts', 'radius', 'shadow', 'spacing'] as const;
const LAYOUT_KEYS = ['headerVariant', 'heroVariant', 'footerVariant', 'homepageSections'] as const;
const SECTION_KEYS = ['id', 'enabled', 'order'] as const;

export const MAX_SECTIONS = 7;
export const MAX_ORDER = 50;
export const MAX_OVERRIDES_CHARS = 8000;

export type SectionOverride = {
  id: SectionId;
  enabled: boolean;
  order?: number;
};

export type LayoutOverrides = {
  headerVariant?: string;
  heroVariant?: string;
  footerVariant?: string;
  homepageSections?: SectionOverride[];
};

export type ThemeOverridesData = {
  layout: LayoutOverrides;
};

export type ParseSuccess<T> = { success: true; data: T };
export type ParseFailure = { success: false; error: string };
export type ParseResult<T> = ParseSuccess<T> | ParseFailure;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isValidOrder(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_ORDER;
}

function isSectionId(v: unknown): v is SectionId {
  return typeof v === 'string' && (SECTION_IDS as readonly string[]).includes(v);
}

function validateSectionStrict(v: unknown, index: number): string | null {
  if (!isRecord(v)) return `homepageSections[${index}] harus berupa object.`;
  for (const k of Object.keys(v)) {
    if (!(SECTION_KEYS as readonly string[]).includes(k)) {
      return `homepageSections[${index}] memiliki kunci tak dikenal: "${k}".`;
    }
  }
  if (!isSectionId(v.id)) {
    return `homepageSections[${index}].id tidak dikenal. Pilih: ${SECTION_IDS.join(', ')}.`;
  }
  if (typeof v.enabled !== 'boolean') {
    return `homepageSections[${index}].enabled harus boolean.`;
  }
  if (v.order !== undefined && !isValidOrder(v.order)) {
    return `homepageSections[${index}].order harus bilangan bulat 0–${MAX_ORDER}.`;
  }
  return null;
}

function validateLayoutStrict(v: unknown): string | null {
  if (!isRecord(v)) return 'layout harus berupa object.';
  for (const k of Object.keys(v)) {
    if (!(LAYOUT_KEYS as readonly string[]).includes(k)) {
      return `Kunci layout tak dikenal: "${k}".`;
    }
  }
  for (const field of ['headerVariant', 'heroVariant', 'footerVariant'] as const) {
    const val = v[field];
    if (val !== undefined && (typeof val !== 'string' || val.length === 0)) {
      return `${field} harus string tak kosong.`;
    }
  }
  if (v.homepageSections !== undefined) {
    if (!Array.isArray(v.homepageSections)) return 'homepageSections harus berupa array.';
    if (v.homepageSections.length > MAX_SECTIONS) {
      return `homepageSections maksimal ${MAX_SECTIONS} section.`;
    }
    for (let i = 0; i < v.homepageSections.length; i++) {
      const err = validateSectionStrict(v.homepageSections[i], i);
      if (err) return err;
    }
  }
  return null;
}

/**
 * Skema strict untuk theme_overrides Fase 1 (mirip Zod `.strict()`):
 * root hanya boleh berisi `layout`; tokens/fonts/radius/shadow/spacing
 * ditolak dengan LOCKED_THEME_MESSAGE (422 di route).
 */
export const ThemeOverridesLayoutSchema = {
  safeParse(input: unknown): ParseResult<ThemeOverridesData> {
    if (!isRecord(input)) {
      return { success: false, error: 'theme_overrides harus berupa object.' };
    }
    for (const k of Object.keys(input)) {
      if ((LOCKED_KEYS as readonly string[]).includes(k)) {
        return { success: false, error: LOCKED_THEME_MESSAGE };
      }
      if (k !== 'layout') {
        return { success: false, error: `Kunci tak dikenal: "${k}". ${LOCKED_THEME_MESSAGE}` };
      }
    }
    const layout = input.layout ?? {};
    const err = validateLayoutStrict(layout);
    if (err) return { success: false, error: err };
    const rec = layout as Record<string, unknown>;
    const data: ThemeOverridesData = { layout: {} };
    if (typeof rec.headerVariant === 'string') data.layout.headerVariant = rec.headerVariant;
    if (typeof rec.heroVariant === 'string') data.layout.heroVariant = rec.heroVariant;
    if (typeof rec.footerVariant === 'string') data.layout.footerVariant = rec.footerVariant;
    if (Array.isArray(rec.homepageSections)) {
      data.layout.homepageSections = (rec.homepageSections as Record<string, unknown>[]).map(
        (s) => {
          const out: SectionOverride = {
            id: s.id as SectionId,
            enabled: s.enabled as boolean,
          };
          if (isValidOrder(s.order)) out.order = s.order as number;
          return out;
        }
      );
    }
    return { success: true, data };
  },
  parse(input: unknown): ThemeOverridesData {
    const r = ThemeOverridesLayoutSchema.safeParse(input);
    if (!r.success) throw new Error((r as ParseFailure).error);
    return (r as ParseSuccess<ThemeOverridesData>).data;
  },
};

/**
 * Pembersih lenient untuk jalur render (tidak pernah melempar):
 * - null/undefined/bukan object -> null (tanpa override).
 * - Kunci non-layout diabaikan (tema tetap dikunci, tanpa error).
 * - Section: drop unknown, dedupe first-win, default enabled=true,
 *   order hanya bila int 0..50.
 */
export function sanitizeLayoutOverrides(input: unknown): ThemeOverridesData | null {
  if (input === null || input === undefined) return null;
  if (!isRecord(input)) return null;
  const rawLayout = input.layout;
  if (rawLayout === undefined) return null;
  if (!isRecord(rawLayout)) return null;
  const out: LayoutOverrides = {};
  for (const field of ['headerVariant', 'heroVariant', 'footerVariant'] as const) {
    const val = rawLayout[field];
    if (typeof val === 'string' && val.length > 0) out[field] = val;
  }
  const sections = rawLayout.homepageSections;
  if (sections !== undefined && Array.isArray(sections)) {
    const seen = new Set<string>();
    const cleaned: SectionOverride[] = [];
    for (const s of sections.slice(0, MAX_SECTIONS)) {
      if (!isRecord(s)) continue;
      if (!isSectionId(s.id)) continue;
      const id = s.id as SectionId;
      if (seen.has(id)) continue;
      seen.add(id);
      const entry: SectionOverride = {
        id,
        enabled: typeof s.enabled === 'boolean' ? (s.enabled as boolean) : true,
      };
      if (isValidOrder(s.order)) entry.order = s.order as number;
      cleaned.push(entry);
    }
    out.homepageSections = cleaned;
  }
  return { layout: out };
}

function mergeHomepageSections(
  base: ThemeDef['layout']['homepageSections'],
  overrides: SectionOverride[]
): ThemeDef['layout']['homepageSections'] {
  if (overrides.length === 0) return base;
  const decorated = overrides.map((s, index) => ({
    s,
    index,
    rank: typeof s.order === 'number' ? (s.order as number) : Number.MAX_SAFE_INTEGER,
  }));
  decorated.sort((a, b) => (a.rank === b.rank ? a.index - b.index : a.rank - b.rank));
  const mentioned = new Set<string>(decorated.map((d) => d.s.id));
  const merged: ThemeDef['layout']['homepageSections'] = decorated.map((d) => ({
    id: d.s.id,
    enabled: d.s.enabled,
  }));
  for (const b of base) {
    if (!mentioned.has(b.id)) merged.push({ id: b.id, enabled: b.enabled });
  }
  return merged;
}

function cloneTheme(base: ThemeDef): ThemeDef {
  if (typeof structuredClone === 'function') return structuredClone(base);
  return JSON.parse(JSON.stringify(base)) as ThemeDef;
}

/**
 * Theme efektif = clone base + override layout yang kompatibel.
 * - Variant inkompatibel -> pakai bawaan base (via isCompatible/fallback implisit).
 * - Sections: drop unknown, dedupe first-win, default enabled=true,
 *   sort by (order,index), sections tak disebut ikut base di belakang,
 *   kosong -> base.
 * - TIDAK PERNAH memutasi THEMES. NULL -> clone base yang identik.
 */
export function getEffectiveTheme(baseId: string, rawOverrides: unknown): ThemeDef {
  const base = getTheme(baseId);
  const clone = cloneTheme(base);
  const familyBaseId = clone.id || baseId;
  const sanitized = sanitizeLayoutOverrides(rawOverrides);
  if (!sanitized) return clone;
  const ov = sanitized.layout;
  const kinds: { field: 'headerVariant' | 'heroVariant' | 'footerVariant'; kind: LayoutKind }[] = [
    { field: 'headerVariant', kind: 'header' },
    { field: 'heroVariant', kind: 'hero' },
    { field: 'footerVariant', kind: 'footer' },
  ];
  for (const { field, kind } of kinds) {
    const val = ov[field];
    if (typeof val === 'string' && val.length > 0) {
      if (isCompatible(familyBaseId, kind, val)) {
        clone.layout[field] = val;
      } else {
        clone.layout[field] = fallbackVariant(familyBaseId, kind);
      }
    }
  }
  if (ov.homepageSections !== undefined && ov.homepageSections.length > 0) {
    const merged = mergeHomepageSections(base.layout.homepageSections, ov.homepageSections);
    if (merged.length > 0) clone.layout.homepageSections = merged;
  }
  return clone;
}

/** Helper dari baris settings (active_theme + theme_overrides mentah dari DB). */
export function getEffectiveThemeFromSettings(settings: {
  active_theme?: unknown;
  theme_overrides?: unknown;
}): ThemeDef {
  const baseId =
    typeof settings?.active_theme === 'string' && settings.active_theme.length > 0
      ? (settings.active_theme as string)
      : 'emerald';
  const raw = (settings as { theme_overrides?: unknown })?.theme_overrides ?? null;
  return getEffectiveTheme(baseId, raw);
}
