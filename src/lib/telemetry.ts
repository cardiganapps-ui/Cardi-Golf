/**
 * First-party telemetry (STRAT-02). Polo could not see a failure on a
 * player's phone, nor whether a saved hole reached the others in under 2 s.
 * Each phone now sends, to our own database (0037), in small batches:
 *
 *   - errors: uncaught ones, unhandled rejections, the two error screens;
 *   - sync: how long `save_hole` took to answer (`save_ack`), how long a
 *     change by another phone took to arrive here (`apply_lag`, corrected by
 *     this phone's clock offset when it has one), the live channel degrading;
 *   - vitals: LCP, INP, CLS, FCP and TTFB;
 *   - funnel: a handful of steps (opened a tournament, entered with a PIN,
 *     saved a hole, signed a card, created a tournament);
 *   - a heartbeat every five minutes with this build and what the outbox holds.
 *
 * Never a name, an email, a score or an amount: data carries a message, a
 * route and small counters, and the server strips secret-shaped keys and
 * addresses again. Nothing is sent from tests, dev builds or the in-memory
 * fixtures; and a send that fails is kept (at most 200 events) for the next.
 */
import { BUILD } from './build'
import { supabase, supabaseConfigured } from './supabase'

export type EventKind = 'error' | 'sync' | 'vital' | 'funnel'
export interface ClientEvent {
  deviceId: string
  tournamentId: string | null
  build: number
  buildSha: string
  kind: EventKind
  name: string
  value?: number
  data?: Record<string, string | number | boolean | null>
  at: string
}

export interface DeviceSnapshot {
  pending: number
  rejected: number
  oldestPendingAt: string | null
  lastSyncAt: string | null
}

const DEVICE_KEY = 'cardi-golf:device-id'
const QUEUE_KEY = 'cardi-golf:telemetry'
const MAX_QUEUE = 200
const BATCH = 50
const FLUSH_MS = 30_000
const HEARTBEAT_MS = 5 * 60_000
/** At most this many errors per page load, and the same error once a minute. */
const MAX_ERRORS = 30
const ERROR_REPEAT_MS = 60_000
/** A row this phone pushed counts as its own echo for this long (not another phone's change). */
const OWN_ECHO_MS = 2 * 60_000

let enabled = false
let deviceId = ''
let tournamentId: string | null = null
let queue: ClientEvent[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null
let flushing = false
let errorsSent = 0
const lastErrorAt = new Map<string, number>()
const ownPushes = new Map<string, number>()
/** This phone's clock minus the server's, in ms, from the best (shortest round trip) sample; null until one. */
let offset: { ms: number; rtt: number } | null = null
let snapshot: () => DeviceSnapshot = () => ({ pending: 0, rejected: 0, oldestPendingAt: null, lastSyncAt: null })
const once = new Set<string>()

/** Telemetry is on in a production build with Supabase configured, off in tests, dev and fixtures. */
export function telemetryAllowed(env: { PROD?: boolean; MODE?: string } = import.meta.env): boolean {
  return !!env.PROD && env.MODE !== 'test' && supabaseConfigured
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : '00000000-0000-4000-8000-000000000000'.replace(/0/g, () => Math.floor(Math.random() * 16).toString(16))
}

/** A random id per install, kept on the phone. It names no one: it tells two phones of one account apart. */
export function getDeviceId(): string {
  if (deviceId) return deviceId
  try {
    const kept = localStorage.getItem(DEVICE_KEY)
    if (kept && /^[0-9a-f-]{36}$/i.test(kept)) return (deviceId = kept)
    deviceId = newId()
    localStorage.setItem(DEVICE_KEY, deviceId)
  } catch {
    deviceId ||= newId()
  }
  return deviceId
}

function save() {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE)))
  } catch {
    /* storage full or blocked: the events stay in memory */
  }
}
function restore() {
  try {
    const kept = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]')
    if (Array.isArray(kept)) queue = kept.filter((e) => e && typeof e.name === 'string').slice(-MAX_QUEUE)
  } catch {
    queue = []
  }
}

