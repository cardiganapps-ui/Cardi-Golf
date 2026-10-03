#!/usr/bin/env node
// Burn-down of the 2026-09-30 review findings, read from docs/quality/ledger.json.
//   npm run quality            -> summary by gate, severity, area and workstream
//   npm run quality -- --open  -> also list every open finding, grouped by phase
import { readFileSync } from 'node:fs'

const ledger = JSON.parse(readFileSync(new URL('../../docs/quality/ledger.json', import.meta.url), 'utf8'))
const rows = ledger.findings
const SEV = ['P0', 'P1', 'P2', 'P3']
const closed = (r) => r.status === 'fixed' || r.status === 'verified' || r.status === 'waived'
const open = rows.filter((r) => !closed(r))

const pad = (s, n) => String(s).padEnd(n)
const count = (list, pred) => list.filter(pred).length

console.log(`Polo quality ledger (${rows.length} findings, updated ${ledger.updated})\n`)
console.log(
  `Status: ${['open', 'fixed', 'verified', 'waived'].map((s) => `${s} ${count(rows, (r) => r.status === s)}`).join(' · ')}\n`,
)

const gates = [
  ['G1', 'every P0 closed', open.filter((r) => r.severity === 'P0').length],
  ['G2', 'every P1 closed', open.filter((r) => r.severity === 'P1').length],
  ['G3', 'everything closed or waived', open.length],
]
for (const [g, what, left] of gates) console.log(`${g}  ${pad(what, 30)} ${left === 0 ? 'met' : `${left} open`}`)

console.log('\nOpen by severity: ' + SEV.map((s) => `${s} ${count(open, (r) => r.severity === s)}`).join(' · '))

console.log('\nBy area (open P0/P1/P2/P3; an open P0 caps the area at 69)')
const areas = [...new Set(rows.map((r) => r.area))].sort()
for (const a of areas) {
  const list = open.filter((r) => r.area === a)
  const cap = list.some((r) => r.severity === 'P0') ? '  capped at 69' : ''
  console.log(`  ${pad(a, 36)} ${SEV.map((s) => count(list, (r) => r.severity === s)).join('/')}${cap}`)
}

console.log('\nBy workstream (open of total)')
for (const [w, name] of Object.entries(ledger.workstreams)) {
  const all = rows.filter((r) => r.workstream === w)
  console.log(`  ${pad(w, 4)} ${pad(name, 70)} ${count(all, (r) => !closed(r))}/${all.length}`)
}

const found = ledger.found ?? []
const foundOpen = found.filter((r) => !closed(r))
console.log(`\nFound since the review: ${found.length} (${foundOpen.length} open: ${SEV.map((s) => `${s} ${count(foundOpen, (r) => r.severity === s)}`).join(' · ')})`)
for (const r of foundOpen) console.log(`  ${pad(r.id, 9)} ${r.severity} ${pad(r.workstream, 4)} ${r.pr ? `#${r.pr} ` : ''}${r.title.slice(0, 96)}`)

if (process.argv.includes('--open')) {
  for (const p of [0, 1, 2, 3]) {
    const list = open.filter((r) => r.phase === p)
    if (!list.length) continue
    console.log(`\nPhase ${p}: ${list.length} open`)
    for (const r of list) console.log(`  ${pad(r.id, 9)} ${r.severity} ${pad(r.workstream, 4)} ${r.title.slice(0, 100)}`)
  }
}
