/**
 * PERF-13: a file the build links at its fingerprint (`?v=`, vite.config.ts) is kept a year by every browser, and
 * nothing else is. vercel.json marked only /assets/* immutable, so the icons and the brand mark were asked for
 * again on every page view outside the service worker (a first visit, WhatsApp's in-app browser). A file served
 * under a name that never changes (the worker, the push handler, an icon the push handler names bare) must keep
 * asking: immutable there would pin an old copy for a year.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { lockups } from '../design/logoMark.json'
import { assetUrl } from './assetUrl'

interface Rule {
  source: string
  has?: Array<{ type: string; key: string }>
  headers: Array<{ key: string; value: string }>
}
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as { headers: Rule[] }

/** Vercel's match of a rule's source against a path (these sources: literals and `(.*)`). */
const matches = (rule: Rule, url: URL) =>
  new RegExp(`^${rule.source.replace(/\./g, '\\.').replace('(\\.*)', '(.*)')}$`).test(url.pathname) &&
  (rule.has ?? []).every((h) => h.type === 'query' && url.searchParams.has(h.key))

/** The Cache-Control a path gets: the last matching rule that sets one, as Vercel applies them. */
function cacheControl(path: string): string | undefined {
  const url = new URL(path, 'https://golf.cardigan.mx')
  let value: string | undefined
  for (const rule of vercel.headers) {
    if (!matches(rule, url)) continue
    value = rule.headers.find((h) => h.key.toLowerCase() === 'cache-control')?.value ?? value
  }
  return value
}

describe('what browsers keep (PERF-13)', () => {
  it('only fingerprinted files are immutable: the build’s assets, and public files asked for with their `v`', () => {
    for (const rule of vercel.headers) {
      const cc = rule.headers.find((h) => h.key.toLowerCase() === 'cache-control')?.value ?? ''
      if (!cc.includes('immutable')) continue
      expect(
        rule.source === '/assets/(.*)' || rule.has?.some((h) => h.type === 'query' && h.key === 'v'),
        rule.source,
      ).toBe(true)
    }
  })

  it('the icons, the brand mark, the launch images and the screenshots are kept a year at their fingerprint', () => {
    for (const path of [
      '/icons/icon-192.png',
      '/icons/shortcut-envivo.png',
      '/brand/polo-mark.png',
      '/brand/boot-mark.png',
      '/splash/iphone-1179x2556.png',
      '/screenshots/envivo.webp',
      '/favicon.svg',
      '/apple-touch-icon.png',
    ]) {
      expect(cacheControl(`${path}?v=0123456789`), path).toBe('public, max-age=31536000, immutable')
      // Bare, the name could carry new bytes tomorrow (the push handler names the icon this way).
      expect(cacheControl(path), path).toBeUndefined()
    }
  })

  it('the worker, its push handler and the pages are never kept', () => {
    expect(cacheControl('/sw.js')).toBe('public, max-age=0, must-revalidate')
    expect(cacheControl('/push-sw.js?v=0123456789')).toBe('public, max-age=0, must-revalidate')
    expect(cacheControl('/t/nacho')).toBeUndefined()
  })

  it('the app asks for every brand image at its fingerprint', () => {
    for (const path of [lockups.standard.image, lockups.board.image, '/brand/boot-mark.png']) {
      const fingerprint = createHash('sha256')
        .update(readFileSync(`public${path}`))
        .digest('hex')
        .slice(0, 10)
      expect(assetUrl(path), path).toBe(`${path}?v=${fingerprint}`)
    }
    // index.html names the boot mark bare; the build writes its fingerprint in (vite.config.ts, `versioned-icons`).
    expect(readFileSync('index.html', 'utf8')).toContain('<img src="/brand/boot-mark.png"')
  })
})
