#!/usr/bin/env node
// Render the status of every earlier finding (HIST's table plus the chair's overrides) as a compact appendix.
//   node render-history.mjs <out.md>   -> also prints the recount per source
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const S = path.resolve(new URL('..', import.meta.url).pathname)
const items = JSON.parse(readFileSync(path.join(S, 'history', 'status.json'), 'utf8'))
const overrides = JSON.parse(readFileSync(path.join(S, 'history-overrides.json'), 'utf8'))
const clip = (s, n) => {
  s = String(Array.isArray(s) ? s.join('; ') : s ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim()
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s
}
const rows = items.map((x) => {
  const o = overrides[x.id]
  return { ...x, status: o?.status ?? x.status, note: o ? o.note : x.note, overridden: Boolean(o) }
})
const SOURCES = [...new Set(rows.map((r) => r.source))]
const ORDER = ['regressed', 'still open', 'partly fixed', 'fixed', 'obsolete']
let md = ''
const counts = {}
for (const src of SOURCES) {
  const list = rows.filter((r) => r.source === src && !r.duplicate_of)
  counts[src] = Object.fromEntries(ORDER.map((s) => [s, list.filter((r) => r.status === s).length]))
  md += `\n#### ${src}\n\n`
  md += `${list.length} items: ${ORDER.map((s) => `${counts[src][s]} ${s}`).join(', ')}.\n\n`
  md += '| ID | Sev. | Status | Finding | Evidence at HEAD |\n|---|---|---|---|---|\n'
  for (const r of list.sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status))) {
    const detailed = r.status !== 'fixed' && r.status !== 'obsolete'
    const ev = r.overridden ? r.note : detailed ? `${clip(r.evidence, 200)}${r.note ? ` — ${clip(r.note, 100)}` : ''}` : clip(r.evidence, 50)
    md += `| ${r.id} | ${r.original_severity ?? '—'} | ${r.overridden ? `**${r.status}** (chair)` : r.status} | ${clip(r.description, detailed ? 150 : 70)} | ${ev} |\n`
  }
}
writeFileSync(process.argv[2], md)
const total = Object.fromEntries(ORDER.map((s) => [s, Object.values(counts).reduce((n, c) => n + c[s], 0)]))
console.log(JSON.stringify(counts, null, 1))
console.log('TOTAL', JSON.stringify(total), `${(md.length / 1024).toFixed(0)} KB`)
