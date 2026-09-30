#!/usr/bin/env node
// Render the curated findings as the report's "Findings by area" section.
// P0/P1: every field in full (evidence items clipped at 700 chars). P2/P3: compact (first 4 evidence items);
// the complete record of every finding is in findings.json.
//   node render-findings.mjs <findings.json> <out.md>
import { readFileSync, writeFileSync } from 'node:fs'

const [, , inFile, outFile] = process.argv
const findings = JSON.parse(readFileSync(inFile, 'utf8'))
const AREAS = [
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
const sevRank = { P0: 0, P1: 1, P2: 2, P3: 3 }
const EFFORT = { S: 'S (under 2 h)', M: 'M (under a day)', L: 'L (multi-day)' }
const one = (s, n) => {
  s = String(s ?? '').replace(/\s+/g, ' ').trim()
  return n && s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s
}

let md = ''
AREAS.forEach((area, i) => {
  const list = findings.filter((f) => f.area === area).sort((a, b) => sevRank[a.severity] - sevRank[b.severity] || a.id.localeCompare(b.id, 'en', { numeric: true }))
  const counts = ['P0', 'P1', 'P2', 'P3'].map((s) => `${list.filter((f) => f.severity === s).length} ${s}`).join(' · ')
  md += `\n### 6.${i + 1} ${area}\n\n${list.length} findings: ${counts}.\n`
  for (const f of list) {
    const major = f.severity === 'P0' || f.severity === 'P1'
    const ev = (Array.isArray(f.evidence) ? f.evidence : [f.evidence]).filter(Boolean)
    const shown = major ? ev.slice(0, 4) : ev.slice(0, 1)
    md += `\n#### ${f.id}: ${one(f.title)}\n\n`
    md += `**${f.severity}** · ${f.verdict} · ${one(f.status, 140)} · Effort ${EFFORT[f.effort] ?? f.effort}${f.scope ? ` · Scope: ${f.scope}` : ''}${f.merged_from?.length ? ` · Merged: ${f.merged_from.join(', ')}` : ''}\n\n`
    md += `- **Evidence:**\n${shown.map((e) => `  - ${one(e, major ? 350 : 160)}`).join('\n')}\n`
    if (ev.length > shown.length) md += `  - …${ev.length - shown.length} more in \`findings.json\`\n`
    if (major && f.verification) md += `- **Verification:** ${one(f.verification, 550)}\n`
    if (f.chair_note) md += `- **Chair:** ${one(f.chair_note)}\n`
    md += `- **Impact:** ${one(f.impact, major ? 600 : 170)}\n`
    md += `- **Recommendation:** ${one(f.recommendation, major ? 600 : 190)}\n`
  }
})
writeFileSync(outFile, md)
console.log(`rendered ${findings.length} findings → ${outFile} (${(Buffer.byteLength(md) / 1024).toFixed(0)} KB)`)
