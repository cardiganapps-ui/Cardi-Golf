/**
 * Web push on this device (migration 0019): ask for permission inside a tap,
 * subscribe through the service worker with the app's VAPID public key, and
 * save the subscription for my profile. iOS only allows it from the app on
 * the home screen (16.4+), so that case says so instead.
 */
import { supabase } from '../lib/supabase'
import { ApiError } from './api'

export type PushState = 'unsupported' | 'needsInstall' | 'denied' | 'off' | 'on'

const vapidKey = () => import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

const isIos = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)
const standalone = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  return (await navigator.serviceWorker.getRegistration()) ?? null
}

export async function pushState(): Promise<PushState> {
  if (typeof window === 'undefined' || !vapidKey()) return 'unsupported'
  if (isIos() && !standalone()) return 'needsInstall'
  if (!('Notification' in window) || !('PushManager' in window) || !('serviceWorker' in navigator)) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await registration()
  const sub = await reg?.pushManager.getSubscription()
  return sub && Notification.permission === 'granted' ? 'on' : 'off'
}

/** Must run inside a tap (iOS refuses the permission prompt otherwise). */
export async function enablePush(): Promise<PushState> {
  const key = vapidKey()
  if (!key) return 'unsupported'
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off'
  const reg = (await registration()) ?? (await navigator.serviceWorker.ready)
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) as BufferSource }))
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  const { error } = await supabase().rpc('save_push_subscription', { p_endpoint: json.endpoint, p_p256dh: json.keys.p256dh, p_auth: json.keys.auth, p_user_agent: navigator.userAgent })
  if (error) throw ApiError.from(error)
  return 'on'
}

export async function disablePush(): Promise<PushState> {
  const sub = await (await registration())?.pushManager.getSubscription()
  if (sub) {
    await supabase().rpc('delete_push_subscription', { p_endpoint: sub.endpoint })
    await sub.unsubscribe()
  }
  return 'off'
}

/** Clears the home-screen badge once the inbox is read. */
export function clearAppBadge() {
  const n = navigator as Navigator & { clearAppBadge?: () => Promise<void> }
  void n.clearAppBadge?.().catch(() => undefined)
}
