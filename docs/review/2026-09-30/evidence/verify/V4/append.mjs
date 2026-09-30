// Upsert one finding (JSON file) into V4.result.json by canonical_id.
import fs from 'node:fs'
const out = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/V4.result.json'
const entry = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const all = JSON.parse(fs.readFileSync(out, 'utf8'))
const i = all.findIndex((x) => x.canonical_id === entry.canonical_id)
if (i >= 0) all[i] = entry
else all.push(entry)
fs.writeFileSync(out, JSON.stringify(all, null, 2) + '\n')
console.log('ok', all.map((x) => x.canonical_id).join(' '))
