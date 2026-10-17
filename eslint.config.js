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
    // ARCH-17: type-aware lint. typescript-eslint's strict and stylistic sets with the types, read through the
    // project service (each file by the tsconfig that includes it), plus the React Compiler's rules
    // (eslint-plugin-react-hooks 7). What is off or narrowed below says why.
    extends: [js.configs.recommended, ...tseslint.configs.strictTypeChecked, ...tseslint.configs.stylisticTypeChecked],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        // The routes' helpers' one test has no tsconfig of its own (tsconfig.api.json leaves tests out).
        projectService: { allowDefaultProject: ['src/server/*.test.ts'], defaultProject: 'tsconfig.api.json' },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // A switch over a union names every member, or says what its default stands for.
      '@typescript-eslint/switch-exhaustiveness-check': ['error', { considerDefaultExhaustiveForUnions: true }],
      // Numbers read as themselves in a template; anything else (null, an object, a union with either) is a bug.
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // `() => set(x)` is how every handler here is written; a void inside an expression is still refused.
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      // `||` on a primitive is chosen on purpose (an empty name, a 0 or NaN, a false flag falls through to the
      // default), and inside a test of several (`(a || b) && …`) it is a boolean or; `??` is asked for where an
      // object or a function is defaulted.
      '@typescript-eslint/prefer-nullish-coalescing': [
        'error',
        { ignorePrimitives: { string: true, number: true, boolean: true }, ignoreMixedLogicalExpressions: true },
      ],
      // Passing on a caught `unknown` (or a signal's `any` reason) is not inventing a non-Error.
      '@typescript-eslint/prefer-promise-reject-errors': [
        'error',
        { allowThrowingUnknown: true, allowThrowingAny: true },
      ],
      '@typescript-eslint/only-throw-error': ['error', { allowThrowingUnknown: true, allowThrowingAny: true }],
      // Every promise is awaited, caught or handed on. A handler that runs async work and shows its own
      // failure is written `() => void (async () => {…})()` or `() => void run(…)` (no-misused-promises holds
      // every other promise handed to an attribute). A data router's navigate() answers a promise that
      // settles once the next page has loaded and never rejects (a route's own failure goes to its error
      // element): not awaiting it loses no error.
      '@typescript-eslint/no-floating-promises': [
        'error',
        { allowForKnownSafeCalls: [{ from: 'package', package: 'react-router', name: 'NavigateFunction' }] },
      ],
      // Off: noUncheckedIndexedAccess makes `xs[i]!` the idiom where the index is known to be in range
      // (3,539 of them), and the typecheck still refuses the ones that aren't an index or a lookup.
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Off: `Promise<T | void>` is how a function says it may answer nothing, where its tests stand in one
      // that answers nothing at all (the outbox's push).
      '@typescript-eslint/no-invalid-void-type': 'off',
      // Off: `() => void n++` answers nothing on purpose; the rule's own fix turned `void _unused` into a bare
      // expression statement.
      '@typescript-eslint/no-meaningless-void-operator': 'off',
      // Off: `navigator.onLine === false`, `data === true` say what they mean where the declared boolean may
      // be undefined (a test's browser, an RPC's answer); the rule's own fix to `!x` turned every phone offline.
      '@typescript-eslint/no-unnecessary-boolean-literal-compare': 'off',
      // Off: a RegExp test over a string the types promise is what runs where the runtime gives none (a test's
      // navigator.userAgent, a provider's JSON): `/x/.test(undefined)` is false, `undefined.includes` throws.
      // And `re.exec(s)` in place of `s.match(re)` keeps its place across calls when `re` is global.
      '@typescript-eslint/prefer-includes': 'off',
      '@typescript-eslint/prefer-string-starts-ends-with': 'off',
      '@typescript-eslint/prefer-regexp-exec': 'off',
      // Off: both `T[]` and `Array<T>` are used where each reads better; no bug either way.
      '@typescript-eslint/array-type': 'off',
      // Off: a mapped type over a generic table (`RowOf<K>`) reads as `{}` only to the rule.
      '@typescript-eslint/no-generated-empty-object-type': 'off',
      // Scoped to the engine below: elsewhere the types say more than the runtime promises. Rows from IndexedDB
      // written by older builds, the live channel's records, a backup file, the browser's optional APIs: a guard
      // the types call unnecessary is the one that runs on those, and removing it to please the rule is a bug.
      '@typescript-eslint/no-unnecessary-condition': 'off',
      // Off: the React Compiler's model of a component, which this app does not build with. Refs never read
      // during render, no clock in render, no setState in an effect, no write through a hook's argument: the
      // card's stable handlers and slide (PERF-09, MOT-02: useStableHandlers, useHoleSlide), the washes, the
      // TV's and the ceremony's timers and every load-on-open break them on purpose and work. Each finding was
      // read when these rules came in (ARCH-17); the one real one, the TV reading `soldAt` before declaring it,
      // is fixed. The compiler's other rules are on.
      'react-hooks/refs': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
    },
  },
  {
    // Written by scripts/gen-db-types.mjs and held to the migrations byte for byte (the db job): its shapes
    // are the generator's, not ours to restyle.
    files: ['src/data/database.types.ts'],
    rules: {
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/consistent-indexed-object-style': 'off',
    },
  },
  {
    // The engine reads only what it computed or what the settings schema parsed: there a condition the types
    // call unnecessary is dead code or a wrong type.
    files: ['src/engine/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unnecessary-condition': [
        'error',
        { allowConstantLoopConditions: 'only-allowed-literals' },
      ],
    },
  },
  {
    // ARCH-03: a mapper reads each column of its table as `any` on purpose (RowOf), and a course provider's
    // adapter each field of the provider's JSON, each with its fallback and its Number() or String() (the JSON
    // may not hold what the declared type says); the type it returns is what's checked.
    files: ['src/data/mappers.ts', 'src/lib/courseProviders/*.ts', 'api/course-search.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unnecessary-type-conversion': 'off',
    },
  },
  {
    // Tests, their fakes and the browser suites: the promise rules, await-thenable and the rest hold, since a
    // missed await there is a test that passes without checking. Off: what a fake does on purpose (an async
    // stand-in with nothing to await, an empty callback, a spy on a method, a Response or Error spread into
    // a plain object, `any` poked into a stub, a String() over an SVG element's className, which the DOM types
    // call a string), and the type-assertion rules, which flag an `as` that types a generic's inference
    // (`vi.hoisted`, `querySelector`) and break the build when their fix is applied.
    files: ['**/*.test.{ts,tsx}', '**/testing/**/*.{ts,tsx}', 'e2e/**/*.ts'],
    rules: {
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-misused-spread': 'off',
      '@typescript-eslint/no-base-to-string': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/non-nullable-type-assertion-style': 'off',
      '@typescript-eslint/no-unnecessary-type-conversion': 'off',
      // What a test does on purpose: run a boot script's or a worker's source as the browser would, throw a
      // string as a library does, a fake's class of statics, a generic helper that casts its answer.
      '@typescript-eslint/no-implied-eval': 'off',
      '@typescript-eslint/only-throw-error': 'off',
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/no-dynamic-delete': 'off',
      '@typescript-eslint/no-unnecessary-type-parameters': 'off',
    },
  },
  {
    // The design fixtures stand in for the data layer: async functions with nothing to await, empty handlers.
    files: ['src/dev/**/*.{ts,tsx}', 'src/design/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-empty-function': 'off',
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
              message:
                'src/engine, src/data, src/lib and src/i18n never import from the screens, components, app, design or dev folders (ARCH-20): move the shared type or helper down.',
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
              message:
                'The engine is pure (ARCH-20): it never imports the data layer, a screen, a component or the app.',
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
