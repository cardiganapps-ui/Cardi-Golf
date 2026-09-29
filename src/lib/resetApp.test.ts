import { describe, expect, it, vi } from 'vitest'
import { resetApp } from './resetApp'

describe('resetApp', () => {
  it('unregisters workers, clears caches and reloads — nothing else', async () => {
    const unregister = vi.fn(async () => true)
    const del = vi.fn(async (_key: string) => true)
    const replace = vi.fn()
    await resetApp({
      serviceWorker: { getRegistrations: async () => [{ unregister }, { unregister }] },
      caches: { keys: async () => ['workbox-precache', 'runtime'], delete: del },
      replace,
      now: () => 42,
    })
    expect(unregister).toHaveBeenCalledTimes(2)
    expect(del.mock.calls.map((c) => c[0])).toEqual(['workbox-precache', 'runtime'])
    expect(replace).toHaveBeenCalledWith('/?r=42')
  })

  it('still reloads when the browser has no service worker or caches', async () => {
    const replace = vi.fn()
    await resetApp({ replace, now: () => 1 })
    expect(replace).toHaveBeenCalledWith('/?r=1')
  })

  it('still reloads when clearing fails', async () => {
    const replace = vi.fn()
    await resetApp({
      serviceWorker: { getRegistrations: async () => { throw new Error('denied') } },
      caches: { keys: async () => { throw new Error('denied') }, delete: async () => true },
      replace,
      now: () => 3,
    })
    expect(replace).toHaveBeenCalledWith('/?r=3')
  })

  it('does not know about localStorage or IndexedDB at all', async () => {
    const src = await import('node:fs').then((fs) => fs.readFileSync(new URL('./resetApp.ts', import.meta.url), 'utf8'))
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(code).not.toMatch(/localStorage|indexedDB|sessionStorage/)
  })
})