/** Short and free of anything that names a person: an address or a token becomes a placeholder. */
export function scrub(text: string, max = 300): string {
  return text
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[correo]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[token]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[id]')
    .slice(0, max)
}
/** The route without its ids: «/t/:slug/tarjeta», so errors on the same screen group together. */
export function routeOf(path: string): string {
  return path
    .replace(/^\/t\/[^/]+/, '/t/:slug')
    .replace(/^\/p\/[^/]+/, '/p/:handle')
    .replace(/^\/c\/(?!unirme)[^/]+/, '/c/:slug')
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27}\b/gi, ':id')
    .slice(0, 80)
}

/** Record one event. Cheap and synchronous; it goes out with the next batch. */
export function track(kind: EventKind, name: string, value?: number, data?: ClientEvent['data']) {
  if (!enabled) return
  queue.push({
    deviceId: getDeviceId(),
    tournamentId,
    build: BUILD.id,
    buildSha: BUILD.sha,
    kind,
    name,
    ...(value != null && Number.isFinite(value) ? { value: Math.round(value * 1000) / 1000 } : {}),
    ...(data ? { data } : {}),
    at: new Date().toISOString(),
  })
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE)
  save()
  scheduleFlush()
}

/** A step people take, once per page load for the ones that would repeat (opening the same tournament). */
export function step(name: string, opts: { once?: boolean } = {}) {
  if (opts.once) {
    const key = `${name}:${tournamentId ?? ''}`
    if (once.has(key)) return
    once.add(key)
  }
  track('funnel', name)
}

/** An error, grouped by its message and screen, at most once a minute each and 30 per page load. */
export function reportError(name: string, error: unknown) {
  if (!enabled || errorsSent >= MAX_ERRORS) return
  const err = error instanceof Error ? error : null
  const message = scrub(err ? `${err.name}: ${err.message}` : String(error))
  const route = typeof location !== 'undefined' ? routeOf(location.pathname) : ''
  const key = `${name}|${message}|${route}`
  const now = Date.now()
  if (now - (lastErrorAt.get(key) ?? -Infinity) < ERROR_REPEAT_MS) return
  lastErrorAt.set(key, now)
  errorsSent++
  const stack = err?.stack ? scrub(err.stack.split('\n').slice(1, 6).join('\n'), 700) : null
  track('error', name, undefined, { message, route, ...(stack ? { stack } : {}) })
}

/** The tournament on screen: events and heartbeats carry it (the server keeps it only if the phone is in it). */
export function setTelemetryTournament(id: string | null) {
  if (tournamentId === id) return
  tournamentId = id
  if (enabled) void heartbeat()
}

/** What the outbox holds, for the heartbeat. Set once by the outbox. */
export function setDeviceSnapshot(fn: () => DeviceSnapshot) {
  snapshot = fn
}
/** What the next heartbeat will say about the outbox. */
export function deviceSnapshot(): DeviceSnapshot {
  return snapshot()
}

/**
 * `save_hole` answered: the round trip, and a clock sample from the rows it
 * stored (their `updated_at` is the server's time between send and answer).
 */
export function saveAnswered(sentAt: number, answeredAt: number, rows: Array<Record<string, unknown>> | undefined, keys: string[]) {
  const now = Date.now()
  for (const k of keys) ownPushes.set(k, now)
  const rtt = answeredAt - sentAt
  if (!(rtt >= 0)) return
  track('sync', 'save_ack', rtt)
  const stamp = rows?.map((r) => Date.parse(String(r.updated_at ?? ''))).find((t) => Number.isFinite(t))
  if (stamp != null && (offset == null || rtt < offset.rtt)) offset = { ms: (sentAt + answeredAt) / 2 - stamp, rtt }
}

/** This phone's clock minus the server's (ms), or null before any sample. For tests and Más. */
export function clockOffset(): number | null {
  return offset?.ms ?? null
}

/**
 * A score changed by another phone arrived on the live channel: how long
 * after the server stored it. Own echoes (rows this phone pushed in the last
 * two minutes) are not another phone's change and are left out.
 */
