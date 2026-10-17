// @vitest-environment happy-dom
/** PWA-08 and PWA-09: which phone this is, Android's own install offer, and the start URL a tournament's pages name. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setLastTournament } from '../data/session'
import {
  devicePlatform,
  installNow,
  isStandalone,
  listenForInstall,
  markInstalled,
  pointManifestAt,
  saidInstalled,
  useInstallOffer,
} from './install'
import { launchTarget, RESUME_MS } from './launch'

const UA = {
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  android:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36',
  laptop: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
}
function device(ua: string, touch = 0) {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true })
  Object.defineProperty(navigator, 'maxTouchPoints', { value: touch, configurable: true })
}
function standalone(on: boolean) {
  window.matchMedia = ((q: string) => ({
    matches: on && q === '(display-mode: standalone)',
    media: q,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  standalone(false)
  device(UA.laptop)
})
afterEach(() => vi.restoreAllMocks())

describe('which phone (PWA-08)', () => {
  it('an iPhone, an iPad (it reads as a Mac with a touch screen), an Android phone, anything else', () => {
    device(UA.iphone)
    expect(devicePlatform()).toBe('ios')
    device(UA.ipad, 5)
    expect(devicePlatform()).toBe('ios')
    device(UA.ipad, 0)
    expect(devicePlatform()).toBe('other')
    device(UA.android)
    expect(devicePlatform()).toBe('android')
    device(UA.laptop)
    expect(devicePlatform()).toBe('other')
  })

  it('opened from the icon is the installed app', () => {
    expect(isStandalone()).toBe(false)
    standalone(true)
    expect(isStandalone()).toBe(true)
  })

  it('«Ya la tengo», before PWA-08 or after, says the phone has it', () => {
    expect(saidInstalled()).toBe(false)
    localStorage.setItem('cardi-golf:install-guide-dismissed', '1')
    expect(saidInstalled()).toBe(true)
    localStorage.clear()
    markInstalled()
    expect(saidInstalled()).toBe(true)
  })
})

describe('Android’s own install offer (PWA-08)', () => {
  it('is kept from the moment Chrome makes it, opens on one tap, and an install ends it', async () => {
    listenForInstall()
    const prompt = vi.fn(async () => undefined)
    const offer = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    })
    window.dispatchEvent(offer)
    // Our button opens it: Chrome's own mini-bar does not compete.
    expect(offer.defaultPrevented).toBe(true)
    expect(useInstallOffer.getState().offer).toBe(offer)
    await expect(installNow()).resolves.toBe(true)
    expect(prompt).toHaveBeenCalledTimes(1)
    // Single-use.
    expect(useInstallOffer.getState().offer).toBeNull()
    await expect(installNow()).resolves.toBe(false)
    window.dispatchEvent(new Event('appinstalled'))
    expect(saidInstalled()).toBe(true)
    expect(useInstallOffer.getState().installed).toBe(true)
  })
})

describe('a tournament’s pages name it in the manifest link (PWA-09)', () => {
  it('while open, and the app’s own manifest again after', () => {
    const link = document.createElement('link')
    link.rel = 'manifest'
    link.href = '/manifest.webmanifest'
    document.head.appendChild(link)
    const undo = pointManifestAt('nachos-bachelor')
    expect(link.getAttribute('href')).toBe('/api/manifest?t=nachos-bachelor')
    undo()
    expect(link.getAttribute('href')).toBe('/manifest.webmanifest')
    pointManifestAt(null)()
    expect(link.getAttribute('href')).toBe('/manifest.webmanifest')
    link.remove()
  })
})

describe('the installed app’s launch (PWA-09)', () => {
  it('goes back to the tournament it was in, while recent, once per launch', () => {
    standalone(true)
    setLastTournament({ slug: 'nachos-bachelor', name: 'Nacho', at: Date.now() - 60_000 })
    expect(launchTarget('')).toBe('nachos-bachelor')
    // Home again inside the same launch: Home.
    expect(launchTarget('')).toBeNull()
  })

  it('an old tournament is Home’s to offer, not the launch’s', () => {
    standalone(true)
    setLastTournament({ slug: 'nachos-bachelor', name: 'Nacho', at: Date.now() - RESUME_MS - 1 })
    expect(launchTarget('')).toBeNull()
    sessionStorage.clear()
    // Saved before PWA-09: no time, so not recent.
    setLastTournament({ slug: 'nachos-bachelor', name: 'Nacho' })
    expect(launchTarget('')).toBeNull()
  })

  it('a first launch with nothing on the phone opens the tournament the app was installed from', () => {
    standalone(true)
    expect(launchTarget('?t=nachos-bachelor')).toBe('nachos-bachelor')
    sessionStorage.clear()
    expect(launchTarget('?t=../admin')).toBeNull()
  })

  it('in a browser, Home is Home', () => {
    setLastTournament({ slug: 'nachos-bachelor', name: 'Nacho', at: Date.now() })
    expect(launchTarget('?t=nachos-bachelor')).toBeNull()
  })
})
