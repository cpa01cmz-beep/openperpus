import type { ComponentType } from 'react';
import type { FooterVariantProps, HeaderVariantProps } from './types';
import ClassicHeader from './headers/ClassicHeader';
import CenteredHeader from './headers/CenteredHeader';
import MinimalHeader from './headers/MinimalHeader';
import TopBarHeader from './headers/TopBarHeader';
import SplitHeader from './headers/SplitHeader';
import ClassicFooter from './footers/ClassicFooter';
import MinimalFooter from './footers/MinimalFooter';
import StackedFooter from './footers/StackedFooter';

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