export function changeArrived(row: Record<string, unknown>) {
  if (!enabled) return
  const key = `${row.round_id}:${row.player_id}:${row.hole}`
  const now = Date.now()
  for (const [k, at] of ownPushes) if (now - at > OWN_ECHO_MS) ownPushes.delete(k)
  if (ownPushes.has(key)) return
  const stamp = Date.parse(String(row.updated_at ?? ''))
  if (!Number.isFinite(stamp)) return
  const lag = now - (offset?.ms ?? 0) - stamp
  // A lag beyond ten minutes is a phone that slept or a clock far off, not a delivery time.
  if (lag < -5000 || lag > 600_000) return
  track('sync', 'apply_lag', Math.max(0, lag), { corrected: offset != null })
}

function scheduleFlush(ms = FLUSH_MS) {
  if (flushTimer || !enabled) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    void flush()
  }, ms)
}

/** Send what is queued, 50 at a time. Kept for the next try if the network or the session fails. */
export async function flush(): Promise<void> {
  if (!enabled || flushing || !queue.length) return
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return scheduleFlush()
  flushing = true
  try {
    while (queue.length) {
      const batch = queue.slice(0, BATCH)
      const { error } = await supabase().rpc('log_client_events', { p_events: batch })
      // A database without 0037: stop for this page load, keep the queue for a build that finds it.
      if (error && (error.code === 'PGRST202' || error.code === '42883')) {
        enabled = false
        break
      }
      // A refusal of the batch itself (bad shape) would repeat forever: drop it. Anything else waits.
      if (error && error.code !== '22023') break
      queue = queue.slice(batch.length)
      save()
    }
  } catch {
    /* offline or no session: kept for the next flush */
  } finally {
    flushing = false
    if (queue.length) scheduleFlush()
  }
}

function platform(): 'ios' | 'android' | 'desktop' | 'other' {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  if (/Windows|Macintosh|Linux|CrOS/.test(ua)) return 'desktop'
  return 'other'
}
function standalone(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
}

/** This phone's build and outbox, for Salud and the Comité. */
export async function heartbeat(): Promise<void> {
  if (!enabled) return
  try {
    const s = snapshot()
    await supabase().rpc('heartbeat', {
      p: { deviceId: getDeviceId(), tournamentId, build: BUILD.id, buildSha: BUILD.sha, platform: platform(), standalone: standalone(), ...s },
    })
  } catch {
    /* next one */
  }
}

/** Start: listeners, the restored queue, vitals, the heartbeat. Once, from main.tsx. */
export function startTelemetry(env?: { PROD?: boolean; MODE?: string }) {
  if (enabled || !telemetryAllowed(env) || typeof window === 'undefined') return
  // The in-memory fixtures are nobody's phone.
  if (location.pathname.startsWith('/t/_/') || location.pathname.startsWith('/admin/_')) return
  enabled = true
  restore()
  window.addEventListener('error', (e) => reportError('window.error', e.error ?? e.message))
  window.addEventListener('unhandledrejection', (e) => reportError('unhandledrejection', e.reason))
  // A page going away sends what it has; a page coming back says it is alive.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush()
    else void heartbeat()
  })
  window.addEventListener('online', () => void flush())
  setInterval(() => {
    if (document.visibilityState === 'visible') void heartbeat()
  }, HEARTBEAT_MS)
  void import('web-vitals')
    .then(({ onLCP, onINP, onCLS, onFCP, onTTFB }) => {
      const send = (m: { name: string; value: number; rating?: string }) => track('vital', m.name.toLowerCase(), m.value, { rating: m.rating ?? null, route: routeOf(location.pathname) })
      onLCP(send)
      onINP(send)
      onCLS(send)
      onFCP(send)
      onTTFB(send)
    })
    .catch(() => {})
  step('app_open')
  void heartbeat()
  scheduleFlush(5_000)
}

/** For tests: forget everything and turn on or off. */
export function resetTelemetryForTests(on = false) {
  enabled = on
  queue = []
  tournamentId = null
  errorsSent = 0
  lastErrorAt.clear()
  ownPushes.clear()
  once.clear()
  offset = null
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = null
  flushing = false
}
/** For tests: what is queued. */
export function queuedEvents(): ClientEvent[] {
  return queue
}
