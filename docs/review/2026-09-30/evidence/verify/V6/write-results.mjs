// V6: (re)write V6.result.json from the entries in results-src.json
import fs from 'node:fs'
const S = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad'
const src = JSON.parse(fs.readFileSync(`${S}/verify/evidence/V6/results-src.json`, 'utf8'))
fs.writeFileSync(`${S}/verify/V6.result.json`, JSON.stringify(src, null, 2) + '\n')
JSON.parse(fs.readFileSync(`${S}/verify/V6.result.json`, 'utf8'))
console.log('ok', src.map((x) => `${x.canonical_id} ${x.verdict} ${x.severity_recommended}`).join(' | '))
