import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'dist',
      'dev-dist',
      'dist-fixtures',
      'coverage',
      'node_modules',
      // The browser suites' output: a run that ends mid-lint takes its files away under it.
      'test-results',
      'playwright-report',
      // Review evidence and tooling, kept verbatim as the panel ran it: not product code.
      'docs/review/**/evidence/**',
      'docs/review/method/**',
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // COPY-04: an error's own text ("TypeError: Failed to fetch", PostgREST's RLS
    // line) never reaches a screen. Show humanError(e); log the error itself.
    files: ['src/screens/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}', 'src/app/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[property.name='message']",
          message: "Don't show an error's .message: use humanError(e) from src/lib/humanError.ts.",
        },
        {
          selector: "MemberExpression[computed=true][property.value='message']",
          message: "Don't show an error's .message: use humanError(e) from src/lib/humanError.ts.",
        },
        {
          selector: "ObjectPattern > Property[key.name='message']",
          message: "Don't take an error's message apart: use humanError(e) from src/lib/humanError.ts.",
        },
      ],
    },
  },
  {
    // ARCH-20: the layers point one way. The engine is pure (its copy from src/i18n, a few helpers from src/lib);
    // the data layer, src/lib and the copy never reach up into a screen, a component or the app shell. The
    // session's type lived in a screen and the cache of the boards imported it from there.
    files: ['src/engine/**/*.{ts,tsx}', 'src/data/**/*.{ts,tsx}', 'src/lib/**/*.{ts,tsx}', 'src/i18n/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/screens/**', '**/components/**', '**/app/**', '**/design/**', '**/dev/**'],
              message: 'src/engine, src/data, src/lib and src/i18n never import from the screens, components, app, design or dev folders (ARCH-20): move the shared type or helper down.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/engine/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/screens/**', '**/components/**', '**/app/**', '**/design/**', '**/dev/**', '**/data/**'],
              message: 'The engine is pure (ARCH-20): it never imports the data layer, a screen, a component or the app.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['scripts/**/*.mjs', 'e2e/**/*.mjs', '*.js'],
    extends: [js.configs.recommended],
    languageOptions: { ecmaVersion: 2022, globals: { ...globals.node } },
  },
)
