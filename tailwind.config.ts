import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: 'var(--brand, #1b5e4b)',
          soft: 'var(--brand-soft, #dce6de)',
          strong: 'var(--brand-strong, #0e3d30)',
        },
        accent: {
          DEFAULT: 'var(--accent, #a63d2e)',
          soft: 'var(--accent-soft, #f2e4de)',
        },
        heading: {
          DEFAULT: 'var(--heading, #0e3d30)',
        },
        surface: {
          DEFAULT: 'var(--surface, #ebede6)',
        },
        ink: {
          DEFAULT: 'var(--ink, #1c1a17)',
        },
        rule: {
          DEFAULT: 'var(--rule)',
          strong: 'var(--rule-strong)',
        },
      },
      fontFamily: {
        sans: ['var(--font-body)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['var(--font-heading)', 'Georgia', 'serif'],
        heading: ['var(--font-heading)', 'Georgia', 'serif'],
        body: ['var(--font-body)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        data: ['var(--font-data)', 'ui-monospace', 'monospace'],
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
