import { readFileSync, writeFileSync } from 'node:fs'
const F = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/panel/PERF.findings.json'
const a = JSON.parse(readFileSync(F, 'utf8'))
const f = Object.fromEntries(a.map((x) => [x.id, x]))
f['PERF-10'].title = '“Guardar hoyo” recomputes the whole tournament four times and re-renders the Tarjeta ~11 times: 221–449 ms (median 293) from tap to the next hole on a mid-range phone, 406–956 ms (median 495) at 60 players'
f['PERF-10'].evidence.push('Same script on large60 (load 2.3–2.5): click → next hole 956 / 485 / 495 / 406 / 557 ms; 12–13 commits and ~706 component renders per save; TaskDuration 574–1,098 ms. Output: $S/panel/evidence/PERF/tarjeta-large60-cpu4-*.json')
f['PERF-10'].impact = 'The one action a scorer repeats 18 times a round feels sticky: a third of a second (almost half a second at worst) between tap and the next hole on a mid-range Android, and half a second to a full second at 60 players. It is still inside §2\'s 10-second budget for a foursome, but a flagship scoring app answers a primary tap in < 100 ms.'
writeFileSync(F, JSON.stringify(a, null, 2) + '\n')
JSON.parse(readFileSync(F, 'utf8'))
console.log('ok')
