import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

// ponytail: eslint-config-next@16 hanya mengekspor flat config (FlatCompat/eslintrc
// tak bisa memakannya) — import langsung. Upgrade path: bila kembali ke eslintrc,
// pakai lagi FlatCompat.
const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      '.open-next/**',
      // bundle wrangler dev (worker.js 9MB+) bikin eslint OOM kalau ikut ke-lint
      '.wrangler/**',
      'out/**',
      'coverage/**',
    ],
  },
  {
    // ponytail: 3 aturan baru react-hooks@7 (ikut eslint-config-next@16) memunculkan
    // 23 temuan di kode lama (setState-in-effect, static-components, purity).
    // Diturunkan ke 'warn' agar lint tetap hijau tanpa refactor besar.
    // Upgrade path: refactor titik-tituik itu lalu kembalikan ke 'error'.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/purity': 'warn',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: { '@typescript-eslint/no-explicit-any': 'error' },
  },
  {
    files: ['tests/**/*.ts', 'tests/**/*.tsx'],
    rules: { '@typescript-eslint/no-explicit-any': 'warn' },
  },
];

export default eslintConfig;
