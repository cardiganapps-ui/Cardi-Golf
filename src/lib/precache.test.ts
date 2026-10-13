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

  it('a file listed but missing, and a precache over its budget, are refused', () => {
    const d = build((f) => void delete f['assets/index-a1.js'])
    expect(precacheProblems(d)).toEqual([`assets/index-a1.js is precached but not in ${d}`])
    const big = build((f) => void (f['assets/index-a1.js'] = 'x'.repeat(3 * 1024)))
    expect(precacheProblems(big, 2)).toEqual(['the precache is 3 KiB, over its budget of 2 KiB'])
  })

  it('no build at all says so', () => {
    expect(precacheProblems(join(tmpdir(), 'no-such-build'))).toEqual([`${join(tmpdir(), 'no-such-build')}/sw.js is missing: build first`])
  })
})
