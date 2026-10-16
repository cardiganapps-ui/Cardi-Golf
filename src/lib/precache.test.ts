/**
 * QA-16: nothing checked what the service worker keeps for a phone with no signal (§8), nor that the push
 * handler it imports is the file the build ships (a manual `?v=1` nobody had to bump). `npm run build` runs
 * scripts/check-precache.mjs on the real build; here, the checker itself, on builds made to fail it.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { precached, precacheProblems } from '../../scripts/check-precache.mjs'

const PUSH = 'self.addEventListener("push", () => {})'
const fp = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 10)
const made: string[] = []

/** A small build as vite-plugin-pwa lays it out, with what it should hold; `edit` breaks it. */
function build(edit: (files: Record<string, string>) => void = () => undefined) {
  const dir = mkdtempSync(join(tmpdir(), 'precache-'))
  made.push(dir)
  const listed = ['index.html', 'assets/index-a1.js', 'assets/index-b2.css', 'assets/font-c3.woff2', 'manifest.webmanifest', 'icons/icon-192.png', 'push-sw.js']
  const files: Record<string, string> = {
    'index.html': '<script type="module" src="/assets/index-a1.js"></script><link rel="stylesheet" href="/assets/index-b2.css"><link rel="manifest" href="/manifest.webmanifest">',
    'assets/index-a1.js': 'console.log(1)',
    'assets/index-b2.css': '@font-face{src:url(/assets/font-c3.woff2) format("woff2"),url(/assets/font-c3.woff) format("woff")}',
    'assets/font-c3.woff2': 'font',
    'manifest.webmanifest': JSON.stringify({ icons: [{ src: '/icons/icon-192.png?v=abc' }] }),
    'icons/icon-192.png': 'png',
    'push-sw.js': PUSH,
  }
  files['sw.js'] = `importScripts("/push-sw.js?v=${fp(PUSH)}");e.precacheAndRoute([${listed.map((u) => `{url:"${u}",revision:"r"}`).join(',')},{url:"index.html",revision:"r"}],{})`
  edit(files)
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true })
    writeFileSync(join(dir, path), body)
  }
  return dir
}
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('what the worker keeps for no signal (QA-16)', () => {
  it('reads the precache list once per file', () => {
    expect(precached('[{url:"a.js",revision:null},{url:"b.css",revision:"x"},{url:"a.js",revision:null}]')).toEqual(['a.js', 'b.css'])
  })

  it('a whole build passes', () => {
    expect(precacheProblems(build())).toEqual([])
  })

  it('a font the styles use, left out, is named', () => {
    const d = build((f) => void (f['sw.js'] = f['sw.js']!.replace('{url:"assets/font-c3.woff2",revision:"r"},', '')))
    expect(precacheProblems(d)).toEqual(['assets/font-c3.woff2 is not precached (assets/index-b2.css uses it)'])
  })

  it('so are the shell, what it loads, the manifest and its icons', () => {
    const d = build((f) => void (f['sw.js'] = f['sw.js']!.replace(/\{url:"(index\.html|assets\/index-a1\.js|icons\/icon-192\.png)",revision:"r"\},?/g, '')))
    expect(precacheProblems(d)).toEqual([
      'index.html is not precached (every route opens it)',
      'assets/index-a1.js is not precached (index.html loads it)',
      'icons/icon-192.png is not precached (the manifest names it)',
    ])
  })

  it('a push handler changed without the worker importing it anew would stay old on every phone', () => {
    const d = build((f) => void (f['push-sw.js'] = `${PUSH}\n// changed`))
    expect(precacheProblems(d)).toEqual([expect.stringMatching(/^the worker imports push-sw\.js at \?v=[0-9a-f]{10}, but the file's is [0-9a-f]{10}: phones would keep the old handler$/)])
  })

  it('an image a notice shows (its icon, the badge) is precached with it (PWA-12)', () => {
    const shows = `self.addEventListener("push", () => ({ icon: '/icons/icon-192.png', badge: '/icons/badge-96.png' }))`
    const d = build((f) => {
      f['push-sw.js'] = shows
      f['sw.js'] = f['sw.js']!.replace(/push-sw\.js\?v=[0-9a-f]+/, `push-sw.js?v=${fp(shows)}`)
      f['icons/badge-96.png'] = 'png'
    })
    expect(precacheProblems(d)).toEqual(['icons/badge-96.png is not precached (a notice shows it)'])
    const listed = build((f) => {
      f['push-sw.js'] = shows
      f['sw.js'] = f['sw.js']!.replace(/push-sw\.js\?v=[0-9a-f]+/, `push-sw.js?v=${fp(shows)}`).replace('{url:"push-sw.js"', '{url:"icons/badge-96.png",revision:"r"},{url:"push-sw.js"')
      f['icons/badge-96.png'] = 'png'
    })
    expect(precacheProblems(listed)).toEqual([])
  })

  it('a file listed but missing, and a precache over its budget, are refused', () => {
    const d = build((f) => void delete f['assets/index-a1.js'])
    expect(precacheProblems(d)).toEqual([`assets/index-a1.js is precached but not in ${d}`])
    const big = build((f) => void (f['assets/index-a1.js'] = 'x'.repeat(3 * 1024)))
    expect(precacheProblems(big, 2)).toEqual(['the precache is 3 KiB, over its budget of 2 KiB'])
  })

  describe('the iPhone launch images (PWA-14)', () => {
    const LINK = '<link rel="apple-touch-startup-image" media="screen and (device-width: 393px)" href="/splash/iphone-1179x2556.png?v=abc">'
    const withLaunch = (f: Record<string, string>) => {
      f['index.html'] = `${f['index.html']}${LINK}`
      f['splash/iphone-1179x2556.png'] = 'png'
    }

    it('one linked from index.html need not be precached: iOS reads it when the app is added to the home screen', () => {
      expect(precacheProblems(build(withLaunch))).toEqual([])
    })

    it('one linked but not in the build is named', () => {
      const d = build((f) => {
        withLaunch(f)
        delete f['splash/iphone-1179x2556.png']
      })
      expect(precacheProblems(d)).toEqual([`splash/iphone-1179x2556.png is linked as a launch image but not in ${d}`])
    })

    it('one precached is refused: every phone would keep it for nothing', () => {
      const d = build((f) => {
        withLaunch(f)
        f['sw.js'] = f['sw.js']!.replace('{url:"push-sw.js"', '{url:"splash/iphone-1179x2556.png",revision:"r"},{url:"push-sw.js"')
      })
      expect(precacheProblems(d)).toEqual(['splash/iphone-1179x2556.png is precached, but iOS reads launch images only when the app is added to the home screen'])
    })

    it('any other image index.html loads is still needed in the precache', () => {
      const d = build((f) => void (f['index.html'] = `${f['index.html']}<img src="/brand/boot-mark.png">`))
      expect(precacheProblems(d)).toEqual(['brand/boot-mark.png is not precached (index.html loads it)'])
    })
  })

  describe('the install sheet’s screenshots (PWA-14)', () => {
    const withShot = (f: Record<string, string>) => {
      f['manifest.webmanifest'] = JSON.stringify({ icons: [{ src: '/icons/icon-192.png?v=abc' }], screenshots: [{ src: '/screenshots/envivo.webp?v=def' }] })
      f['screenshots/envivo.webp'] = 'webp'
    }

    it('shipped, and not precached: only the install sheet shows them', () => {
      expect(precacheProblems(build(withShot))).toEqual([])
    })

    it('one missing from the build, or precached, is named', () => {
      const missing = build((f) => {
        withShot(f)
        delete f['screenshots/envivo.webp']
      })
      expect(precacheProblems(missing)).toEqual([`screenshots/envivo.webp is a screenshot the manifest names but not in ${missing}`])
      const held = build((f) => {
        withShot(f)
        f['sw.js'] = f['sw.js']!.replace('{url:"push-sw.js"', '{url:"screenshots/envivo.webp",revision:"r"},{url:"push-sw.js"')
      })
      expect(precacheProblems(held)).toEqual(['screenshots/envivo.webp is precached, but only the install sheet shows it'])
    })
  })

  describe('the subsets Spanish never uses, and the install’s own icons (PERF-05)', () => {
    const EXT = '@font-face{src:url(/assets/font-ext-d4.woff2) format("woff2");unicode-range:U+0100-02BA,U+1E00-1E9F}'
    const LATIN = '@font-face{src:url(/assets/font-c3.woff2) format("woff2");unicode-range:U+0000-00FF,U+0131}'
    const ROUTE = 'e.registerRoute(/\\/assets\\/[^/?#]+\\.woff2$/,new e.CacheFirst({cacheName:"fonts"}),"GET");'
    const withExt = (f: Record<string, string>) => {
      f['assets/index-b2.css'] = `${LATIN}${EXT}`
      f['assets/font-ext-d4.woff2'] = 'font'
      f['sw.js'] = `${f['sw.js']}${ROUTE}`
    }

    it('a face whose letters are not Spanish is fetched when a page needs it and kept then, never precached', () => {
      expect(precacheProblems(build(withExt))).toEqual([])
      const held = build((f) => {
        withExt(f)
        f['sw.js'] = f['sw.js']!.replace('{url:"push-sw.js"', '{url:"assets/font-ext-d4.woff2",revision:"r"},{url:"push-sw.js"')
      })
      expect(precacheProblems(held)).toEqual(['assets/font-ext-d4.woff2 is precached, but its letters are not Spanish: the browser asks for it only when a page needs one'])
    })

    it('left out with no rule to keep it once used, or missing from the build, it is named', () => {
      const unkept = build((f) => {
        withExt(f)
        f['sw.js'] = f['sw.js']!.replace(ROUTE, '')
      })
      expect(precacheProblems(unkept)).toEqual(['the worker keeps no font it loads on demand: a face left out of the precache must be cached when used'])
      const missing = build((f) => {
        withExt(f)
        delete f['assets/font-ext-d4.woff2']
      })
      expect(precacheProblems(missing)).toEqual([`assets/font-ext-d4.woff2 is a font the styles name but not in ${missing}`])
    })

    it('the Latin face is still needed, its range or not', () => {
      const d = build((f) => {
        withExt(f)
        f['sw.js'] = f['sw.js']!.replace('{url:"assets/font-c3.woff2",revision:"r"},', '')
      })
      expect(precacheProblems(d)).toEqual(['assets/font-c3.woff2 is not precached (assets/index-b2.css uses it)'])
    })

    it('a 512 px icon ships and is not precached: only the install reads it', () => {
      const with512 = (f: Record<string, string>) => {
        f['manifest.webmanifest'] = JSON.stringify({ icons: [{ src: '/icons/icon-192.png?v=abc', sizes: '192x192' }, { src: '/icons/icon-512.png?v=def', sizes: '512x512' }] })
        f['icons/icon-512.png'] = 'png'
      }
      expect(precacheProblems(build(with512))).toEqual([])
      const held = build((f) => {
        with512(f)
        f['sw.js'] = f['sw.js']!.replace('{url:"push-sw.js"', '{url:"icons/icon-512.png",revision:"r"},{url:"push-sw.js"')
      })
      expect(precacheProblems(held)).toEqual(['icons/icon-512.png is precached, but only the install reads it'])
      const missing = build((f) => {
        with512(f)
        delete f['icons/icon-512.png']
      })
      expect(precacheProblems(missing)).toEqual([`icons/icon-512.png is an icon the manifest names but not in ${missing}`])
    })
  })

  it('no build at all says so', () => {
    expect(precacheProblems(join(tmpdir(), 'no-such-build'))).toEqual([`${join(tmpdir(), 'no-such-build')}/sw.js is missing: build first`])
  })
})
