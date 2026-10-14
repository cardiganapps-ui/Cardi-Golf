/**
 * The installed app's manifest, in one place: the build writes it as `/manifest.webmanifest` (its icon URLs
 * fingerprinted), and `api/manifest.ts` serves it with a tournament's own start URL (PWA-09). `id` is fixed,
 * so both are the same app whatever their start URLs. Its two colors are painted before any stylesheet loads
 * (the splash screen, the status bar), so they are written out here; a test holds them to tokens.css's `--bg`
 * and `--accent` and to index.html's theme-color.
 */
import { t } from '../i18n/es-MX.js'

export const APP_MANIFEST = {
  id: '/',
  name: 'Polo',
  short_name: 'Polo',
  description: 'Torneos de golf entre amigos: marcador en vivo, juegos, Calcutta y dinero.',
  lang: 'es-MX',
  dir: 'ltr',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  orientation: 'any',
  background_color: '#FBFAF7',
  theme_color: '#1E6B3B',
  // Where an install sheet or a store files it (PWA-14).
  categories: ['sports'],
  // A launch while the app is open (a shortcut, a link it opens) brings that window forward instead of opening
  // another or loading it again, which would cost a hole being typed; the app then goes where the launch
  // says, in place (`listenForLaunches`, src/lib/launch.ts).
  launch_handler: { client_mode: 'focus-existing' },
  // A long press on the icon (Android): the last tournament this phone opened, on its card or its En vivo
  // (`/continuar`, src/screens/ContinueScreen.tsx); with none, Home.
  shortcuts: [
    { name: t.app.shortcuts.card, short_name: t.app.shortcuts.cardShort, url: '/continuar/tarjeta', icons: [{ src: '/icons/shortcut-tarjeta.png', sizes: '192x192', type: 'image/png' }] },
    { name: t.app.shortcuts.live, short_name: t.app.shortcuts.live, url: '/continuar', icons: [{ src: '/icons/shortcut-envivo.png', sizes: '192x192', type: 'image/png' }] },
  ],
  // Chrome's install sheet on Android shows these, and a bare «¿Instalar?» without them: two real screens at a
  // phone's size, from the fixture build, of a tournament whose people are made up (scripts/make-screenshots.mjs).
  screenshots: [
    { src: '/screenshots/envivo.webp', sizes: '786x1704', type: 'image/webp', form_factor: 'narrow', label: t.app.screenshots.live },
    { src: '/screenshots/tarjeta.webp', sizes: '786x1704', type: 'image/webp', form_factor: 'narrow', label: t.app.screenshots.card },
  ],
  icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
} as const

/** A tournament's slug or join code as a route segment: letters, digits and hyphens, as the server reads them. */
export const TOURNAMENT_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9-]{1,63}$/

/**
 * Where an app installed from a tournament's page opens the first time: Home with the tournament named,
 * which goes straight to it (`launchTarget`). An iPhone's installed app keeps nothing of Safari's, so
 * without this it opened on an empty Home that asked for a code (PWA-09).
 */
export function startUrlFor(slug: string): string {
  return TOURNAMENT_SEGMENT.test(slug) ? `/?t=${encodeURIComponent(slug.toLowerCase())}` : APP_MANIFEST.start_url
}
