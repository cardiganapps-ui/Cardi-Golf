// Merge one result entry (JSON file) into $S/verify/V10.result.json, replacing any entry with the same canonical_id.
import { readFileSync, writeFileSync } from 'node:fs'
const S = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad'
const f = `${S}/verify/V10.result.json`
const order = ['REL-02', 'REL-03', 'REL-10', 'REL-15']
const entry = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const all = JSON.parse(readFileSync(f, 'utf8')).filter((x) => x.canonical_id !== entry.canonical_id)
all.push(entry)
all.sort((a, b) => order.indexOf(a.canonical_id) - order.indexOf(b.canonical_id))
writeFileSync(f, JSON.stringify(all, null, 2) + '\n')
console.log('ok', all.map((x) => `${x.canonical_id}:${x.verdict}:${x.severity_recommended}`).join(' '))
