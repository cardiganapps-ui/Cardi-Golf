/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { APP_MANIFEST } from './src/lib/appManifest.ts'
import { LAUNCH_SCREENS, launchImageMedia, launchImagePath } from './src/lib/launchImages.ts'
import { DEV_ONLY, noDevCode } from './src/lib/noDevCode.ts'

/**
 * Which build a phone runs (PWA-03). The id is the build time in seconds:
 * every deploy gets a higher one, so `app_flags.minBuild` can say "this one
 * or newer". A Vercel rollback serves the old build as it was, id included.
 */
function gitSha(): string {
  const fromVercel = process.env.VERCEL_GIT_COMMIT_SHA
  if (fromVercel) return fromVercel.slice(0, 7)
  try {
    return execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return 'local'
  }
}
const BUILD_ID = Math.floor(Date.now() / 1000)

// Icons are fetched once and cached hard (iOS keeps a site's touch icon even
// after the file changes). Every icon URL carries a fingerprint of its bytes,
// so a new icon is a new URL and every device fetches it.
function versioned(path: string): string {
  const bytes = readFileSync(new URL(`./public${path}`, import.meta.url))
  return `${path}?v=${createHash('sha256').update(bytes).digest('hex').slice(0, 10)}`
}
const ICON_LINKS = ['/favicon.svg', '/apple-touch-icon.png']
/** The brand images the app and index.html show, each at its fingerprint (src/lib/assetUrl.ts, PERF-13). */
const BRAND_IMAGES = ['/brand/boot-mark.png', '/brand/polo-mark.png', '/brand/polo-mark-board.png']
const versionedIcon = <T extends { src: string }>(icon: T) => ({ ...icon, src: versioned(icon.src) })

/**
 * SEC-01: the headers vercel.json gives every page (the CSP among them). The
 * fixture browser suite serves its build with them (POLO_PREVIEW_HEADERS=1,
 * playwright.config.ts) and fails on any CSP violation, so a screen that needs
 * something the policy refuses fails CI instead of production.
 */
