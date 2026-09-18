import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    ignores: ['node_modules/**', '.next/**', '.open-next/**', 'out/**', 'coverage/**'],
  },
  {
    files: ['tests/**/*.ts', 'tests/**/*.tsx'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
];

export default eslintConfig;
