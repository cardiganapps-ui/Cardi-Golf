/**
 * REL-13: a page the service worker does not control (a first visit, an
 * in-app browser) crashed on any screen opened after a deploy: the old
 * build's chunk was gone, and the SPA rewrite answered it with the app's HTML.
 * Now the page loads the new build, once, and the server answers 404.
 */
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { reloadingForNewBuild, resetChunkRecoveryForTests, startChunkRecovery } from './chunkReload'

/** A tab: `stored` is its session storage, which a reload keeps. */
function page({ online = true, storage = 'ok', stored = new Map<string, string>() }: { online?: boolean; storage?: 'ok' | 'throws'; stored?: Map<string, string> } = {}) {
  const win = new EventTarget()
  const reload = vi.fn()
  const refuse = () => {
    throw new DOMException('The operation is insecure.', 'SecurityError')
  }
  const sessionStorage = storage === 'throws' ? { getItem: refuse, setItem: refuse } : { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => void stored.set(k, v) }
  Object.assign(win, { navigator: { onLine: online }, sessionStorage, location: { reload } })
  startChunkRecovery(win as unknown as Window)
  return { win, reload, stored }
}
/** What Vite fires when a screen's chunk, or its stylesheet, fails to load. */
const chunkFails = (win: EventTarget) => win.dispatchEvent(new Event('vite:preloadError', { cancelable: true }))

afterEach(() => {
  resetChunkRecoveryForTests()
  vi.useRealTimers()
})

describe('a screen of the build before a deploy (REL-13)', () => {
  it('loads the new build, once', () => {
    const { win, reload } = page()
    chunkFails(win)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(reloadingForNewBuild()).toBe(true)
    // Its stylesheet failing too, on the way out: still one reload.
    chunkFails(win)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('a failure within a minute of that reload is something else (the signal): the error shows', () => {
    vi.useFakeTimers()
    const before = page()
    chunkFails(before.win)
    // The reloaded page: the same tab and session storage, the module from scratch.
    resetChunkRecoveryForTests()
    vi.advanceTimersByTime(20_000)
    const after = page({ stored: before.stored })
    chunkFails(after.win)
    expect(after.reload).not.toHaveBeenCalled()
    expect(reloadingForNewBuild()).toBe(false)
    // Another deploy later in the day reloads again.
    vi.advanceTimersByTime(60_000)
    chunkFails(after.win)
    expect(after.reload).toHaveBeenCalledTimes(1)
  })

  it('a clock set back since the last reload counts as within the minute: never a loop', () => {
    vi.useFakeTimers()
    const before = page()
    chunkFails(before.win)
    resetChunkRecoveryForTests()
    vi.setSystemTime(Date.now() - 60 * 60_000)
    const after = page({ stored: before.stored })
    chunkFails(after.win)
    expect(after.reload).not.toHaveBeenCalled()
  })

  it('never reloads offline: without a service worker the reload would lose the app', () => {
    const { win, reload } = page({ online: false })
    chunkFails(win)
    expect(reload).not.toHaveBeenCalled()
    expect(reloadingForNewBuild()).toBe(false)
  })

  it('never reloads in a tab that keeps nothing: it could not tell a second failure from the first', () => {
    const { win, reload } = page({ storage: 'throws' })
    chunkFails(win)
    expect(reload).not.toHaveBeenCalled()
  })

  it('the server answers an old chunk with 404, not with the app (whose HTML the browser cannot run as a script)', () => {
    const vercel = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8')) as { rewrites: Array<{ source: string; destination: string }> }
    const spa = vercel.rewrites.find((r) => r.destination === '/index.html')!
    const rewritten = (path: string) => new RegExp(`^${spa.source}$`).test(path)
    expect(rewritten('/assets/StatsScreen-DKzuE5NK.js')).toBe(false)
    expect(rewritten('/assets/index-B1x2.css')).toBe(false)
    expect(rewritten('/api/backup-cron')).toBe(false)
    expect(rewritten('/t/nacho/stats')).toBe(true)
    expect(rewritten('/')).toBe(true)
  })

  it('a first visit is served by its service worker as soon as it installs; an update still waits for «Actualizar»', () => {
    const config = readFileSync(new URL('../../vite.config.ts', import.meta.url), 'utf8')
    expect(config).toMatch(/clientsClaim:\s*true/)
    expect(config).not.toMatch(/skipWaiting:\s*true/)
    expect(config).toMatch(/registerType:\s*'prompt'/)
  })
})
