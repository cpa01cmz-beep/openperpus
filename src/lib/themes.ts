/** Theme token registry skeleton (Wave 2). Emerald identity tokenized 1:1, no hue shift. */

/** Eight hex color tokens every theme must provide. */
export type ThemeTokens = {
  brand: string;
  'brand-soft': string;
  'brand-strong': string;
  accent: string;
  'accent-soft': string;
  surface: string;
  ink: string;
  heading: string;
};

/** Single homepage section entry in ordered layout. */
export type HomepageSection = {
  id: string;
  enabled: boolean;
};

/** Font stacks per theme. */
export type ThemeFonts = {
  heading: string;
  body: string;
};

/** Radius scale per theme (CSS radius values). */
export type ThemeRadius = {
  sm: string;
  md: string;
  lg: string;
};

/** Shadow scale per theme (box-shadow values). */
export type ThemeShadow = {
  sm: string;
  md: string;
  lg: string;
};

/** Spacing tokens per theme. */
export type ThemeSpacing = {
  container: string;
  section: string;
  card: string;
};

/** Layout variants + ordered homepage sections per theme. */
export type ThemeLayout = {
  headerVariant: string;
  heroVariant: string;
  footerVariant: string;
  homepageSections: HomepageSection[];
};

/** Single theme definition: identity + tokens + layout system. */
export type ThemeDef = {
  id: string;
  name: string;
  description: string;
  tokens: ThemeTokens;
  fonts: ThemeFonts;
  radius: ThemeRadius;
  shadow: ThemeShadow;
  spacing: ThemeSpacing;
  layout: ThemeLayout;
};

