/**
 * Whether the phone has signal, and which screen says so (OfflineBanner.tsx shows the shell's banner); apart so
 * that file exports components only (QA-15: fast refresh).
 */
import { useEffect, useState } from 'react'

export function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

// Screens that say «Sin señal» themselves (the tournament's header): while one
// is mounted the banner stays away, so losing the signal never pushes the
// Tarjeta's steppers down under a thumb on its way to them (MOT-17).
let ownStatus = 0
const listeners = new Set<() => void>()
/** The banner listens here for a screen that says the connection itself. */
export const subscribeOwnStatus = (fn: () => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
export const ownsStatus = () => ownStatus > 0

/** This screen shows the connection itself; the shell's banner steps aside while it is mounted. */
export function useOwnConnectionStatus() {
  useEffect(() => {
    ownStatus++
    listeners.forEach((fn) => fn())
    return () => {
      ownStatus--
      listeners.forEach((fn) => fn())
    }
  }, [])
}
