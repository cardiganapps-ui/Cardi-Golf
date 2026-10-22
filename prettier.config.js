// ARCH-17: one format for the code, checked by the preflight and CI's `check` (`npm run format:check`).
// The house style as it was written by hand: no semicolons, single quotes, trailing commas, 120 columns
// (where the comments already wrap). Only JavaScript and TypeScript; .prettierignore says what stays as it is.
/** @type {import('prettier').Config} */
export default {
  semi: false,
  singleQuote: true,
  printWidth: 120,
  trailingComma: 'all',
  arrowParens: 'always',
}
