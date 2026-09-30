// V7 tripwires: apply several edits at once in V7's scratch copy, run the full
// suite, restore every file (sha256-checked). A tripwire is a `throw` placed
// where code would run: if the suite stays green, no test ever executes it.
// Usage: node tripwire.mjs <SET>
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const V = new URL('.', import.meta.url).pathname
const REPO = V + 'repo/'
const trip = (tag) => `throw new Error('V7 tripwire: ${tag}')`

const SETS = {
  // QA-06: outbox functions that the tests never execute
  OUTBOX_FUNCS: [
    { file: 'src/data/outbox.ts', find: 'export function overlayPending(s: Snapshot): void {\n', replace: `export function overlayPending(s: Snapshot): void {\n  ${trip('overlayPending')}\n` },
    { file: 'src/data/outbox.ts', find: 'async function push(item: OutboxItem): Promise<void> {\n', replace: `async function push(item: OutboxItem): Promise<void> {\n  ${trip('real push')}\n` },
    { file: 'src/data/outbox.ts', find: 'if (!db) db = new OutboxDb()', replace: `if (!db) ${trip('Dexie OutboxDb opened')}` },
    { file: 'src/data/outbox.ts', find: 'async function loadQueue() {\n', replace: `async function loadQueue() {\n  ${trip('loadQueue')}\n` },
    { file: 'src/data/outbox.ts', find: '  timer = setTimeout(() => {\n    timer = null\n', replace: `  timer = setTimeout(() => {\n    ${trip('backoff timer fired')}\n    timer = null\n` },
  ],
  // Positive control for the tripwire method: flush() IS executed by outbox.test.ts, so this must fail.
  CONTROL_FLUSH: [
    { file: 'src/data/outbox.ts', find: 'export async function flush(): Promise<void> {\n', replace: `export async function flush(): Promise<void> {\n  ${trip('flush')}\n` },
  ],
  // QA-07: data-layer modules that no test ever loads (module evaluation throws)
  DATA_MODULES: ['tournamentStore.ts', 'mappers.ts', 'api.ts', 'snapshotCache.ts', 'paged.ts', 'backup.ts', 'session.ts'].map((f) => ({ file: `src/data/${f}`, append: `\n${trip(f + ' loaded')}\n` })),
  // Positive control: outbox.ts IS loaded by outbox.test.ts, so a module-level tripwire there must fail.
  CONTROL_MODULE: [{ file: 'src/data/outbox.ts', append: `\n${trip('outbox.ts loaded')}\n` }],
}

const set = process.argv[2]
const edits = SETS[set]
if (!edits) throw new Error('unknown set')
const originals = new Map()
for (const e of edits) {
  const path = REPO + e.file
  if (!originals.has(path)) originals.set(path, readFileSync(path, 'utf8'))
}
const cur = new Map(originals)
try {
  for (const e of edits) {
    const path = REPO + e.file
    let s = cur.get(path)
    if (e.append) s = s + e.append
    else {
      const n = s.split(e.find).length - 1
      if (n !== 1) throw new Error(`${e.file}: find matched ${n} times: ${e.find.slice(0, 60)}`)
      s = s.replace(e.find, e.replace)
    }
    cur.set(path, s)
  }
  for (const [p, s] of cur) writeFileSync(p, s)
  const r = spawnSync('npx', ['vitest', 'run', '--config', 'vitest.v7.config.ts', '--reporter=dot'], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 << 20 })
  const out = (r.stdout ?? '') + (r.stderr ?? '')
  writeFileSync(V + `trip-${set}.log`, out)
  const files = out.match(/Test Files\s+([^\n]+)/)?.[1]?.trim()
  const tests = out.match(/\n\s+Tests\s+([^\n]+)/)?.[1]?.trim()
  const tripped = [...new Set([...out.matchAll(/V7 tripwire: ([^'"\n]+)/g)].map((x) => x[1]))]
  const failedFiles = [...new Set([...out.matchAll(/FAIL\s+(\S+\.test\.tsx?)/g)].map((x) => x[1]))]
  const unhandled = /Unhandled Error|Unhandled Rejection/.test(out)
  const res = { set, exit: r.status, verdict: r.status === 0 ? 'NEVER EXECUTED BY ANY TEST' : 'EXECUTED (suite failed)', files, tests, tripped, failedFiles, unhandled }
  appendFileSync(V + 'tripwire-results.jsonl', JSON.stringify(res) + '\n')
  console.log(JSON.stringify(res))
} finally {
  for (const [p, s] of originals) writeFileSync(p, s)
  for (const [p, s] of originals) {
    if (createHash('sha256').update(readFileSync(p, 'utf8')).digest('hex') !== createHash('sha256').update(s).digest('hex')) throw new Error('restore failed ' + p)
  }
}
