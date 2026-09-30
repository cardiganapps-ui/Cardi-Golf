// usage: node append.mjs <new-items.json>  — appends (or replaces by id) findings in ARCH.findings.json
import fs from 'node:fs'
const F = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/panel/ARCH.findings.json'
const cur = JSON.parse(fs.readFileSync(F, 'utf8'))
const add = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
for (const it of add) {
  const i = cur.findIndex((x) => x.id === it.id)
  if (i >= 0) cur[i] = it; else cur.push(it)
}
const keys = ['id', 'title', 'severity', 'verdict', 'area', 'status', 'evidence', 'impact', 'recommendation', 'effort', 'repro']
for (const it of cur) for (const k of keys) if (!(k in it)) throw new Error(`${it.id} missing ${k}`)
fs.writeFileSync(F, JSON.stringify(cur, null, 2) + '\n')
JSON.parse(fs.readFileSync(F, 'utf8'))
console.log('ok', cur.length, 'findings:', cur.map((x) => `${x.id}/${x.severity}`).join(' '))
