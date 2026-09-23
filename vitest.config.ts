import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  css: { postcss: { plugins: [] } },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    alias: {
      '@': path.resolve(process.cwd(), 'src'),
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      thresholds: {
        lines: 60,
        functions: 65,
        branches: 60,
        statements: 60,
      },
    },
    chaiConfig: {
      enable: false,
    },
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
          exclude: ['tests/integration/**', 'tests/components/**', 'tests/e2e/**'],
          globals: true,
          alias: {
            '@': path.resolve(process.cwd(), 'src'),
          },
        },
      },
      {
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          globals: true,
          alias: {
            '@': path.resolve(process.cwd(), 'src'),
          },
        },
      },
      {
        test: {
          name: 'components',
          environment: 'jsdom',
          include: ['tests/components/**/*.test.tsx'],
          setupFiles: ['tests/setup.tsx'],
          setupFilesAfterFramework: ['tests/setup-jest-dom.ts'],
          globals: true,
          chaiConfig: { enable: false },
          alias: {
            '@': path.resolve(process.cwd(), 'src'),
          },
        },
      },
    ],
  },
});
