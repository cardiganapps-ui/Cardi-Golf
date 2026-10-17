#!/usr/bin/env node
/**
 * What the service worker keeps for a phone with no signal (QA-16, §8). The app opens offline only if the
 * precache holds index.html and everything it loads, every font face Spanish text is set in, the manifest and
 * its icons, and the push handler at the fingerprint the worker imports it by. Shipped and never precached: the
 * iPhone launch images index.html links and the manifest's screenshots (PWA-14), its 512 px icons and the font
 * subsets for letters Spanish never writes, which the worker keeps once a page has used one (PERF-05). Read from a built
 * dist/ after `vite build` (`npm run build` runs it); the total stays under PRECACHE_BUDGET_KIB.
 *   node scripts/check-precache.mjs [dist]
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * KiB the precache may hold. The production build held 2,930 on 2026-10-16, before PERF-05 left out the font
 * subsets Spanish never uses and the install's 512 px icons; 2,716 after. Every screen stays precached (a
 * screen left out would 404 after a deploy on a phone still on the old build, whose update waits for
 * «Actualizar»), so splitting the routes (PERF-02) moved bytes between files, not out of the precache.
 */
export const PRECACHE_BUDGET_KIB = 2880

/** The URLs the built worker precaches (`precacheAndRoute([{url, revision}, …])`), each once. */
export function precached(sw) {
  return [...new Set([...sw.matchAll(/\{url:"([^"]+)",revision:/g)].map((m) => m[1]))]
}

/** The first ten hex digits of a file's sha256: the fingerprint vite.config.ts gives it (`versioned`). */
function fingerprint(bytes) {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 10)
}

/** Hex code points of a unicode-range token (`U+0000-00FF`, `U+4??`, `U+20AC`): its first and last. */
function codeRange(token) {
  const m = /^U\+([0-9A-F?]+)(?:-([0-9A-F]+))?$/i.exec(token.trim())
  if (!m) return null
  const lo = parseInt(m[1].replace(/\?/g, '0'), 16)
  const hi = m[2] ? parseInt(m[2], 16) : parseInt(m[1].replace(/\?/g, 'F'), 16)
  return [lo, hi]
}

/** Each @font-face of a stylesheet: its woff2 files, and whether it sets Latin letters (no range, or one with «a»). */
export function fontFaces(css) {
  return [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, body]) => {
    const urls = [...body.matchAll(/url\(["']?\/?(assets\/[^)"'?#]+\.woff2)/g)].map((m) => m[1])
    const range = /unicode-range\s*:\s*([^;}]+)/i.exec(body)?.[1]
    const latin =
      !range ||
      range.split(',').some((token) => {
        const r = codeRange(token)
        return !!r && r[0] <= 0x61 && 0x61 <= r[1]
      })
    return { urls, latin }
  })
}

/** An icon only the install reads (PERF-05): 512 px or larger. */
function installOnly(icon) {
  return String(icon.sizes ?? '')
    .split(/\s+/)
    .some((size) => Number(size.split('x')[0]) >= 512)
}

/** What is wrong with the precache of the build in `dir`: nothing, when the list is empty. */
export function precacheProblems(dir, budgetKib = PRECACHE_BUDGET_KIB) {
  if (!existsSync(join(dir, 'sw.js'))) return [`${dir}/sw.js is missing: build first`]
  const read = (path) => readFileSync(join(dir, path), 'utf8')
  const sw = read('sw.js')
  const urls = precached(sw)
  const held = new Set(urls.map((u) => u.split('?')[0]))
  const problems = []
  const need = (path, why) => {
    if (!held.has(path)) problems.push(`${path} is not precached (${why})`)
  }

  need('index.html', 'every route opens it')
  const html = read('index.html')
  // The iPhone launch images (PWA-14): iOS reads them when the app is added to the home screen, never through
  // the worker. The build must ship them, and the precache must not carry them: every phone would keep a dozen
  // screens' worth for nothing.
  const launch = new Set(
    [...html.matchAll(/<link\b[^>]*\brel="apple-touch-startup-image"[^>]*>/g)]
      .map((m) => /\bhref="\/([^"?#]+)/.exec(m[0])?.[1])
      .filter(Boolean),
  )
  for (const m of html.matchAll(/(?:src|href)="\/([^"?#]+\.(?:js|css|svg|png|webmanifest|woff2))/g))
    if (!launch.has(m[1])) need(m[1], 'index.html loads it')
  for (const path of launch) {
    if (!existsSync(join(dir, path))) problems.push(`${path} is linked as a launch image but not in ${dir}`)
    if (held.has(path))
      problems.push(`${path} is precached, but iOS reads launch images only when the app is added to the home screen`)
  }
  // Fonts (PERF-05): every face Spanish text is set in is precached. A face whose unicode-range leaves out the
  // Latin letters (the Vietnamese and Latin Extended subsets) is fetched only when a page needs one of its
  // letters: it ships, the worker keeps it once used (a runtime rule for woff2), and the precache does not.
  const onDemand = new Set()
  for (const css of existsSync(join(dir, 'assets'))
    ? readdirSync(join(dir, 'assets')).filter((f) => f.endsWith('.css'))
    : []) {
    for (const face of fontFaces(read(`assets/${css}`))) {
      if (face.latin) for (const url of face.urls) need(url, `assets/${css} uses it`)
      else for (const url of face.urls) onDemand.add(url)
    }
  }
  for (const url of onDemand) {
    if (!existsSync(join(dir, url))) problems.push(`${url} is a font the styles name but not in ${dir}`)
    if (held.has(url))
      problems.push(
        `${url} is precached, but its letters are not Spanish: the browser asks for it only when a page needs one`,
      )
  }
  if (onDemand.size && !/registerRoute\([^;]*woff2/.test(sw))
    problems.push(
      'the worker keeps no font it loads on demand: a face left out of the precache must be cached when used',
    )
  need('manifest.webmanifest', 'the installed app reads it')
  if (existsSync(join(dir, 'manifest.webmanifest'))) {
    const manifest = JSON.parse(read('manifest.webmanifest'))
    for (const icon of manifest.icons ?? []) {
      const path = String(icon.src).replace(/^\//, '').split('?')[0]
      // The 512 px icons (PERF-05): Android reads them when the app is added to the home screen, online, and keeps
      // its own copy. Shipped, never precached.
      if (installOnly(icon)) {
        if (!existsSync(join(dir, path))) problems.push(`${path} is an icon the manifest names but not in ${dir}`)
        if (held.has(path)) problems.push(`${path} is precached, but only the install reads it`)
      } else need(path, 'the manifest names it')
    }
    // Its screenshots (PWA-14): Chrome reads them for its install sheet, online. Shipped, never precached.
    for (const shot of manifest.screenshots ?? []) {
      const path = String(shot.src).replace(/^\//, '').split('?')[0]
      if (!existsSync(join(dir, path))) problems.push(`${path} is a screenshot the manifest names but not in ${dir}`)
      if (held.has(path)) problems.push(`${path} is precached, but only the install sheet shows it`)
    }
  }
  need('push-sw.js', 'the worker imports it')
  if (existsSync(join(dir, 'push-sw.js'))) {
    const at = /push-sw\.js\?v=([0-9a-f]+)/.exec(sw)?.[1]
    const now = fingerprint(readFileSync(join(dir, 'push-sw.js')))
    if (at !== now)
      problems.push(
        `the worker imports push-sw.js at ${at ? `?v=${at}` : 'no fingerprint'}, but the file's is ${now}: phones would keep the old handler`,
      )
    // The images a notice shows (its icon, Android's badge): with patchy signal, the push may be all that arrives.
    for (const m of read('push-sw.js').matchAll(/['"]\/([^'"?#]+\.png)['"]/g)) need(m[1], 'a notice shows it')
  }

  let bytes = 0
  for (const url of urls) {
    const path = join(dir, url.split('?')[0])
    if (existsSync(path)) bytes += statSync(path).size
    else problems.push(`${url} is precached but not in ${dir}`)
  }
  const kib = Math.round(bytes / 1024)
  if (kib > budgetKib) problems.push(`the precache is ${kib} KiB, over its budget of ${budgetKib} KiB`)
  return problems
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dir = process.argv[2] ?? 'dist'
  const problems = precacheProblems(dir)
  if (problems.length) {
    console.error(`✗ precache of ${dir}:\n${problems.map((p) => `  - ${p}`).join('\n')}`)
    process.exit(1)
  }
  const urls = precached(readFileSync(join(dir, 'sw.js'), 'utf8'))
  const kib = Math.round(urls.reduce((n, u) => n + statSync(join(dir, u.split('?')[0])).size, 0) / 1024)
  console.log(`✓ precache of ${dir}: ${urls.length} files, ${kib} KiB of ${PRECACHE_BUDGET_KIB}`)
}
