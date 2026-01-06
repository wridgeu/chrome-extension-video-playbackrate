import eslint from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import jsdoc from 'eslint-plugin-jsdoc';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // Global ignores
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/docs/**', 'rollup.config.js', 'vitest*.config.ts'],
  },

  // Base ESLint recommended
  eslint.configs.recommended,

  // TypeScript ESLint recommended
  ...tseslint.configs.recommended,

  // JSDoc recommended
  jsdoc.configs['flat/recommended'],

  // Prettier (must be last to override other formatting rules)
  eslintConfigPrettier,

  // Custom configuration
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2020,
        chrome: 'readonly',
      },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      // Line length
      'max-len': ['warn', { code: 120, comments: 120, ignoreUrls: true, ignoreStrings: true }],

      // Linebreak style (disabled for cross-platform)
      'linebreak-style': 'off',

      // TypeScript handles unused vars better
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],

      // Allow non-null assertions in this project (Chrome extension types often need them)
      '@typescript-eslint/no-non-null-assertion': 'off',

      // JSDoc rules - TypeScript provides types, so disable redundant type annotations
      'jsdoc/require-jsdoc': ['warn', { publicOnly: true }],
      'jsdoc/require-param': 'off',
      'jsdoc/require-param-type': 'off',
      'jsdoc/require-returns': 'off',
      'jsdoc/require-returns-type': 'off',
      'jsdoc/require-param-description': 'off',
      'jsdoc/require-returns-description': 'off',
    },
  },

  // Test files configuration
  {
    files: ['**/__tests__/**/*.ts', '**/e2e/**/*.ts', '**/unit/**/*.ts', '**/*.test.ts'],
    rules: {
      // Relax rules for test files
      'jsdoc/require-jsdoc': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  }
);
