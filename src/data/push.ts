/**
 * Web push on this device: ask for permission inside a tap, subscribe through
 * the service worker with the app's VAPID public key, and save the address
 * for what it hears:
 * - an account (migration 0019): its notices, its tournaments' included, on
 *   every phone where it turned them on;
 * - the player a phone holds by PIN in one tournament (0052, PWA-10): that
 *   tournament's notices, until the phone stops holding him (the server drops
 *   the address then).
 * iPhone and iPad allow it only from the app on the home screen (16.4+), so
 * that case says so instead. One browser has one address: turning one of the
 * two off never takes the address from the other.
 */
import { create } from 'zustand'
import { t } from '../i18n/es-MX'
import { devicePlatform, isStandalone } from '../lib/install'
import { supabase } from '../lib/supabase'
import { ApiError } from './api'
import { useAuth } from './auth'
import { useUnread } from './social'

export type PushState = 'unsupported' | 'needsInstall' | 'denied' | 'off' | 'on'

/** Whose notices: the account's, or the player this phone holds by PIN in a tournament. */
export type PushTarget = { kind: 'account' } | { kind: 'player'; tournamentId: string }
export const ACCOUNT: PushTarget = { kind: 'account' }

const vapidKey = () => import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

/**
 * The design fixtures' push (src/dev/FixtureGate, `?push=`): the state a screen is drawn in, with no browser
 * asked and no server; turning them on or off only flips it. Null everywhere else.
 */
export const usePushFixture = create<{ state: PushState | null }>(() => ({ state: null }))

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  return (await navigator.serviceWorker.getRegistration()) ?? null
}

/** The account has this address saved (its own rows only, RLS); a doubt reads as yes. */
async function accountHas(endpoint: string): Promise<boolean> {
  try {
    const { data, error } = await supabase().from('push_subscriptions').select('endpoint').eq('endpoint', endpoint).maybeSingle()
    return !!error || !!data
  } catch {
    return true
  }
}
/** A player this phone holds by PIN hears this address (in that tournament, or with null in any); a doubt reads as yes. */
async function playerHas(tournamentId: string | null, endpoint: string): Promise<boolean> {
  try {
    const { data, error } = await supabase().rpc('pin_push_on', { p_tournament_id: tournamentId, p_endpoint: endpoint })
    return !!error || data === true
  } catch {
    return true
  }
}

export async function pushState(target: PushTarget = ACCOUNT): Promise<PushState> {
  const fixture = usePushFixture.getState().state
  if (fixture) return fixture
  if (typeof window === 'undefined' || !vapidKey()) return 'unsupported'
  if (devicePlatform() === 'ios' && !isStandalone()) return 'needsInstall'
  if (!('Notification' in window) || !('PushManager' in window) || !('serviceWorker' in navigator)) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await registration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub || Notification.permission !== 'granted') return 'off'
  // The browser has an address; whether it is saved for this target is the server's to say (a phone that took
  // another player lost it there, and an account's switch can't be on with only a PIN phone's row). With no
  // signal, what the browser holds.
  const saved = target.kind === 'player' ? await playerHas(target.tournamentId, sub.endpoint) : await accountHas(sub.endpoint)
  return saved ? 'on' : 'off'
}

/** Must run inside a tap (iOS refuses the permission prompt otherwise). */
export async function enablePush(target: PushTarget = ACCOUNT): Promise<PushState> {
  if (usePushFixture.getState().state) {
    usePushFixture.setState({ state: 'on' })
    return 'on'
  }
  const key = vapidKey()
  if (!key) return 'unsupported'
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off'
  const reg = (await registration()) ?? (await navigator.serviceWorker.ready)
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) as BufferSource }))
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  const address = { p_endpoint: json.endpoint, p_p256dh: json.keys.p256dh, p_auth: json.keys.auth, p_user_agent: navigator.userAgent }
  const { error } =
    target.kind === 'player'
      ? await supabase().rpc('save_pin_push', { p_tournament_id: target.tournamentId, ...address })
      : await supabase().rpc('save_push_subscription', address)
  if (error) throw ApiError.from(error)
  return 'on'
}

export async function disablePush(target: PushTarget = ACCOUNT): Promise<PushState> {
  if (usePushFixture.getState().state) {
    usePushFixture.setState({ state: 'off' })
    return 'off'
  }
  const sub = await (await registration())?.pushManager.getSubscription()
  if (sub) {
    const { error } =
      target.kind === 'player'
        ? await supabase().rpc('delete_pin_push', { p_endpoint: sub.endpoint })
        : await supabase().rpc('delete_push_subscription', { p_endpoint: sub.endpoint })
    if (error) throw ApiError.from(error)
    // The browser's address goes too, unless the other one still hears through it.
    const other = target.kind === 'player' ? await accountHas(sub.endpoint) : await playerHas(null, sub.endpoint)
    if (!other) await sub.unsubscribe()
  }
  return 'off'
}

/**
 * What to do once they are blocked, said for this phone (PWA-12): the browser's settings were wrong in the
 * installed iPhone app, where it is the phone's own Ajustes.
 */
export function deniedHelp(): string {
  const P = t.push
  const platform = devicePlatform()
  if (platform === 'ios') return P.deniedIos
  if (platform === 'android') return isStandalone() ? P.deniedAndroidApp : P.deniedAndroid
  return P.denied
}

/** Why this phone can't take them: an iPhone or iPad too old for them, or a browser without push. */
export function unsupportedHelp(): string {
  return devicePlatform() === 'ios' ? t.push.unsupportedIos : t.push.unsupported
}

/** The icon's count: the inbox's unread notices, or none. */
export function setAppBadge(count: number) {
  if (typeof navigator === 'undefined') return
  const n = navigator as Navigator & { setAppBadge?: (count?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
  const done = count > 0 ? n.setAppBadge?.(count) : n.clearAppBadge?.()
  void done?.catch(() => undefined)
}

/** Clears the home-screen badge once the inbox is read. */
export function clearAppBadge() {
  setAppBadge(0)
}

let badgeSync = false
/**
 * The icon's count follows the inbox (PWA-12): set from the unread count each time the app comes to the front
 * or the account changes, and whenever the count does. It used to clear only when Avisos marked everything
 * read, so a count read elsewhere stayed on the icon. A phone with no account has no inbox: no count.
 */
export function startBadgeSync() {
  if (badgeSync || typeof document === 'undefined') return
  badgeSync = true
  const account = () => {
    const { user, isAnonymous } = useAuth.getState()
    return user && !isAnonymous ? user.id : null
  }
  const refresh = async () => {
    if (!useAuth.getState().ready) return
    if (!account()) { setAppBadge(0); return; }
    await useUnread.getState().refresh()
    setAppBadge(useUnread.getState().count)
  }
  useUnread.subscribe((s, prev) => {
    if (s.count !== prev.count) setAppBadge(s.count)
  })
  useAuth.subscribe((s, prev) => {
    if (s.ready !== prev.ready || s.user?.id !== prev.user?.id || s.isAnonymous !== prev.isAnonymous) void refresh()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void refresh()
  })
  void refresh()
}

/** For tests. */
export const _pushTest = {
  resetBadgeSync() {
    badgeSync = false
  },
}
