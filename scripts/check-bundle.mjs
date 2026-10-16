#!/usr/bin/env node
/**
 * What a first visit downloads before the app can draw (QA-15, PERF-06): the JavaScript index.html loads, its
 * entry script and the chunks it preloads, gzipped as a server sends them. The build passed whatever it weighed
 * (the review measured a 1,069 kB entry and Rollup's warning on every green build); the precache's budget
 * (check-precache.mjs) holds what a phone keeps, this holds what it waits for. `npm run build` runs it after the
 * precache's check, so the preflight, CI's `check` and the Vercel deploy refuse a build over it.
 *   node scripts/check-bundle.mjs [dist]
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

/**
 * KiB, gzipped, of the JavaScript a first load waits for. The production build held 395 on 2026-10-16, after
 * PRs 219–223 (`vite build` with CI's placeholder Supabase env: the entry and Rolldown's runtime; gzip level 6);
 * the budget is that and a margin of about 5 %. Raise it only with the reason, in the change that needs it,
 * never to pass.
 */
export const ENTRY_BUDGET_GZIP_KIB = 415

/** The scripts index.html makes the browser fetch before the app runs: its module entry and what it preloads. */
export function entryScripts(html) {
  const out = new Set()
  for (const m of html.matchAll(/<script\b[^>]*\btype="module"[^>]*\bsrc="\/([^"?#]+\.js)"/g)) out.add(m[1])
  for (const m of html.matchAll(/<link\b[^>]*\brel="modulepreload"[^>]*\bhref="\/([^"?#]+\.js)"/g)) out.add(m[1])
  return [...out]
}

/** Each entry script with its gzipped size in bytes, and what is wrong: nothing, when `problems` is empty. */
export function entryReport(dir, budgetKib = ENTRY_BUDGET_GZIP_KIB) {
  const problems = []
  if (!existsSync(join(dir, 'index.html'))) return { files: [], kib: 0, problems: [`${dir}/index.html is missing: build first`] }
  const files = entryScripts(readFileSync(join(dir, 'index.html'), 'utf8')).map((path) => {
    if (!existsSync(join(dir, path))) {
      problems.push(`${path} is loaded by index.html but not in ${dir}`)
      return { path, gzip: 0 }
    }
    return { path, gzip: gzipSync(readFileSync(join(dir, path)), { level: 6 }).length }
  })
  if (!files.length) problems.push('index.html loads no module script')
  const kib = Math.round(files.reduce((n, f) => n + f.gzip, 0) / 1024)
  if (kib > budgetKib) problems.push(`the first load's JavaScript is ${kib} KiB gzipped, over its budget of ${budgetKib} KiB: ${files.map((f) => `${f.path} ${Math.round(f.gzip / 1024)}`).join(', ')}`)
  return { files, kib, problems }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dir = process.argv[2] ?? 'dist'
  const { files, kib, problems } = entryReport(dir)
  if (problems.length) {
    console.error(`✗ first load of ${dir}:\n${problems.map((p) => `  - ${p}`).join('\n')}`)
    process.exit(1)
  }
  console.log(`✓ first load of ${dir}: ${files.length} scripts, ${kib} KiB gzipped of ${ENTRY_BUDGET_GZIP_KIB}`)
}
