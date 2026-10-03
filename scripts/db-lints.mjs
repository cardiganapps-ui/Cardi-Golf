#!/usr/bin/env node
// Supabase's advisors (splinter) against the baseline: a lint whose count went
// up, or a new one, fails the db job; one that went down is reported so the
// baseline can follow it down (DB-16: the baseline only ever shrinks).
//   node scripts/db-lints.mjs <name,level,count csv> <baseline.json> [--write]
import { readFileSync, writeFileSync } from 'node:fs'

const [csv, baselinePath, flag] = process.argv.slice(2)
const now = {}
for (const line of readFileSync(csv, 'utf8').split('\n')) {
  const [name, level, count] = line.trim().split(',')
  if (name) now[`${name} (${level})`] = Number(count)
}
if (flag === '--write') {
  writeFileSync(baselinePath, JSON.stringify(now, null, 2) + '\n')
  console.log(`  baseline written: ${Object.values(now).reduce((a, b) => a + b, 0)} findings in ${Object.keys(now).length} lints`)
  process.exit(0)
}
const base = JSON.parse(readFileSync(baselinePath, 'utf8'))
const worse = Object.entries(now).filter(([k, n]) => n > (base[k] ?? 0))
const better = Object.entries(base).filter(([k, n]) => (now[k] ?? 0) < n)
for (const [k, n] of worse) console.log(`  ✗ ${k}: ${base[k] ?? 0} → ${n}`)
for (const [k, n] of better) console.log(`  ↓ ${k}: ${n} → ${now[k] ?? 0} (lower the baseline: POLO_LINT_WRITE=1 scripts/db-test.sh)`)
if (worse.length) {
  console.log('  New advisor findings: fix them in the migration (or, if one is deliberate, say why in the PR and raise the baseline).')
  process.exit(1)
}
console.log(`  ✓ ${Object.values(now).reduce((a, b) => a + b, 0)} findings, none over the baseline`)
