// Run one probe test file in V7's scratch copy, unmutated and under each given mutant.
// Usage: node probe-run.mjs <test file relative to repo> <MARKER> REAL,V10,...
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { MUTANTS } from './mutants-v7.mjs'

const V = new URL('.', import.meta.url).pathname
const REPO = V + 'repo/'
const [file, marker, list] = process.argv.slice(2)
for (const id of list.split(',')) {
  const m = MUTANTS[id]
  const path = m ? REPO + m.file : null
  const orig = path ? readFileSync(path, 'utf8') : null
  if (m) {
    if (orig.split(m.find).length !== 2) throw new Error(`${id}: find must match once`)
    writeFileSync(path, orig.replace(m.find, m.replace))
  }
  let r
  try {
    r = spawnSync('npx', ['vitest', 'run', '--config', 'vitest.v7.config.ts', file], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 << 20 })
  } finally {
    if (m) writeFileSync(path, orig)
  }
  const out = (r.stdout ?? '') + (r.stderr ?? '')
  const lines = out.split('\n').filter((l) => l.includes(marker)).map((l) => l.slice(l.indexOf(marker) + marker.length + 1))
  console.log(`== ${id}${m ? ' (' + m.what + ')' : ''} exit=${r.status}`)
  for (const l of lines) console.log(l)
  if (!lines.length) console.log(out.split('\n').slice(-30).join('\n'))
}
