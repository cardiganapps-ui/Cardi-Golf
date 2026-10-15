import { useEffect, useState, useSyncExternalStore } from 'react'
import { t } from '../i18n/es-MX'
import styles from './OfflineBanner.module.css'

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
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
const ownsStatus = () => ownStatus > 0

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

/**
 * The region is always there and the banner comes and goes inside it (A11Y-14): a status region inserted
 * together with its text is one VoiceOver often skips. Empty, it takes no room.
 */
export function OfflineBanner() {
  const online = useOnline()
  const owned = useSyncExternalStore(subscribe, ownsStatus, ownsStatus)
  return <div role="status">{!online && !owned && <div className={styles.banner}>{t.sync.offline}</div>}</div>
}
