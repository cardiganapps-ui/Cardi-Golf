/**
 * Installing the app (PWA-08). Which phone this is, whether this page is the
 * installed app, whether the phone said it has it, and Android Chrome's own
 * install offer, kept from the moment the browser makes it so a button can
 * open it in one tap.
 */
import { create } from 'zustand'
import { onLinkPage } from './linkPage'

/** The browser's install offer (Chrome, Edge, Samsung Internet): not in TypeScript's DOM types. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** Set when the browser said Polo was installed, or the player did («Ya la tengo»): the card stops asking here. */
const INSTALLED = 'cardi-golf:installed'
/** «Ya la tengo» before PWA-08 wrote this key; it means the same. */
const LEGACY = 'cardi-golf:install-guide-dismissed'

/** Opened from the home-screen icon: no browser around the app. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return window.matchMedia?.('(display-mode: standalone)').matches || nav.standalone === true
}

export type DevicePlatform = 'ios' | 'android' | 'other'

/**
 * Which steps install Polo here: an iPhone or iPad (any browser there adds to the home screen through its
 * share menu), an Android phone, or anything else (a laptop: nothing to say).
 */
export function devicePlatform(): DevicePlatform {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent
  // iPadOS reads as a Mac with a touch screen.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'other'
}

/** The phone has Polo installed, as far as this browser knows (the browser told us, or the player did). */
export function saidInstalled(): boolean {
  try {
    return localStorage.getItem(INSTALLED) === '1' || localStorage.getItem(LEGACY) === '1'
  } catch {
    return false
  }
}
export function markInstalled(): void {
  try {
    localStorage.setItem(INSTALLED, '1')
  } catch {
    /* private mode: the card hides for this visit all the same */
  }
  useInstallOffer.setState({ installed: true })
}

export const useInstallOffer = create<{ offer: InstallPromptEvent | null; installed: boolean }>(() => ({
  offer: null,
  installed: false,
}))

/** Opens the browser's own install dialog, when it offered one; the offer is single-use. */
export async function installNow(): Promise<boolean> {
  const offer = useInstallOffer.getState().offer
  if (!offer) return false
  useInstallOffer.setState({ offer: null })
  await offer.prompt()
  const { outcome } = await offer.userChoice
  return outcome === 'accepted'
}

let listening = false
/** From the first moment: Chrome may offer the install before React has mounted anything. */
export function listenForInstall(): void {
  if (listening || typeof window === 'undefined') return
  listening = true
  window.addEventListener('beforeinstallprompt', (e) => {
    // Our button opens it; the browser's own mini-bar would compete with it.
    e.preventDefault()
    useInstallOffer.setState({ offer: e as InstallPromptEvent })
  })
  window.addEventListener('appinstalled', () => {
    useInstallOffer.setState({ offer: null })
    // A link to watch keeps nothing on the phone (STRAT-05): it knows for this visit only.
    if (onLinkPage()) useInstallOffer.setState({ installed: true })
    else markInstalled()
  })
}

/**
 * While a tournament's page is open (Entrar or inside), the manifest link names it (`api/manifest.ts`), so
 * an app added to the home screen from here opens this tournament the first time (PWA-09). Returns the undo.
 */
export function pointManifestAt(slug: string | null): () => void {
  const link = typeof document === 'undefined' ? null : document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
  if (!link || !slug) return () => undefined
  const before = link.getAttribute('href')
  link.setAttribute('href', `/api/manifest?t=${encodeURIComponent(slug)}`)
  return () => {
    if (before != null) link.setAttribute('href', before)
  }
}
