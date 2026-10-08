/** Theme token registry — dunia "Kartu Katalog" (roll 6325fdd6, pick dikunci user).
 *  Satu tata bahasa visual, lima material. Emerald = laci jati + kartu manila.
 *  Id tema, jumlah, dan 8 token hex adalah kontrak (tests/theme-registry). */

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

/** Font stacks per theme (heading = kop, body = prosa; data selalu Courier Prime). */
export type ThemeFonts = {
  heading: string;
  body: string;
};

/** Radius scale per theme — potongan kartu, sengaja kecil (dunia memilih lurus). */
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

/** Registry map keyed by theme id. */
export const THEMES: Record<string, ThemeDef> = {
  emerald: {
    id: 'emerald',
    name: 'Emerald',
    description:
      'Laci jati dan kartu manila di ruang baca siang — hijau ledger, stempel merah bata, kartu potong tajam.',
    tokens: {
      brand: '#1B5E4B',
      'brand-soft': '#DCE6DE',
      'brand-strong': '#0E3D30',
      accent: '#A63D2E',
      'accent-soft': '#F2E4DE',
      surface: '#EBEDE6',
      ink: '#1C1A17',
      heading: '#0E3D30',
    },
    fonts: {
      heading: "var(--font-libre-caslon), 'Libre Caslon Display', Georgia, serif",
      body: "var(--font-libre-franklin), 'Libre Franklin', ui-sans-serif, system-ui, sans-serif",
    },
    radius: { sm: '0.125rem', md: '0.25rem', lg: '0.5rem' },
    shadow: {
      sm: '0 1px 1px 0 rgb(28 26 23 / 0.07)',
      md: '0 2px 4px -1px rgb(28 26 23 / 0.10), 0 8px 16px -8px rgb(28 26 23 / 0.14)',
      lg: '0 4px 8px -2px rgb(28 26 23 / 0.12), 0 16px 32px -12px rgb(28 26 23 / 0.18)',
    },
    spacing: { container: '72rem', section: '4.5rem', card: '1.5rem' },
    layout: {
      headerVariant: 'emerald-classic',
      heroVariant: 'emerald-centered',
      footerVariant: 'emerald-standard',
      homepageSections: [
        { id: 'hero', enabled: true },
        { id: 'announcement', enabled: true },
        { id: 'featured', enabled: true },
        { id: 'welcome', enabled: true },
        { id: 'stats', enabled: true },
        { id: 'news', enabled: true },
        { id: 'testimonials', enabled: true },
      ],
    },
  },
  midnight: {
    id: 'midnight',
    name: 'Midnight Premium',
    description:
      'Laci malam dibaca di bawah lampu baca — kartu gelap hangat, pelat kuningan, tinta stempel vermilion.',
    tokens: {
      brand: '#C9A25A',
      'brand-soft': '#2E2718',
      'brand-strong': '#E8D3A1',
      accent: '#E4573D',
      'accent-soft': '#2A1510',
      surface: '#14110D',
      ink: '#EFE6D5',
      heading: '#F7F1E3',
    },
    fonts: {
      heading: "var(--font-bodoni), 'Bodoni Moda', 'Times New Roman', serif",
      body: "var(--font-archivo), 'Archivo', ui-sans-serif, system-ui, sans-serif",
    },
    radius: { sm: '0.25rem', md: '0.5rem', lg: '0.75rem' },
    shadow: {
      sm: '0 1px 2px 0 rgb(0 0 0 / 0.45)',
      md: '0 2px 6px -2px rgb(0 0 0 / 0.4), 0 8px 24px -6px rgb(0 0 0 / 0.6)',
      lg: '0 8px 20px -8px rgb(0 0 0 / 0.5), 0 24px 60px -16px rgb(0 0 0 / 0.75)',
    },
    spacing: { container: '76rem', section: '5.25rem', card: '1.75rem' },
    layout: {
      headerVariant: 'midnight-slim',
      heroVariant: 'midnight-showcase',
      footerVariant: 'midnight-extended',
      homepageSections: [
        { id: 'hero', enabled: true },
        { id: 'featured', enabled: true },
        { id: 'announcement', enabled: true },
        { id: 'welcome', enabled: true },
        { id: 'stats', enabled: true },
        { id: 'news', enabled: true },
        { id: 'testimonials', enabled: true },
      ],
    },
  },
  paper: {
    id: 'paper',
    name: 'Paper Minimal',
    description:
      'Kartu bond polos di laci besi abu-abu — grafit, tanpa gradien, tinta stempel tanah liat.',
    tokens: {
      brand: '#4A5348',
      'brand-soft': '#EBEDE7',
      'brand-strong': '#2C312B',
      accent: '#8E4B33',
      'accent-soft': '#F0E5DC',
      surface: '#FBFBFA',
      ink: '#23221F',
      heading: '#2C312B',
    },
    fonts: {
      heading: "var(--font-literata), 'Literata', Georgia, serif",
      body: "var(--font-public-sans), 'Public Sans', ui-sans-serif, system-ui, sans-serif",
    },
    radius: { sm: '0', md: '0.125rem', lg: '0.25rem' },
    shadow: {
      sm: '0 1px 1px 0 rgb(35 34 31 / 0.05)',
      md: '0 2px 6px -2px rgb(35 34 31 / 0.07)',
      lg: '0 6px 16px -6px rgb(35 34 31 / 0.08)',
    },
    spacing: { container: '68rem', section: '5.5rem', card: '2rem' },
    layout: {
      headerVariant: 'paper-minimal',
      heroVariant: 'paper-editorial',
      footerVariant: 'paper-colophon',
      homepageSections: [
        { id: 'hero', enabled: true },
        { id: 'announcement', enabled: true },
        { id: 'welcome', enabled: true },
        { id: 'featured', enabled: true },
        { id: 'stats', enabled: true },
        { id: 'news', enabled: true },
        { id: 'testimonials', enabled: true },
      ],
    },
  },
  brutalist: {
    id: 'brutalist',
    name: 'Brutalist',
    description:
      'Fotokopi kartu katalog — toner hitam di atas kertas koran, oranye keselamatan untuk aksi, garis tanpa bayangan.',
    tokens: {
      brand: '#111110',
      'brand-soft': '#E7E3D8',
      'brand-strong': '#000000',
      accent: '#B83000',
      'accent-soft': '#FFD9C2',
      surface: '#E9E9E3',
      ink: '#111110',
      heading: '#000000',
    },
    fonts: {
      heading: "var(--font-archivo-black), 'Archivo Black', 'Arial Black', sans-serif",
      body: "var(--font-barlow), 'Barlow', ui-sans-serif, system-ui, sans-serif",
    },
    radius: { sm: '0', md: '0', lg: '0' },
    shadow: {
      sm: '2px 2px 0 0 #111110',
      md: '4px 4px 0 0 #111110',
      lg: '8px 8px 0 0 #111110',
    },
    spacing: { container: '80rem', section: '3rem', card: '1.25rem' },
    layout: {
      headerVariant: 'brutalist-bar',
      heroVariant: 'brutalist-manifesto',
      footerVariant: 'brutalist-index',
      homepageSections: [
        { id: 'announcement', enabled: true },
        { id: 'hero', enabled: true },
        { id: 'stats', enabled: true },
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
      'Arsip maritim: kartu ter-bleach asin di laci baja, tinta teal dalam, tinta stempel karat.',
    tokens: {
      brand: '#0B5E63',
      'brand-soft': '#DCEBE8',
      'brand-strong': '#073E42',
      accent: '#A9401F',
      'accent-soft': '#F6DFD5',
      surface: '#ECEFED',
      ink: '#12302F',
      heading: '#073E42',
    },
    fonts: {
      heading: "var(--font-bitter), 'Bitter', Georgia, serif",
      body: "var(--font-karla), 'Karla', ui-sans-serif, system-ui, sans-serif",
    },
    radius: { sm: '0.5rem', md: '0.75rem', lg: '1.25rem' },
    shadow: {
      sm: '0 1px 2px 0 rgb(11 94 99 / 0.12)',
      md: '0 2px 4px -2px rgb(18 48 47 / 0.10), 0 4px 12px -4px rgb(11 94 99 / 0.20)',
      lg: '0 6px 14px -6px rgb(18 48 47 / 0.14), 0 20px 44px -14px rgb(11 94 99 / 0.30)',
    },
    spacing: { container: '74rem', section: '4.5rem', card: '1.625rem' },
    layout: {
      headerVariant: 'ocean-wave',
      heroVariant: 'ocean-tide',
      footerVariant: 'ocean-harbor',
      homepageSections: [
        { id: 'hero', enabled: true },
        { id: 'announcement', enabled: true },
        { id: 'welcome', enabled: true },
        { id: 'featured', enabled: true },
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
