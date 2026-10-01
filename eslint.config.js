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
      'coverage',
      'node_modules',
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
    files: ['scripts/**/*.mjs', 'e2e/**/*.mjs', '*.js'],
    extends: [js.configs.recommended],
    languageOptions: { ecmaVersion: 2022, globals: { ...globals.node } },
  },
)
