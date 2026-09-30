#!/usr/bin/env node
// Merge every panelist's findings into one list, normalized, with a compact index.
//   node merge-findings.mjs            -> $S/merged/all.json + $S/merged/index.tsv
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const S = path.resolve(new URL('..', import.meta.url).pathname)
const panelDir = path.join(S, 'panel')
const outDir = path.join(S, 'merged')
mkdirSync(outDir, { recursive: true })

export const AREAS = [
  'Correctness of rules and money',
  'Security and privacy',
  'Reliability, offline and realtime',
  'Architecture and code quality',
  'Data layer and database',
  'Performance',
  'Testing and delivery',
  'Visual design and brand',
  'Interaction design and core flows',
  'Accessibility',
  'Copy and voice (es-MX)',
  'Mobile and PWA experience',
  'Product coherence and strategy',
]
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z]/g, '')
const AREA_BY_NORM = Object.fromEntries(AREAS.map((a) => [norm(a), a]))
function fixArea(a) {
  const n = norm(a)
  if (AREA_BY_NORM[n]) return AREA_BY_NORM[n]
  const hit = AREAS.find((x) => n && (norm(x).startsWith(n.slice(0, 10)) || n.startsWith(norm(x).slice(0, 10))))
  return hit ?? `UNKNOWN(${a})`
}

const all = []
const problems = []
for (const f of readdirSync(panelDir).filter((f) => f.endsWith('.findings.json')).sort()) {
  const code = f.replace('.findings.json', '')
  let arr
  try {
    arr = JSON.parse(readFileSync(path.join(panelDir, f), 'utf8'))
  } catch (e) {
    problems.push(`${f}: JSON parse error ${e.message}`)
    continue
  }
  if (!Array.isArray(arr)) arr = arr.findings ?? []
  for (const x of arr) {
    const sev = String(x.severity ?? '').toUpperCase().match(/P[0-3]/)?.[0] ?? 'P?'
    const item = {
      id: x.id,
      panelist: code,
      title: x.title,
      severity: sev,
      verdict: String(x.verdict ?? 'PLAUSIBLE').toUpperCase(),
      area: fixArea(x.area),
      status: x.status ?? 'new',
      evidence: Array.isArray(x.evidence) ? x.evidence : [String(x.evidence ?? '')],
      impact: x.impact ?? '',
      recommendation: x.recommendation ?? '',
      effort: String(x.effort ?? '').toUpperCase().match(/[SML]/)?.[0] ?? '?',
      repro: x.repro ?? '',
    }
    if (!item.id || !item.title) problems.push(`${f}: item without id/title`)
    if (item.area.startsWith('UNKNOWN')) problems.push(`${item.id}: ${item.area}`)
    all.push(item)
  }
}
const ids = new Map()
for (const x of all) ids.set(x.id, (ids.get(x.id) ?? 0) + 1)
for (const [id, n] of ids) if (n > 1) problems.push(`duplicate id ${id} ×${n}`)

writeFileSync(path.join(outDir, 'all.json'), JSON.stringify(all, null, 2))
const sevRank = { P0: 0, P1: 1, P2: 2, P3: 3, 'P?': 4 }
const lines = [...all]
  .sort((a, b) => AREAS.indexOf(a.area) - AREAS.indexOf(b.area) || sevRank[a.severity] - sevRank[b.severity] || a.id.localeCompare(b.id))
  .map((x) => [x.id, x.severity, x.verdict[0], x.area.split(' ')[0], x.title].join('\t'))
writeFileSync(path.join(outDir, 'index.tsv'), lines.join('\n') + '\n')

const count = {}
for (const x of all) {
  count[x.panelist] ??= { P0: 0, P1: 0, P2: 0, P3: 0, 'P?': 0 }
  count[x.panelist][x.severity]++
}
console.log('findings:', all.length)
console.table(count)
if (problems.length) console.log('problems:\n  ' + problems.join('\n  '))
