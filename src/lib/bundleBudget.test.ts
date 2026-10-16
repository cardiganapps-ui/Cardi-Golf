/**
 * QA-15: the first load's JavaScript has a budget. `npm run build` runs scripts/check-bundle.mjs on the real
 * build; here, the checker itself, on builds made to pass and to fail it.
 */
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ENTRY_BUDGET_GZIP_KIB, entryReport, entryScripts } from '../../scripts/check-bundle.mjs'

const made: string[] = []
function build(files: Record<string, string | Buffer>) {
  const dir = mkdtempSync(join(tmpdir(), 'bundle-'))
  made.push(dir)
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true })
    writeFileSync(join(dir, path), body)
  }
  return dir
}
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const HTML = '<script type="module" crossorigin src="/assets/index-a1.js"></script><link rel="modulepreload" crossorigin href="/assets/vendor-b2.js"><link rel="stylesheet" href="/assets/index.css">'

describe('the first load’s budget (QA-15)', () => {
  it('counts the entry script and what index.html preloads, nothing else', () => {
    expect(entryScripts(HTML)).toEqual(['assets/index-a1.js', 'assets/vendor-b2.js'])
  })

  it('a small build passes, gzipped as a server sends it', () => {
    const dir = build({ 'index.html': HTML, 'assets/index-a1.js': 'console.log(1)'.repeat(1000), 'assets/vendor-b2.js': 'x', 'assets/lazy-c3.js': randomBytes(400_000) })
    const r = entryReport(dir)
    expect(r.problems).toEqual([])
    expect(r.files.map((f) => f.path)).toEqual(['assets/index-a1.js', 'assets/vendor-b2.js'])
    expect(r.kib).toBeLessThan(2)
  })

  it('an entry over the budget fails, naming each script and its weight', () => {
    // Random bytes don't compress: what goes in is what a phone downloads.
    const dir = build({ 'index.html': HTML, 'assets/index-a1.js': randomBytes((ENTRY_BUDGET_GZIP_KIB + 10) * 1024), 'assets/vendor-b2.js': 'x' })
    const r = entryReport(dir)
    expect(r.problems).toHaveLength(1)
    expect(r.problems[0]).toMatch(new RegExp(`over its budget of ${ENTRY_BUDGET_GZIP_KIB} KiB: assets/index-a1.js \\d+, assets/vendor-b2.js 0`))
  })

  it('a script index.html loads that the build lacks, or none at all, is a problem', () => {
    expect(entryReport(build({ 'index.html': HTML, 'assets/index-a1.js': '1' })).problems).toEqual([expect.stringContaining('assets/vendor-b2.js is loaded by index.html but not in')])
    expect(entryReport(build({ 'index.html': '<p>nada</p>' })).problems).toEqual(['index.html loads no module script'])
  })
})
