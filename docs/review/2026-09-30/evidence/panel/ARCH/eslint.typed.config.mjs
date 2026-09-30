import tseslint from '/home/user/Cardi-Golf/node_modules/typescript-eslint/dist/index.js'
import reactHooks from '/home/user/Cardi-Golf/node_modules/eslint-plugin-react-hooks/index.js'
export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/*.test.ts', '**/*.test.tsx', 'src/dev/**', 'src/design/**'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { project: ['/home/user/Cardi-Golf/tsconfig.app.json'], tsconfigRootDir: '/home/user/Cardi-Golf' },
    },
    plugins: { '@typescript-eslint': tseslint.plugin, 'react-hooks': reactHooks },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-base-to-string': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
)
