import type { ComponentType } from 'react';
import type { FooterVariantProps, HeaderVariantProps } from './types';
import ClassicHeader from './headers/ClassicHeader';
import CenteredHeader from './headers/CenteredHeader';
import MinimalHeader from './headers/MinimalHeader';
import TopBarHeader from './headers/TopBarHeader';
import SplitHeader from './headers/SplitHeader';
import SketchHeader from './headers/SketchHeader';
import ClassicFooter from './footers/ClassicFooter';
import MinimalFooter from './footers/MinimalFooter';
import StackedFooter from './footers/StackedFooter';
import SketchFooter from './footers/SketchFooter';

export type HeaderVariantComponent = ComponentType<HeaderVariantProps>;
export type FooterVariantComponent = ComponentType<FooterVariantProps>;

/** Emerald defaults — fallback when a variant key is unknown. */
export const DEFAULT_HEADER_VARIANT = 'emerald-classic';
export const DEFAULT_FOOTER_VARIANT = 'emerald-standard';

/**
 * Header registry keyed by theme layout.headerVariant.
 * Theme keys (Task 2) map 1:1; generic aliases keep CenteredHeader reachable.
 */
export const HEADER_VARIANTS: Record<string, HeaderVariantComponent> = {
  [DEFAULT_HEADER_VARIANT]: ClassicHeader,
  'midnight-slim': MinimalHeader,
  'paper-minimal': MinimalHeader,
  'brutalist-bar': SplitHeader,
  'ocean-wave': TopBarHeader,
  'sketch-notebook': SketchHeader,
  // generic structural aliases (no if-hell for future themes)
  classic: ClassicHeader,
  centered: CenteredHeader,
  minimal: MinimalHeader,
  'top-bar': TopBarHeader,
  topbar: TopBarHeader,
  split: SplitHeader,
};

/**
 * Footer registry keyed by theme layout.footerVariant.
 */
export const FOOTER_VARIANTS: Record<string, FooterVariantComponent> = {
  [DEFAULT_FOOTER_VARIANT]: ClassicFooter,
  'midnight-extended': StackedFooter,
  'paper-colophon': MinimalFooter,
  'brutalist-index': StackedFooter,
  'ocean-harbor': StackedFooter,
  'sketch-margin': SketchFooter,
  // generic structural aliases
  classic: ClassicFooter,
  standard: ClassicFooter,
  minimal: MinimalFooter,
  colophon: MinimalFooter,
  stacked: StackedFooter,
  extended: StackedFooter,
  index: StackedFooter,
  harbor: StackedFooter,
};

/** Map lookup with emerald default fallback — never throws on unknown keys. */
export function resolveHeaderVariant(key?: string | null): HeaderVariantComponent {
  if (key && HEADER_VARIANTS[key]) return HEADER_VARIANTS[key] as HeaderVariantComponent;
  return ClassicHeader;
}

/** Map lookup with emerald default fallback — never throws on unknown keys. */
export function resolveFooterVariant(key?: string | null): FooterVariantComponent {
  if (key && FOOTER_VARIANTS[key]) return FOOTER_VARIANTS[key] as FooterVariantComponent;
  return ClassicFooter;
}

/** Block family for header/footer compatibility. */
export type BlockFamily = 'formal' | 'hard' | 'hand' | 'universal';

/** Block metadata (additive, does not affect resolve* behavior). */
export type BlockMeta = {
  id: string;
  kind: 'header' | 'footer';
  family: BlockFamily;
  supports: string[];
  version: 1;
};

/** Header block metadata keyed by HEADER_VARIANTS key. */
export const HEADER_BLOCK_META: Record<string, BlockMeta> = {
  'emerald-classic': {
    id: 'emerald-classic',
    kind: 'header',
    family: 'formal',
    supports: ['emerald', 'ocean', 'midnight', 'paper'],
    version: 1,
  },
  'midnight-slim': {
    id: 'midnight-slim',
    kind: 'header',
    family: 'formal',
    supports: ['emerald', 'ocean', 'midnight', 'paper'],
    version: 1,
  },
  'paper-minimal': {
    id: 'paper-minimal',
    kind: 'header',
    family: 'formal',
    supports: ['emerald', 'ocean', 'midnight', 'paper'],
    version: 1,
  },
  'brutalist-bar': {
    id: 'brutalist-bar',
    kind: 'header',
    family: 'hard',
    supports: ['brutalist'],
    version: 1,
  },
  'ocean-wave': {
    id: 'ocean-wave',
    kind: 'header',
    family: 'formal',
    supports: ['emerald', 'ocean', 'midnight', 'paper'],
    version: 1,
  },
  'sketch-notebook': {
    id: 'sketch-notebook',
    kind: 'header',
    family: 'hand',
    supports: ['sketch'],
    version: 1,
  },
  classic: {
    id: 'classic',
    kind: 'header',
    family: 'universal',
    supports: ['emerald', 'ocean', 'midnight', 'paper', 'brutalist', 'sketch'],
    version: 1,
  },
  centered: {
    id: 'centered',
    kind: 'header',
    family: 'universal',
    supports: ['emerald', 'ocean', 'midnight', 'paper', 'brutalist', 'sketch'],
    version: 1,
  },
  minimal: {
    id: 'minimal',
    kind: 'header',
    family: 'universal',
    supports: ['emerald', 'ocean', 'midnight', 'paper', 'brutalist', 'sketch'],
    version: 1,
  },
  'top-bar': {
    id: 'top-bar',
    kind: 'header',
    family: 'universal',
    supports: ['emerald', 'ocean', 'midnight', 'paper', 'brutalist', 'sketch'],
    version: 1,
  },
  topbar: {
    id: 'topbar',
    kind: 'header',
    family: 'universal',
    supports: ['emerald', 'ocean', 'midnight', 'paper', 'brutalist', 'sketch'],
    version: 1,
  },
  split: {
    id: 'split',
    kind: 'header',
    family: 'universal',
    supports: ['emerald', 'ocean', 'midnight', 'paper', 'brutalist', 'sketch'],
    version: 1,
  },
};

