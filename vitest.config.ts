import { defineConfig } from 'vitest/config';
import path from 'path';

const aliases = {
  '@src': path.resolve(__dirname, 'src'),
  '@tests': path.resolve(__dirname, 'src/__tests__'),
};

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules', 'dist', '**/*.test.ts', '**/setup.ts'],
    },
    projects: [
      {
        resolve: { alias: aliases },
        test: {
          name: 'unit',
          globals: true,
          environment: 'jsdom',
          setupFiles: ['./src/__tests__/unit/setup.ts'],
          include: ['src/__tests__/unit/**/*.test.ts'],
          exclude: ['node_modules', 'dist'],
        },
      },
      {
        resolve: { alias: aliases },
        test: {
          name: 'e2e',
          globals: true,
          include: ['src/__tests__/e2e/**/*.test.ts'],
          exclude: ['node_modules', 'dist'],
          testTimeout: 60000,
          hookTimeout: 60000,
        },
      },
    ],
  },
});
