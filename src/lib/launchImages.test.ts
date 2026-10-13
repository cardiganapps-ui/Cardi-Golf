/**
 * PWA-14: every iPhone cold start showed a white screen until the page painted, since index.html linked no
 * launch image. One per screen size now: each file there, at its screen's exact pixels, its media query the
 * one iOS matches that screen by, and no file left over that no screen uses. The build's links and the
 * precache's handling of them are checked in precache.test.ts, on a build.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LAUNCH_SCREENS, launchImageMedia, launchImagePath, launchPixels } from './launchImages'

/** A PNG's own size, from its header. */
function pngSize(path: string): { width: number; height: number } {
  const bytes = readFileSync(new URL(`../../public${path}`, import.meta.url))
  expect(bytes.subarray(1, 4).toString('latin1'), `${path} is a PNG`).toBe('PNG')
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

describe('the iPhone launch images (PWA-14)', () => {
  it('each screen’s file is there, portrait, at its exact pixels', () => {
    for (const screen of LAUNCH_SCREENS) {
      const size = pngSize(launchImagePath(screen))
      expect(size, launchImagePath(screen)).toEqual(launchPixels(screen))
      expect(size.height).toBeGreaterThan(size.width)
    }
  })

  it('each is matched by its own media query: its CSS size, its pixel ratio, portrait', () => {
    const queries = LAUNCH_SCREENS.map(launchImageMedia)
    expect(new Set(queries).size).toBe(LAUNCH_SCREENS.length)
    expect(new Set(LAUNCH_SCREENS.map(launchImagePath)).size).toBe(LAUNCH_SCREENS.length)
    expect(launchImageMedia({ width: 393, height: 852, ratio: 3 })).toBe(
      'screen and (device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
    )
  })

  it('the phones the players hold today are covered (the browser suite’s 393 px, and 375 px)', () => {
    const covered = (w: number, h: number) => LAUNCH_SCREENS.some((s) => s.width === w && s.height === h)
    expect(covered(393, 852)).toBe(true)
    expect(covered(375, 812)).toBe(true)
    expect(covered(440, 956)).toBe(true)
  })

  it('no file in public/splash that no screen uses', () => {
    const files = readdirSync(new URL('../../public/splash', import.meta.url)).map((f) => `/splash/${f}`).sort()
    expect(files).toEqual(LAUNCH_SCREENS.map(launchImagePath).sort())
  })
})
