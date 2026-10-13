#!/usr/bin/env node
/**
 * What the service worker keeps for a phone with no signal (QA-16, §8). The app opens offline only if the
 * precache holds index.html and everything it loads, every font the styles use, the manifest and its icons,
 * and the push handler at the fingerprint the worker imports it by. Read from a built dist/ after
 * `vite build` (`npm run build` runs it); the total stays under PRECACHE_BUDGET_KIB.
 *   node scripts/check-precache.mjs [dist]
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** KiB the precache may hold: 2,871 on 2026-10-13. Splitting the routes (PERF-01 to 05) lowers both. */
export const PRECACHE_BUDGET_KIB = 3072

/** The URLs the built worker precaches (`precacheAndRoute([{url, revision}, …])`), each once. */
export function precached(sw) {
  return [...new Set([...sw.matchAll(/\{url:"([^"]+)",revision:/g)].map((m) => m[1]))]
}

/** The first ten hex digits of a file's sha256: the fingerprint vite.config.ts gives it (`versioned`). */
function fingerprint(bytes) {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 10)
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
  for (const m of read('index.html').matchAll(/(?:src|href)="\/([^"?#]+\.(?:js|css|svg|png|webmanifest|woff2))/g)) need(m[1], 'index.html loads it')
  for (const css of existsSync(join(dir, 'assets')) ? readdirSync(join(dir, 'assets')).filter((f) => f.endsWith('.css')) : []) {
    for (const m of read(`assets/${css}`).matchAll(/url\(["']?\/?(assets\/[^)"'?#]+\.woff2)/g)) need(m[1], `assets/${css} uses it`)
  }
  need('manifest.webmanifest', 'the installed app reads it')
  if (existsSync(join(dir, 'manifest.webmanifest'))) {
    for (const icon of JSON.parse(read('manifest.webmanifest')).icons ?? []) need(String(icon.src).replace(/^\//, '').split('?')[0], 'the manifest names it')
  }
  need('push-sw.js', 'the worker imports it')
  if (existsSync(join(dir, 'push-sw.js'))) {
    const at = /push-sw\.js\?v=([0-9a-f]+)/.exec(sw)?.[1]
    const now = fingerprint(readFileSync(join(dir, 'push-sw.js')))
    if (at !== now) problems.push(`the worker imports push-sw.js at ${at ? `?v=${at}` : 'no fingerprint'}, but the file's is ${now}: phones would keep the old handler`)
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
