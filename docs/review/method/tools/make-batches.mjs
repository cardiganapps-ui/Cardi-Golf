#!/usr/bin/env node
// Build verification batches: canonical P0/P1 findings with their duplicates' full details.
//   node make-batches.mjs <batches.json>   (batches.json: {"V1": [["MONEY-01","COPY-01","UX-12"], ["MONEY-04","COPY-02"], ...], ...})
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const S = path.resolve(new URL('..', import.meta.url).pathname)
const all = JSON.parse(readFileSync(path.join(S, 'merged', 'all.json'), 'utf8'))
const byId = new Map(all.map((f) => [f.id, f]))
const spec = JSON.parse(readFileSync(process.argv[2], 'utf8'))
mkdirSync(path.join(S, 'verify'), { recursive: true })
for (const [batch, groups] of Object.entries(spec)) {
  const out = groups.map((ids) => {
    const [canon, ...dups] = ids
    const main = byId.get(canon)
    if (!main) throw new Error(`unknown id ${canon}`)
    return {
      canonical_id: canon,
      also_reported_as: dups.map((d) => {
        const f = byId.get(d)
        if (!f) throw new Error(`unknown id ${d}`)
        return { id: d, severity: f.severity, title: f.title, evidence: f.evidence, repro: f.repro, impact: f.impact }
      }),
      ...main,
    }
  })
  writeFileSync(path.join(S, 'verify', `${batch}.input.json`), JSON.stringify(out, null, 2))
  console.log(batch, out.map((f) => f.canonical_id).join(', '))
}
