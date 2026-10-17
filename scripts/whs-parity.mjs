#!/usr/bin/env node
// The Polo index's arithmetic, SQL against the shared cases (ARCH-16).
//
// src/engine/profile/cases/whs.json holds the WHS cases both readings must
// give to the digit: whs.test.ts runs them against the TS (the profile's
// breakdown, the engine's course handicap and strokes received), and this
// script runs them against the SQL functions of migration 0015 that compute
// every round's results and every profile's index (whs_diff10,
// whs_course_hcp, whs_strokes, whs_index10). It used to run only inside
// scripts/rls-test.mjs, which needs production's service key, so no check
// saw a one-sided change. scripts/db-test.sh runs it in the db job on the
// freshly migrated database.
//   PGDATABASE=<a migrated database> node scripts/whs-parity.mjs
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const cases = JSON.parse(await readFile(path.join(root, 'src', 'engine', 'profile', 'cases', 'whs.json'), 'utf8'))

const int = (n) => {
  if (!Number.isInteger(n)) throw new Error(`not an integer in cases/whs.json: ${n}`)
  return String(n)
}
/** Each case as one SQL call, with what it must answer (null as SQL's empty). */
const calls = [
  ...cases.diff.map((c) => ({
    what: `whs_diff10(${c.ags}, ${c.rating10}, ${c.slope})`,
    sql: `public.whs_diff10(${int(c.ags)}, ${int(c.rating10)}, ${int(c.slope)})`,
    expect: c.expect10,
  })),
  ...cases.courseHcp.map((c) => ({
    what: `whs_course_hcp(${c.index10}, ${c.slope}, ${c.rating10}, ${c.par})`,
    sql: `public.whs_course_hcp(${int(c.index10)}, ${int(c.slope)}, ${int(c.rating10)}, ${int(c.par)})`,
    expect: c.expect,
  })),
  ...cases.strokes.map((c) => ({
    what: `whs_strokes(${c.ch}, ${c.si})`,
    sql: `public.whs_strokes(${int(c.ch)}, ${int(c.si)})`,
    expect: c.expect,
  })),
  ...cases.index.map((c) => ({
    what: `whs_index10([${c.diffs10.join(', ')}])`,
    sql: `public.whs_index10(array[${c.diffs10.map(int).join(', ')}]::int[])`,
    expect: c.expect10,
  })),
]
if (calls.length < 20) throw new Error(`cases/whs.json holds ${calls.length} cases: expected the whole file`)

const sql = calls.map((c, i) => `select ${i}, coalesce((${c.sql})::text, 'null');`).join('\n')
const r = spawnSync('psql', ['-X', '-q', '-A', '-t', '-F', ' ', '-v', 'ON_ERROR_STOP=1'], {
  input: sql,
  encoding: 'utf8',
})
if (r.error) throw r.error
if (r.status !== 0) {
  console.error((r.stderr || r.stdout).trim())
  process.exit(1)
}
const got = new Map(
  r.stdout
    .trim()
    .split('\n')
    .map((line) => line.split(' '))
    .map(([i, v]) => [Number(i), v]),
)
const off = calls.filter((c, i) => got.get(i) !== String(c.expect))
for (const c of off)
  console.error(`  ✗ ${c.what}: the SQL answers ${got.get(calls.indexOf(c))}, the cases say ${c.expect}`)
if (off.length) {
  console.error(
    `  ✗ ${off.length} of ${calls.length} WHS cases differ between SQL and src/engine/profile/cases/whs.json`,
  )
  process.exit(1)
}
console.log(`  ✓ the SQL WHS functions answer all ${calls.length} shared cases (cases/whs.json)`)
