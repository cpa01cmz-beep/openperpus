import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import type { HeroProps } from './variants/heroProps';

const ClassicHero = dynamic(() => import('./variants/ClassicHero'), { ssr: true });
const CenteredHero = dynamic(() => import('./variants/CenteredHero'), { ssr: true });
const EditorialHero = dynamic(() => import('./variants/EditorialHero'), { ssr: true });
const StackedHero = dynamic(() => import('./variants/StackedHero'), { ssr: true });
const SplitHero = dynamic(() => import('./variants/SplitHero'), { ssr: true });

// Preload map for variant switching anticipation
const variantComponents = {
  'emerald-centered': CenteredHero,
  centered: CenteredHero,
  'paper-editorial': EditorialHero,
  editorial: EditorialHero,
  'brutalist-manifesto': StackedHero,
  stacked: StackedHero,
  'ocean-tide': SplitHero,
  split: SplitHero,
  'midnight-showcase': ClassicHero,
  classic: ClassicHero,
} as const;

type VariantKey = keyof typeof variantComponents;
const variantOrder: readonly VariantKey[] = [
  'emerald-centered',
  'paper-editorial',
  'brutalist-manifesto',
  'ocean-tide',
  'midnight-showcase',
] as const;

// Preload links for next/prev variant chunks
const variantPreloadPaths: Record<VariantKey, string> = {
  'emerald-centered': '/_next/static/chunks/components/hero/variants/CenteredHero.js',
  centered: '/_next/static/chunks/components/hero/variants/CenteredHero.js',
  'paper-editorial': '/_next/static/chunks/components/hero/variants/EditorialHero.js',
  editorial: '/_next/static/chunks/components/hero/variants/EditorialHero.js',
  'brutalist-manifesto': '/_next/static/chunks/components/hero/variants/StackedHero.js',
  stacked: '/_next/static/chunks/components/hero/variants/StackedHero.js',
  'ocean-tide': '/_next/static/chunks/components/hero/variants/SplitHero.js',
  split: '/_next/static/chunks/components/hero/variants/SplitHero.js',
  'midnight-showcase': '/_next/static/chunks/components/hero/variants/ClassicHero.js',
  classic: '/_next/static/chunks/components/hero/variants/ClassicHero.js',
};

type Props = HeroProps & {
  variant?: string;
};

/**
 * Map layout.heroVariant -> hero variant component.
 * Unknown / empty variants fall back to emerald default (CenteredHero),
 * with ClassicHero preserving the original public/Hero carousel.
 * Includes preload map for next/prev variant anticipation.
 */
export default function HeroSwitch({ variant, ...props }: Props) {
  // Preload next/prev variant chunks on mount
  useEffect(() => {
    const currentVariant = (variant as VariantKey) || 'emerald-centered';
    const currentIndex = variantOrder.indexOf(currentVariant);

    if (currentIndex >= 0) {
      const prevVariant = variantOrder[
        (currentIndex - 1 + variantOrder.length) % variantOrder.length
      ] as VariantKey;
      const nextVariant = variantOrder[(currentIndex + 1) % variantOrder.length] as VariantKey;

      // Preload prev/next variant chunks
      [prevVariant, nextVariant].forEach((v) => {
        const path = variantPreloadPaths[v];
        if (path) {
          const link = document.createElement('link');
          link.rel = 'preload';
          link.as = 'script';
          link.href = path;
          document.head.appendChild(link);
        }
      });
    }
  }, [variant]);

  // Render preload links for SSR
  const currentVariant = (variant as VariantKey) || 'emerald-centered';
  const currentIndex = variantOrder.indexOf(currentVariant);
  const prevVariant =
    currentIndex >= 0
      ? (variantOrder[(currentIndex - 1 + variantOrder.length) % variantOrder.length] as VariantKey)
      : 'emerald-centered';
  const nextVariant =
    currentIndex >= 0
      ? (variantOrder[(currentIndex + 1) % variantOrder.length] as VariantKey)
      : 'emerald-centered';
  const preloadLinks = [variantPreloadPaths[prevVariant], variantPreloadPaths[nextVariant]].filter(
    Boolean
  ) as string[];

  const Component = variantComponents[currentVariant] ?? CenteredHero;

  return (
    <>
      {preloadLinks.map((href, i) => (
        <link key={i} rel="preload" as="script" href={href} />
      ))}
      <Component {...props} />
    </>
  );
}
