/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'icons/*.png'],
      manifest: {
        id: '/',
        name: 'Cardi-Golf',
        short_name: 'Cardi-Golf',
        description:
          'Torneos de golf entre amigos: marcador en vivo, juegos, Calcutta y dinero.',
        lang: 'es-MX',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F7F1E3',
        theme_color: '#0F6E77',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // App shell, fonts, logo. Supabase calls are never cached by the SW:
        // the outbox (Dexie) owns offline writes and the store owns reads.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
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
  },
})
