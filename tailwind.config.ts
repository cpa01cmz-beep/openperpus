import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: 'var(--brand, #047857)',
          soft: 'var(--brand-soft, #ecfdf5)',
          strong: 'var(--brand-strong, #065f46)',
        },
        accent: {
          DEFAULT: 'var(--accent, #f59e0b)',
          soft: 'var(--accent-soft, #fffbeb)',
        },
        heading: {
          DEFAULT: 'var(--heading, #065f46)',
        },
        surface: {
          DEFAULT: 'var(--surface, #ffffff)',
        },
        ink: {
          DEFAULT: 'var(--ink, #0f172a)',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['var(--font-playfair)', 'Georgia', 'serif'],
        heading: ['var(--font-heading)', 'var(--font-playfair)', 'Georgia', 'serif'],
        body: ['var(--font-body)', 'var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        cormorant: ['var(--font-cormorant)', 'Georgia', 'serif'],
        fraunces: ['var(--font-fraunces)', 'Georgia', 'serif'],
        archivo: ['var(--font-archivo)', "'Archivo Black'", "'Arial Black'", 'sans-serif'],
        space: ['var(--font-space)', "'Space Grotesk'", 'ui-monospace', 'monospace'],
        'source-serif': ['var(--font-source-serif)', "'Source Serif 4'", 'Georgia', 'serif'],
        'source-sans': ['var(--font-source-sans)', "'Source Sans 3'", 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
      maxWidth: {
        container: 'var(--container, 72rem)',
      },
      spacing: {
        section: 'var(--spacing-section, 4rem)',
        card: 'var(--spacing-card, 1.5rem)',
      },
      container: {
        center: true,
        padding: {
          DEFAULT: '1rem',
          sm: '1.5rem',
          lg: '2rem',
        },
      },
    },
  },
  plugins: [],
};

export default config;
