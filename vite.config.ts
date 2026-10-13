/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { APP_MANIFEST } from './src/lib/appManifest'

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
    VitePWA({
      // A new deploy is offered, never forced: a reload mid-hole would lose the steppers.
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'icons/*.png'],
      // One manifest for the build and for a tournament's own start URL (api/manifest.ts, PWA-09).
      manifest: { ...APP_MANIFEST, icons: APP_MANIFEST.icons.map((icon) => ({ ...icon, src: versioned(icon.src) })) },
      workbox: {
        // App shell, fonts, logo. Supabase calls are never cached by the SW:
        // the outbox (Dexie) owns offline writes and the store owns reads.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
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
    coverage: {
      provider: 'v8',
      include: ['src/data/outbox.ts'],
      reporter: ['text'],
      thresholds: { 'src/data/outbox.ts': { statements: 99.5, branches: 93, functions: 100, lines: 99.5 } },
    },
  },
})
