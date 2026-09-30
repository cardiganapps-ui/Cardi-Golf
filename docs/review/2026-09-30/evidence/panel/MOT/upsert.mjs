// usage: node upsert.mjs <file-with-one-or-more-findings.json>  -> merges by id into $S/panel/MOT.findings.json
import { readFileSync, writeFileSync } from 'node:fs'
const F = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/panel/MOT.findings.json'
const cur = JSON.parse(readFileSync(F, 'utf8'))
const add = JSON.parse(readFileSync(process.argv[2], 'utf8'))
for (const f of Array.isArray(add) ? add : [add]) {
  for (const k of ['id', 'title', 'severity', 'verdict', 'area', 'status', 'evidence', 'impact', 'recommendation', 'effort', 'repro']) if (!(k in f)) throw new Error(`${f.id} missing ${k}`)
  const i = cur.findIndex((x) => x.id === f.id)
  if (i >= 0) cur[i] = f; else cur.push(f)
}
cur.sort((a, b) => a.id.localeCompare(b.id))
writeFileSync(F, JSON.stringify(cur, null, 2))
JSON.parse(readFileSync(F, 'utf8'))
console.log('ok', cur.length, cur.map((x) => `${x.id}:${x.severity}`).join(' '))
