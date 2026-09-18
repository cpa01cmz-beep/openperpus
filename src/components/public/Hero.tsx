import HeroSwitch from "@/components/hero/HeroSwitch";
import type { HeroProps } from "@/components/hero/variants/heroProps";
import type { Banner } from "@/lib/books";

type Props = {
  banners: Banner[];
  siteName: string;
  tagline?: string | null;
};

/**
 * @deprecated Legacy hero — dead code since S2. Delegates to HeroSwitch
 * (emerald-centered default → CenteredHero). Kept as a thin re-export so
 * any stale `components/public/Hero` imports keep working.
 * New code must import `@/components/hero/HeroSwitch` directly.
 */
export default function Hero({ banners, siteName, tagline }: Props) {
  const props: HeroProps = { banners, siteName, tagline };
  return <HeroSwitch variant="emerald-centered" {...props} />;
}