/** Registry map keyed by theme id. T9 merges midnight/paper/brutalist/ocean here. */
export const THEMES: Record<string, ThemeDef> = {
  emerald: {
    id: 'emerald',
    name: 'Emerald',
    description: 'Default emerald identity — tokenized from current brand.',
    tokens: {
      brand: '#047857',
      'brand-soft': '#ecfdf5',
      'brand-strong': '#065f46',
      accent: '#f59e0b',
      'accent-soft': '#fef3c7',
      surface: '#ffffff',
      ink: '#0f172a',
      heading: '#065f46',
    },
    fonts: {
      heading: "var(--font-playfair), 'Playfair Display', Georgia, serif",
      body: "var(--font-inter), 'Inter', ui-sans-serif, system-ui, sans-serif",
    },
    radius: { sm: '0.375rem', md: '0.5rem', lg: '1rem' },
    shadow: {
      sm: '0 1px 2px 0 rgb(15 23 42 / 0.06)',
      md: '0 4px 12px -2px rgb(4 120 87 / 0.14), 0 2px 4px -2px rgb(15 23 42 / 0.08)',
      lg: '0 12px 32px -8px rgb(4 120 87 / 0.20), 0 4px 12px -4px rgb(15 23 42 / 0.10)',
    },
    spacing: { container: '72rem', section: '4rem', card: '1.5rem' },
    layout: {
      headerVariant: 'emerald-classic',
      heroVariant: 'emerald-centered',
      footerVariant: 'emerald-standard',
      homepageSections: [
        { id: 'hero', enabled: true },
        { id: 'announcement', enabled: true },
        { id: 'stats', enabled: true },
        { id: 'welcome', enabled: true },
        { id: 'featured', enabled: true },
        { id: 'news', enabled: true },
        { id: 'testimonials', enabled: true },
      ],
    },
  },
  midnight: {
    id: 'midnight',
    name: 'Midnight Premium',
    description:
      'Midnight premium: deep navy luxury surface with rich gold accent for expensive after-hours reading.',
    tokens: {
      brand: '#6BA3D6',
      'brand-soft': '#3D5A80',
      'brand-strong': '#98C4E8',
      accent: '#D4AF37',
      'accent-soft': '#3D3518',
      surface: '#0B1220',
      ink: '#E9EEF6',
      heading: '#E9EEF6',
    },
    fonts: {
      heading: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif",
      body: "var(--font-inter), 'Inter', ui-sans-serif, system-ui, sans-serif",
    },
    radius: { sm: '0.25rem', md: '0.375rem', lg: '0.625rem' },
    shadow: {
      sm: '0 1px 2px 0 rgb(0 0 0 / 0.4)',
      md: '0 8px 24px -4px rgb(0 0 0 / 0.55)',
      lg: '0 24px 64px -12px rgb(0 0 0 / 0.7)',
    },
    spacing: { container: '76rem', section: '5.5rem', card: '2rem' },
    layout: {
      headerVariant: 'midnight-slim',
      heroVariant: 'midnight-showcase',
      footerVariant: 'midnight-extended',
      homepageSections: [
        { id: 'hero', enabled: true },
        { id: 'featured', enabled: true },
        { id: 'stats', enabled: true },
        { id: 'announcement', enabled: true },
        { id: 'welcome', enabled: true },
        { id: 'testimonials', enabled: true },
        { id: 'news', enabled: true },
      ],
    },
  },
  paper: {
    id: 'paper',
    name: 'Paper Minimal',
    description:
      'Warm monochrome editorial light — flat paper surfaces, muted sage/stone accents, no gradients.',
    tokens: {
      brand: '#6F7D6C',
      'brand-soft': '#E8ECE5',
      'brand-strong': '#4A5548',
      accent: '#A98A6B',
      'accent-soft': '#E5DBCC',
      surface: '#FAF7F2',
      ink: '#2B2622',
      heading: '#4A5548',
    },
    fonts: {
      heading: "var(--font-source-serif), 'Source Serif 4', Georgia, serif",
      body: "var(--font-source-sans), 'Source Sans 3', ui-sans-serif, system-ui, sans-serif",
    },
    radius: { sm: '0.125rem', md: '0.25rem', lg: '0.375rem' },
    shadow: {
      sm: '0 1px 1px 0 rgb(43 38 34 / 0.05)',
      md: '0 2px 6px -1px rgb(43 38 34 / 0.07)',
      lg: '0 6px 16px -4px rgb(43 38 34 / 0.08)',
    },
    spacing: { container: '68rem', section: '6rem', card: '2.25rem' },
    layout: {
      headerVariant: 'paper-minimal',
      heroVariant: 'paper-editorial',
      footerVariant: 'paper-colophon',
      homepageSections: [
        { id: 'announcement', enabled: true },
        { id: 'hero', enabled: true },
        { id: 'welcome', enabled: true },
        { id: 'stats', enabled: true },
        { id: 'featured', enabled: true },
        { id: 'testimonials', enabled: true },
        { id: 'news', enabled: true },
      ],
    },
  },
  brutalist: {
    id: 'brutalist',
    name: 'Brutalist',
    description:
      'Raw mechanical utilitarian theme — near-black ink on off-white paper, safety-orange brand with signal-yellow accent, flat rigid tokens, declassified-blueprint feel.',
    tokens: {
      brand: '#D93600',
      'brand-soft': '#FFD9C2',
      'brand-strong': '#8F2A00',
      accent: '#E6AC00',
      'accent-soft': '#FFF0B3',
      surface: '#F2EEE3',
      ink: '#111110',
      heading: '#111110',
    },
    fonts: {
      heading: "var(--font-archivo), 'Archivo Black', 'Arial Black', sans-serif",
      body: "var(--font-space), 'Space Grotesk', ui-monospace, monospace",
    },
    radius: { sm: '0', md: '0', lg: '0' },
    shadow: {
      sm: '2px 2px 0 0 #111110',
      md: '4px 4px 0 0 #111110',
      lg: '8px 8px 0 0 #111110',
    },
    spacing: { container: '80rem', section: '2.5rem', card: '1rem' },
    layout: {
      headerVariant: 'brutalist-bar',
      heroVariant: 'brutalist-manifesto',
      footerVariant: 'brutalist-index',
      homepageSections: [
        { id: 'announcement', enabled: true },
        { id: 'stats', enabled: true },
        { id: 'hero', enabled: true },
        { id: 'featured', enabled: true },
        { id: 'welcome', enabled: true },
        { id: 'news', enabled: true },
        { id: 'testimonials', enabled: true },
      ],
    },
  },
  ocean: {
    id: 'ocean',
    name: 'Ocean Editorial',
    description:
      'Ocean editorial: deep teal authority with sunset coral warmth on light airy paper.',
    tokens: {
      brand: '#0E6E6B',
      'brand-soft': '#D2E9E6',
      'brand-strong': '#084443',
      accent: '#FF6B4A',
      'accent-soft': '#FFD8CC',
      surface: '#F4F7F6',
      ink: '#102E2E',
      heading: '#084443',
    },
    fonts: {
      heading: "var(--font-fraunces), 'Fraunces', Georgia, serif",
      body: "var(--font-inter), 'Inter', ui-sans-serif, system-ui, sans-serif",
    },
    radius: { sm: '0.75rem', md: '1.25rem', lg: '2rem' },
    shadow: {
      sm: '0 1px 2px 0 rgb(14 110 107 / 0.1)',
      md: '0 6px 20px -4px rgb(14 110 107 / 0.22)',
      lg: '0 20px 48px -12px rgb(14 110 107 / 0.32)',
    },
    spacing: { container: '74rem', section: '4.75rem', card: '1.75rem' },
    layout: {
      headerVariant: 'ocean-wave',
      heroVariant: 'ocean-tide',
      footerVariant: 'ocean-harbor',
      homepageSections: [
        { id: 'hero', enabled: true },
        { id: 'welcome', enabled: true },
        { id: 'featured', enabled: true },
        { id: 'announcement', enabled: true },
        { id: 'news', enabled: true },
        { id: 'stats', enabled: true },
        { id: 'testimonials', enabled: true },
      ],
    },
  },
};

/** Array view of the registry (test contract: `themes`). */
export const themes: ThemeDef[] = Object.values(THEMES);

/** Active theme id type (union widens as T9 adds themes). */
export type ActiveThemeId = string;

/** Default theme id used for fallback. */
export const DEFAULT_THEME: ActiveThemeId = 'emerald';

/** Resolve a theme by id; unknown or empty ids fall back to emerald. */
export function getTheme(id: string): ThemeDef {
  if (!id) return THEMES[DEFAULT_THEME] as ThemeDef;
  return (THEMES[id] ?? THEMES[DEFAULT_THEME]) as ThemeDef;
}
