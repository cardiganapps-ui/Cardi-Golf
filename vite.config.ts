/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { APP_MANIFEST } from './src/lib/appManifest'
import { LAUNCH_SCREENS, launchImageMedia, launchImagePath } from './src/lib/launchImages'

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
const versionedIcon = <T extends { src: string }>(icon: T) => ({ ...icon, src: versioned(icon.src) })

// https://vite.dev/config/
export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
    __BUILD_SHA__: JSON.stringify(gitSha()),
  },
  plugins: [
    react(),
    {
      name: 'versioned-icons',
      transformIndexHtml: (html) =>
        ICON_LINKS.reduce((out, path) => out.replaceAll(`href="${path}"`, `href="${versioned(path)}"`), html),
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
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'icons/*.png'],
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
        globIgnores: ['**/node_modules/**/*', 'splash/**', 'screenshots/**'],
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
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
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
      thresholds: {
        'src/data/outbox.ts': { statements: 99.5, branches: 93, functions: 100, lines: 99.5 },
        'api/**': { statements: 99, branches: 95, functions: 100, lines: 99 },
        'src/server/**': { statements: 100, branches: 100, functions: 100, lines: 100 },
      },
    },
  },
})
