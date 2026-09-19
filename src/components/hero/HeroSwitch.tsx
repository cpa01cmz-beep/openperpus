import dynamic from 'next/dynamic';
import type { HeroProps } from './variants/heroProps';

const ClassicHero = dynamic(() => import('./variants/ClassicHero'), { ssr: true });
const CenteredHero = dynamic(() => import('./variants/CenteredHero'), { ssr: true });
const EditorialHero = dynamic(() => import('./variants/EditorialHero'), { ssr: true });
const StackedHero = dynamic(() => import('./variants/StackedHero'), { ssr: true });
const SplitHero = dynamic(() => import('./variants/SplitHero'), { ssr: true });

type Props = HeroProps & {
  variant?: string;
};

/**
 * Map layout.heroVariant -> hero variant component.
 * Unknown / empty variants fall back to emerald default (CenteredHero),
 * with ClassicHero preserving the original public/Hero carousel.
 */
export default function HeroSwitch({ variant, ...props }: Props) {
  switch (variant) {
    case 'emerald-centered':
    case 'centered':
      return <CenteredHero {...props} />;
    case 'paper-editorial':
    case 'editorial':
      return <EditorialHero {...props} />;
    case 'brutalist-manifesto':
    case 'stacked':
      return <StackedHero {...props} />;
    case 'ocean-tide':
    case 'split':
      return <SplitHero {...props} />;
    case 'midnight-showcase':
    case 'classic':
      return <ClassicHero {...props} />;
    default:
      // Emerald default: emerald-centered
      return <CenteredHero {...props} />;
  }
}
