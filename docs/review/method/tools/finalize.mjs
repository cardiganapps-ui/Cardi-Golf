#!/usr/bin/env node
// Build the curated findings: merge duplicates under their canonical finding, apply the
// independent verification verdicts to every P0/P1, then the chair's overrides.
//   node finalize.mjs   -> $S/final/findings.json, $S/final/refuted.json, $S/final/summary.txt
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

const S = path.resolve(new URL('..', import.meta.url).pathname)
const read = (p) => JSON.parse(readFileSync(path.join(S, p), 'utf8'))
const all = read('merged/all.json')
const byId = new Map(all.map((f) => [f.id, f]))
const sevRank = { P0: 0, P1: 1, P2: 2, P3: 3 }
const maxSev = (a, b) => (sevRank[a] <= sevRank[b] ? a : b)

// Clusters: canonical -> duplicates (P0/P1 from the verification specs, P2/P3 from dedupe-spec).
const clusters = new Map()
const batchOf = new Map()
for (const f of ['verify-spec-1.json', 'verify-spec-2.json', 'verify-spec-3.json']) {
  if (!existsSync(path.join(S, f))) continue
  for (const [batch, groups] of Object.entries(read(f))) {
    for (const [canon, ...dups] of groups) {
      clusters.set(canon, [...(clusters.get(canon) ?? []), ...dups])
      batchOf.set(canon, batch)
    }
  }
}
for (const [canon, dups] of Object.entries(read('dedupe-spec.json'))) clusters.set(canon, [...new Set([...(clusters.get(canon) ?? []), ...dups])])
const dupOf = new Map()
for (const [canon, dups] of clusters) for (const d of dups) {
  if (dupOf.has(d)) throw new Error(`${d} is a duplicate of both ${dupOf.get(d)} and ${canon}`)
  dupOf.set(d, canon)
}

// Verification results.
const verdicts = new Map()
for (const f of readdirSync(path.join(S, 'verify')).filter((f) => f.endsWith('.result.json'))) {
  for (const r of read(`verify/${f}`)) verdicts.set(r.canonical_id, { ...r, batch: f.replace('.result.json', '') })
}
const overrides = existsSync(path.join(S, 'chair-overrides.json')) ? read('chair-overrides.json') : {}

const trunc = (s, n) => {
  s = String(s ?? '').replace(/\s+/g, ' ').trim()
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s
}

const final = []
const refuted = []
const unverified = []
for (const f of all) {
  if (dupOf.has(f.id)) continue
  const dups = (clusters.get(f.id) ?? []).map((d) => byId.get(d)).filter(Boolean)
  let severity = dups.reduce((s, d) => maxSev(s, d.severity), f.severity)
  let verdict = [f, ...dups].some((x) => x.verdict === 'CONFIRMED') ? 'CONFIRMED' : 'PLAUSIBLE'
  let status = f.status
  let scope
  let verification
  const v = verdicts.get(f.id)
  if (v) {
    verdict = v.verdict
    severity = v.severity_recommended
    status = v.status_vs_previous || status
    scope = v.scope
    verification = `Independent verifier ${v.batch}: ${v.verdict}, ${v.severity_recommended}${v.scope ? ` (${v.scope})` : ''}. ${trunc(v.severity_reasoning, 420)} Reproduction: ${trunc(v.reproduction, 520)}${v.corrections && !/^none/i.test(v.corrections) ? ` Corrections: ${trunc(v.corrections, 420)}` : ''}${v.counter_evidence && !/^none/i.test(v.counter_evidence) ? ` Counter-evidence weighed: ${trunc(v.counter_evidence, 300)}` : ''}`
  } else if (sevRank[severity] <= 1) {
    unverified.push(f.id)
  }
  const o = overrides[f.id] ?? {}
  if (o.severity) severity = o.severity
  if (o.verdict) verdict = o.verdict
  if (o.status) status = o.status
  const item = {
    id: f.id,
    title: o.title ?? f.title,
    severity,
    verdict,
    area: o.area ?? f.area,
    status,
    scope: o.scope ?? scope,
    evidence: [
      ...f.evidence,
      ...dups.flatMap((d) => [`Also reported as ${d.id} (${d.panelist}, ${d.severity}): ${d.title}`, ...d.evidence.slice(0, 2).map((e) => `${d.id}: ${e}`)]),
    ],
    impact: f.impact,
    recommendation: f.recommendation,
    effort: f.effort,
    repro: f.repro,
    panelist: f.panelist,
    merged_from: dups.map((d) => d.id),
    severity_original: f.severity,
    ...(verification ? { verification } : {}),
    ...(o.chair_note ? { chair_note: o.chair_note } : {}),
  }
  if (verdict === 'REFUTED') refuted.push({ ...item, verification })
  else final.push(item)
}

mkdirSync(path.join(S, 'final'), { recursive: true })
writeFileSync(path.join(S, 'final', 'findings.json'), JSON.stringify(final, null, 2))
writeFileSync(path.join(S, 'final', 'refuted.json'), JSON.stringify(refuted, null, 2))
const AREAS = [...new Set(final.map((f) => f.area))]
const table = {}
for (const f of final) {
  table[f.area] ??= { P0: 0, P1: 0, P2: 0, P3: 0 }
  table[f.area][f.severity]++
}
let out = `final findings: ${final.length} (from ${all.length} raw; ${dupOf.size} merged; ${refuted.length} refuted)\n`
out += `P0/P1 without a verification result: ${unverified.join(', ') || 'none'}\n`
for (const a of AREAS) out += `${a.padEnd(36)} ${JSON.stringify(table[a])}\n`
writeFileSync(path.join(S, 'final', 'summary.txt'), out)
console.log(out)
