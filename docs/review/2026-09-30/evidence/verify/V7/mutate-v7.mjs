// V7's own mutation runner: one exact-string replacement per mutant in V7's
// scratch copy of the repo (never the repo itself), full vitest suite, restore.
// Usage: node mutate-v7.mjs V10,V11,...
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const V = new URL('.', import.meta.url).pathname
const REPO = V + 'repo/'
const OUT = V + 'mutation-results-v7.jsonl'

import { MUTANTS } from './mutants-v7.mjs'

const ids = (process.argv[2] ?? Object.keys(MUTANTS).join(',')).split(',')
for (const id of ids) {
  const m = MUTANTS[id]
  if (!m) throw new Error(`unknown mutant ${id}`)
  const path = REPO + m.file
  const orig = readFileSync(path, 'utf8')
  const h0 = createHash('sha256').update(orig).digest('hex')
  const count = orig.split(m.find).length - 1
  if (count !== 1) throw new Error(`${id}: find string matched ${count} times`)
  writeFileSync(path, orig.replace(m.find, m.replace))
  const t0 = Date.now()
  let r
  try {
    r = spawnSync('npx', ['vitest', 'run', '--config', 'vitest.v7.config.ts', '--reporter=dot'], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 << 20 })
  } finally {
    writeFileSync(path, orig)
  }
  const h1 = createHash('sha256').update(readFileSync(path, 'utf8')).digest('hex')
  if (h0 !== h1) throw new Error(`${id}: restore failed`)
  const out = (r.stdout ?? '') + (r.stderr ?? '')
  const files = out.match(/Test Files\s+([^\n]+)/)?.[1]?.trim()
  const tests = out.match(/\n\s+Tests\s+([^\n]+)/)?.[1]?.trim()
  const failing = [...out.matchAll(/FAIL\s+(\S+\.test\.tsx?)\s+>\s+([^\n]+)/g)].map((x) => `${x[1]} > ${x[2].trim()}`)
  const res = { id, what: m.what, file: m.file, exit: r.status, verdict: r.status === 0 ? 'SURVIVED' : 'KILLED', files, tests, failing: [...new Set(failing)].slice(0, 10), seconds: Math.round((Date.now() - t0) / 1000) }
  appendFileSync(OUT, JSON.stringify(res) + '\n')
  writeFileSync(V + `mut-${id}.log`, out)
  console.log(`${id} ${res.verdict} (exit ${r.status}) files: ${files} tests: ${tests} ${res.failing.length ? '| ' + res.failing.join(' ; ') : ''}`)
}
