/**
 * The installed app's manifest, in one place: the build writes it as `/manifest.webmanifest` (its icon URLs
 * fingerprinted), and `api/manifest.ts` serves it with a tournament's own start URL (PWA-09). `id` is fixed,
 * so both are the same app whatever their start URLs. Its two colors are painted before any stylesheet loads
 * (the splash screen, the status bar), so they are written out here; a test holds them to tokens.css's `--bg`
 * and `--accent` and to index.html's theme-color.
 */
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
