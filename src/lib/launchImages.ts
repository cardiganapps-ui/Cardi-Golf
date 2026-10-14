/**
 * The installed app's launch images on an iPhone (PWA-14). iOS shows the image whose media query matches the
 * phone from the tap on the icon until the page paints. With none, every cold start was a white screen, then
 * «Polo / Cargando…» in the system font, then the app. Each image is the page's paper with the icon's pencil
 * in the middle, as large as the boot screen shows it (index.html), so the three read as one.
 *
 * One per screen size, portrait: CSS pixels and device pixel ratio, as iOS matches them. `npm run icons`
 * draws them (scripts/make-icons.mjs); the build links them from index.html (vite.config.ts). The worker
 * never keeps them: iOS reads them when the app is added to the home screen, and they would weigh on every
 * phone's precache for nothing (scripts/check-precache.mjs).
 */
export interface LaunchScreen {
  width: number
  height: number
  ratio: 2 | 3
}

/** The iPhones in use, newest first; each line's phones share the screen. */
export const LAUNCH_SCREENS: readonly LaunchScreen[] = [
  // 16 Pro Max, 17 Pro Max
  { width: 440, height: 956, ratio: 3 },
  // 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus
  { width: 430, height: 932, ratio: 3 },
  // Air
  { width: 420, height: 912, ratio: 3 },
  // 12 Pro Max, 13 Pro Max, 14 Plus
  { width: 428, height: 926, ratio: 3 },
  // 16 Pro, 17, 17 Pro
  { width: 402, height: 874, ratio: 3 },
  // 14 Pro, 15, 15 Pro, 16
  { width: 393, height: 852, ratio: 3 },
  // 12, 12 Pro, 13, 13 Pro, 14, 16e
  { width: 390, height: 844, ratio: 3 },
  // XS Max, 11 Pro Max
  { width: 414, height: 896, ratio: 3 },
  // XR, 11
  { width: 414, height: 896, ratio: 2 },
  // X, XS, 11 Pro, 12 mini, 13 mini
  { width: 375, height: 812, ratio: 3 },
  // 6 Plus to 8 Plus
  { width: 414, height: 736, ratio: 3 },
  // 6 to 8, SE (2nd and 3rd generation)
  { width: 375, height: 667, ratio: 2 },
  // 5, 5s, SE (1st generation)
  { width: 320, height: 568, ratio: 2 },
]

/** The boot screen's mark and the launch image's, in CSS pixels: the icon's tile, its pencil inside it. */
export const LAUNCH_MARK_PX = 120

/** The image's own size, in device pixels. */
export const launchPixels = (s: LaunchScreen) => ({ width: s.width * s.ratio, height: s.height * s.ratio })

/** Where the image is served from (public/ in the repo). */
export function launchImagePath(s: LaunchScreen): string {
  const px = launchPixels(s)
  return `/splash/iphone-${px.width}x${px.height}.png`
}

/** The media query iOS matches the phone against. */
export function launchImageMedia(s: LaunchScreen): string {
  return `screen and (device-width: ${s.width}px) and (device-height: ${s.height}px) and (-webkit-device-pixel-ratio: ${s.ratio}) and (orientation: portrait)`
}
