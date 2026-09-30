import { readFileSync, writeFileSync } from 'node:fs'
// 1. Show the interaction state next to the URL in the index table.
let g = readFileSync('gen-index.mjs', 'utf8')
const from = "| ${esc(r.url.replace('http://127.0.0.1:4173', ''))} |"
const to = "| ${esc(r.url.replace('http://127.0.0.1:4173', ''))}${r.state !== 'default' && r.state !== 'full' ? ` → state '${r.state.replace(/-full$/, '')}'` : ''} |"
if (g.includes(from)) g = g.replace(from, to)
writeFileSync('gen-index.mjs', g)
// 2. Small-type issue and the tab-bar note.
const i = JSON.parse(readFileSync('issues.json', 'utf8'))
const small = "**Small type in the chrome.** Tab-bar labels and the board column heads ('HOY', 'HOYO', 'PUNTOS') are 11 px on every screen. The Tarjeta grid adds 54–56 runs at 11 px (the per-hole points). This is for an app read in bright sun (§9: 'big numerals')."
if (!i.issues.some((x) => x.startsWith('**Small type'))) i.issues.splice(i.issues.length - 3, 0, small)
const note = "In 'metrics', the 'text run(s) <12px' count on every tabbed screen includes the five 11-px tab-bar labels ('En vivo', 'Tarjeta'…), so only counts above 5 point at the screen itself."
if (!i.notes.includes(note)) i.notes.push(note)
writeFileSync('issues.json', JSON.stringify(i, null, 1))
console.log('ok')
