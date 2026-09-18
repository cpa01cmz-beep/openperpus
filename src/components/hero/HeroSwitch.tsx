import ClassicHero from "./variants/ClassicHero";
import CenteredHero from "./variants/CenteredHero";
import EditorialHero from "./variants/EditorialHero";
import StackedHero from "./variants/StackedHero";
import SplitHero from "./variants/SplitHero";
import type { HeroProps } from "./variants/heroProps";

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
    case "emerald-centered":
    case "centered":
      return <CenteredHero {...props} />;
    case "paper-editorial":
    case "editorial":
      return <EditorialHero {...props} />;
    case "brutalist-manifesto":
    case "stacked":
      return <StackedHero {...props} />;
    case "ocean-tide":
    case "split":
      return <SplitHero {...props} />;
    case "midnight-showcase":
    case "classic":
      return <ClassicHero {...props} />;
    default:
      // Emerald default: emerald-centered
      return <CenteredHero {...props} />;
  }
}