function siteHeaders(): Record<string, string> {
  const config = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')) as { headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }> }
  const all = config.headers.find((h) => h.source === '/(.*)')
  return Object.fromEntries((all?.headers ?? []).filter((h) => h.key !== 'Strict-Transport-Security').map((h) => [h.key, h.value]))
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
    __BUILD_SHA__: JSON.stringify(gitSha()),
    __ASSET_URLS__: JSON.stringify(Object.fromEntries(BRAND_IMAGES.map((path) => [path, versioned(path)]))),
  },
  plugins: [
    react(),
    // A production build carries none of the design fixtures, the style guide or the test builders (ARCH-07).
    noDevCode(),
    {
      name: 'versioned-icons',
      transformIndexHtml: (html) =>
        BRAND_IMAGES.reduce(
          (out, path) => out.replaceAll(`src="${path}"`, `src="${versioned(path)}"`),
          ICON_LINKS.reduce((out, path) => out.replaceAll(`href="${path}"`, `href="${versioned(path)}"`), html),
        ),
    },
    {
      // PERF-13: the text font's Latin face, asked for with the page instead of once the app's first screen has
      // rendered. Every screen sets text in it; it was the last thing the first paint waited for.
      name: 'preload-text-font',
      apply: 'build',
      transformIndexHtml: {
        order: 'post',
        handler: (_html, ctx) => {
          const font = Object.keys(ctx.bundle ?? {}).find((file) => /(?:^|\/)archivo-latin-wdth-normal-[\w-]+\.woff2$/.test(file))
          if (!font) throw new Error('preload-text-font: no Archivo Latin face in the build')
          return [{ tag: 'link', attrs: { rel: 'preload', href: `/${font}`, as: 'font', type: 'font/woff2', crossorigin: '' }, injectTo: 'head' as const }]
        },
      },
    },
    {
      // The iPhone launch images (PWA-14, src/lib/launchImages.ts): one link per screen, each at its fingerprint.
      name: 'launch-images',
      transformIndexHtml: () =>
        LAUNCH_SCREENS.map((screen) => ({
          tag: 'link',
          attrs: { rel: 'apple-touch-startup-image', media: launchImageMedia(screen), href: versioned(launchImagePath(screen)) },
          injectTo: 'head' as const,
        })),
    },
    VitePWA({
      // A new deploy is offered, never forced: a reload mid-hole would lose the steppers.
      registerType: 'prompt',
      // What the worker keeps is `globPatterns` below, less `globIgnores`: these two would add the 512 px icons back.
      includeAssets: [],
      includeManifestIcons: false,
      // One manifest for the build and for a tournament's own start URL (api/manifest.ts, PWA-09).
      manifest: {
        ...APP_MANIFEST,
        categories: [...APP_MANIFEST.categories],
        icons: APP_MANIFEST.icons.map(versionedIcon),
        shortcuts: APP_MANIFEST.shortcuts.map((shortcut) => ({ ...shortcut, icons: shortcut.icons.map(versionedIcon) })),
        screenshots: APP_MANIFEST.screenshots.map(versionedIcon),
      },
      workbox: {
        // App shell, fonts, logo. Supabase calls are never cached by the SW:
        // the outbox (Dexie) owns offline writes and the store owns reads.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Not the iPhone launch images, nor the install sheet's screenshots: iOS and Chrome read them when the
        // app is installed, never through the worker, and every phone would keep them for nothing
        // (scripts/check-precache.mjs).
        globIgnores: [
          '**/node_modules/**/*',
          'splash/**',
          'screenshots/**',
          // The 512 px icons are the install's alone: Android draws its splash and home-screen icon from them when
          // the app is added, online, and keeps its own copy (PERF-05). 176 KB every phone kept for nothing.
          'icons/icon-512.png',
          'icons/icon-maskable-512.png',
          // A font's subsets for letters Spanish never writes (Vietnamese, the Latin Extended block: «ő», «ł»,
          // «ă»). The browser asks for one only when a name on screen has such a letter (its unicode-range), and
          // the rule below keeps it for offline from then on (PERF-05). 141 KB every phone kept for nothing.
          'assets/*-{latin-ext,vietnamese,cyrillic,cyrillic-ext,greek,greek-ext}-*.woff2',
        ],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        // A first visit is served by its worker as soon as it installs, not from the next load on: a deploy
        // later the same day can't leave the page asking for screens the server no longer has (REL-13).
        // Updates still wait for «Actualizar» (no skipWaiting).
        clientsClaim: true,
        // Web push (PR 8): the handler lives in public/push-sw.js, imported at its own fingerprint, so a change to
        // it is a new worker that every phone installs (scripts/check-precache.mjs holds the two together).
        importScripts: [versioned('/push-sw.js')],
        // Icon URLs carry ?v=<fingerprint>; offline, they still resolve to the precached file.
        ignoreURLParametersMatching: [/^v$/],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // Logos and avatars from Storage stay available offline (§8).
        runtimeCaching: [
          // The font subsets left out of the precache, once a page has used one (fingerprinted, so never stale).
          {
            urlPattern: /\/assets\/[^/?#]+\.woff2$/,
            handler: 'CacheFirst',
            options: { cacheName: 'fonts', expiration: { maxEntries: 20 }, cacheableResponse: { statuses: [0, 200] } },
          },
          {
            urlPattern: /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'tournament-assets', expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 3600 }, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  preview: process.env.POLO_PREVIEW_HEADERS ? { headers: siteHeaders() } : undefined,
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    rolldownOptions: {
      // A dev-only module (the fixtures, the style guide, the test builders) does nothing of its own when
      // imported: it is kept only where something uses what it exports, as the design routes do. The profile
      // fixtures build their data with calls at the module's top, which the bundler had to keep in every
      // production build (ARCH-07); `noDevCode` above fails one that still carries any.
      treeshake: { moduleSideEffects: (id) => !DEV_ONLY.test(id) },
      // What the entry loads stays in the entry's chunk, as Rollup kept it. Rolldown's own split put the modules
      // the entry shares with lazy screens in chunks of their own, whose stylesheets are linked before the
      // entry's: global.css then came after the CSS modules, `.card` beat `.errorBox` on every ErrorBox, and
      // primitives' rules shipped twice (e2e/fixtures/cascade.spec.ts).
      //
      // The screens are lazy (PERF-02, src/app/screens.tsx). Everything they share and the entry doesn't, Rolldown
      // splits by who uses it, so the landing page loads none of the boards' code.
      output: {
        codeSplitting: {
          groups: [
            { name: 'index', tags: ['$initial'], priority: 2 },
            // Loaded on a share card's first tap (src/lib/shareImage.ts); named, or it would be «es-<hash>.js».
            { name: 'html-to-image', test: /\/node_modules\/html-to-image\//, priority: 1 },
          ],
        },
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    passWithNoTests: false,
    // QA-06: the outbox holds the only copy of a hole saved with no signal. `npm test` measures it
    // and fails below what its tests cover today. The statements left are the push of a kind this
    // build does not know, which the flush never sends, and a closed channel's refusal to post a
    // landing. Branch coverage moves a little between runs (the lock and the backoff take
    // timing-dependent paths), so its bar sits a point and a half under the lowest (outbox v2: 93.5).
    //
    // QA-14: the serverless routes and their gate (api/, src/server/) hold the service-role key, the
    // Anthropic key and the push secret, and none of them ran in CI until a 500 shipped. Their tests call
    // each handler with the network and the SDKs stubbed; the bars are what they cover today, rounded down.
    // What is left: scorecard-extract's last 500 (an error that is not the SDK's, which nothing upstream
    // throws) and a few `??` fallbacks.
    coverage: {
      provider: 'v8',
      include: ['src/data/outbox.ts', 'api/**', 'src/server/**'],
      reporter: ['text'],
      // Vitest 5 counts each `return`, `.catch` and inline callback on its own (Vitest 3 counted lines), so the same
      // tests measured lower; the paths it found have tests now (src/data/outbox.edges.test.ts and its siblings).
      thresholds: {
        'src/data/outbox.ts': { statements: 99.5, branches: 93, functions: 100, lines: 99.5 },
        'api/**': { statements: 99, branches: 95, functions: 100, lines: 99 },
        'src/server/**': { statements: 100, branches: 100, functions: 100, lines: 100 },
      },
    },
  },
})
