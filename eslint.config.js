import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'coverage', 'playwright-report', 'test-results'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Le moteur de coaching est de la logique pure : aucune dépendance UI, stockage ou navigateur.
    files: ['src/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['react', 'react-*', 'react/*'], message: 'Le moteur ne dépend pas de React.' },
            { group: ['dexie', 'dexie-*'], message: 'Le moteur ne dépend pas du stockage.' },
            { group: ['@/data/*', '@/ui/*', '@/app/*', '../data/*', '../ui/*', '../app/*'], message: 'Le moteur ne dépend que de lui-même.' },
            { group: ['motion', 'motion/*'], message: 'Le moteur ne dépend pas de l’UI.' },
          ],
        },
      ],
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'indexedDB', 'navigator'],
    },
  },
);
