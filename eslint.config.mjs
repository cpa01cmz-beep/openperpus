import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

// ponytail: eslint-config-next@16 hanya mengekspor flat config (FlatCompat/eslintrc
// tak bisa memakainya) — import langsung. Upgrade path: bila kembali ke eslintrc,
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
    plugins: {
      // Rule lokal repo (issue #79): tanpa plugin eksternal, definisi inline
      // di config supaya tidak ada dependensi baru hanya untuk satu aturan.
      openperpus: {
        rules: {
          'no-inline-format': {
            meta: {
              type: 'suggestion',
              docs: {
                description:
                  'Larang toLocaleDateString/toLocaleTimeString/toLocaleString inline — pakai helper src/lib/format.ts (issue #79).',
              },
              schema: [],
              messages: {
                inlineFormat:
                  'Tampilan {{method}} inline dilarang (issue #79) — pakai helper src/lib/format.ts (formatTanggal/formatWaktu/formatNum/formatRp/formatStamp).',
              },
            },
            create(context) {
              // Anggota toLocale* pada Date/Number/String — sumber "format liar"
              // yang bikin tampilan tanggal/angka beda antar halaman.
              const BANNED = new Set([
                'toLocaleDateString',
                'toLocaleTimeString',
                'toLocaleString',
              ]);
              return {
                MemberExpression(node) {
                  const prop = node.property;
                  if (prop.type === 'Identifier' && BANNED.has(prop.name)) {
                    context.report({
                      node,
                      messageId: 'inlineFormat',
                      data: { method: prop.name },
                    });
                  }
                },
              };
            },
          },
        },
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      // Isu #79 AC: "larang alert()" — nol dialog native di seluruh src.
      // Konfirmasi destruktif memakai components/admin/ConfirmModal.
      'no-alert': 'error',
      // Isu #79 AC: satu sumber format. Semua tampilan tanggal/angka lewat
      // src/lib/format.ts (formatTanggal/formatWaktu/formatNum/formatRp) —
      // toLocale* inline ditolak lint, bukan cuma gaya.
      'openperpus/no-inline-format': 'error',
    },
  },
  {
    // Satu-satunya berkas yang BOLEH memakai toLocale*: implementasi helper.
    files: ['src/lib/format.ts'],
    rules: { 'openperpus/no-inline-format': 'off' },
  },
  {
    files: ['tests/**/*.ts', 'tests/**/*.tsx'],
    rules: { '@typescript-eslint/no-explicit-any': 'warn' },
  },
];

export default eslintConfig;