/** Footer block metadata keyed by FOOTER_VARIANTS key. */
export const FOOTER_BLOCK_META: Record<string, BlockMeta> = {
  'emerald-standard': {
    id: 'emerald-standard',
    kind: 'footer',
    family: 'formal',
    supports: ['emerald', 'ocean', 'midnight', 'paper'],
    version: 1,
  },
  'midnight-extended': {
    id: 'midnight-extended',
    kind: 'footer',
    family: 'formal',
    supports: ['emerald', 'ocean', 'midnight', 'paper'],
    version: 1,
  },
  'paper-colophon': {
    id: 'paper-colophon',
    kind: 'footer',
    family: 'formal',
    supports: ['emerald', 'ocean', 'midnight', 'paper'],
    version: 1,
  },
  'brutalist-index': {
    id: 'brutalist-index',
    kind: 'footer',
    family: 'hard',
    supports: ['brutalist'],
    version: 1,
  },
  'ocean-harbor': {
    id: 'ocean-harbor',
    kind: 'footer',
    family: 'formal',
    supports: ['emerald', 'ocean', 'midnight', 'paper'],
    version: 1,
  },
  'sketch-margin': {
    id: 'sketch-margin',
    kind: 'footer',
    family: 'hand',
    supports: ['sketch'],
    version: 1,
  },
  classic: {
    id: 'classic',
    kind: 'footer',
    family: 'universal',
    supports: ['emerald', 'ocean', 'midnight', 'paper', 'brutalist', 'sketch'],
    version: 1,
  },
  standard: {
    id: 'standard',
    kind: 'footer',
    family: 'universal',
    supports: ['emerald', 'ocean', 'midnight', 'paper', 'brutalist', 'sketch'],
    version: 1,
  },
  minimal: {
    id: 'minimal',
    kind: 'footer',
    family: 'universal',
    supports: ['emerald', 'ocean', 'midnight', 'paper', 'brutalist', 'sketch'],
    version: 1,
  },
  colophon: {
    id: 'colophon',
    kind: 'footer',
    family: 'universal',
    supports: ['emerald', 'ocean', 'midnight', 'paper', 'brutalist', 'sketch'],
    version: 1,
  },
  stacked: {
    id: 'stacked',
    kind: 'footer',
    family: 'universal',
    supports: ['emerald', 'ocean', 'midnight', 'paper', 'brutalist', 'sketch'],
    version: 1,
  },
  extended: {
    id: 'extended',
    kind: 'footer',
    family: 'universal',
    supports: ['emerald', 'ocean', 'midnight', 'paper', 'brutalist', 'sketch'],
    version: 1,
  },
  index: {
    id: 'index',
    kind: 'footer',
    family: 'universal',
    supports: ['emerald', 'ocean', 'midnight', 'paper', 'brutalist', 'sketch'],
    version: 1,
  },
  harbor: {
    id: 'harbor',
    kind: 'footer',
    family: 'universal',
    supports: ['emerald', 'ocean', 'midnight', 'paper', 'brutalist', 'sketch'],
    version: 1,
  },
};

/** Metadata lookup — returns undefined for unknown keys, never throws. */
export function getHeaderMeta(key?: string | null): BlockMeta | undefined {
  if (!key) return undefined;
  return HEADER_BLOCK_META[key];
}

/** Metadata lookup — returns undefined for unknown keys, never throws. */
export function getFooterMeta(key?: string | null): BlockMeta | undefined {
  if (!key) return undefined;
  return FOOTER_BLOCK_META[key];
}
