// Append or replace findings by id in PERF.findings.json. usage: node add-findings.mjs <new.json>
import { readFileSync, writeFileSync } from 'node:fs'
const F = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/panel/PERF.findings.json'
const cur = JSON.parse(readFileSync(F, 'utf8'))
const add = JSON.parse(readFileSync(process.argv[2], 'utf8'))
for (const f of add) {
  const i = cur.findIndex((x) => x.id === f.id)
  if (i >= 0) cur[i] = f
  else cur.push(f)
}
cur.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }))
writeFileSync(F, JSON.stringify(cur, null, 2) + '\n')
JSON.parse(readFileSync(F, 'utf8'))
console.log('ok', cur.length, 'findings:', cur.map((x) => `${x.id}(${x.severity})`).join(' '))
