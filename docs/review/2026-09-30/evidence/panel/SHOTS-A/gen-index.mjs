// Builds $S/shots-A.json and $S/shots-index-A.md from results-A.json + manual-notes.json + issues.json.
import { readFileSync, writeFileSync, statSync, existsSync } from 'node:fs'
import path from 'node:path'
const HERE = path.dirname(new URL(import.meta.url).pathname)
const S = path.resolve(HERE, '../../..')
const REPO = '/home/user/Cardi-Golf'
const results = JSON.parse(readFileSync(path.join(HERE, 'results-A.json'), 'utf8'))
const manual = existsSync(path.join(HERE, 'manual-notes.json')) ? JSON.parse(readFileSync(path.join(HERE, 'manual-notes.json'), 'utf8')) : {}
const issues = existsSync(path.join(HERE, 'issues.json')) ? JSON.parse(readFileSync(path.join(HERE, 'issues.json'), 'utf8')) : { issues: [], notes: [] }

let total = 0
const rows = results.map((r) => {
  const base = r.file.split('/').pop()
  const size = existsSync(path.join(REPO, r.file)) ? statSync(path.join(REPO, r.file)).size : 0
  total += size
  const m = r.metrics || {}
  const obs = [...r.observations, ...(manual[base] || []).map((x) => `(visual) ${x}`)]
  return { file: r.file, url: r.url, device: r.device, viewport: r.viewport, fixture: r.fixture, route: r.route, state: r.state, fullPage: r.full, observations: obs, metrics: { scrollHeight: m.scrollHeight, capturedHeight: m.capturedHeight, h1: m.h1, dialogs: m.dialogs, tapTargetsUnder44px: m.smallTargets, tapTargetExamples: m.smallTargetExamples, textRunsUnder12px: m.textUnder12px, textUnder12pxExamples: m.textUnder12pxExamples, horizontalScrollers: m.hScrollers, fontsLoaded: m.fontsOk }, bytes: size }
})
writeFileSync(path.join(S, 'shots-A.json'), JSON.stringify(rows, null, 1))

const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ')
const compact = (r) => {
  const m = r.metrics
  const bits = []
  if (m.tapTargetsUnder44px) bits.push(`${m.tapTargetsUnder44px} tap target(s) <44px${m.tapTargetExamples?.length ? ` (e.g. ${m.tapTargetExamples.slice(0, 2).join('; ')})` : ''}`)
  if (m.textRunsUnder12px) bits.push(`${m.textRunsUnder12px} text run(s) <12px${m.textUnder12pxExamples?.length ? ` (${m.textUnder12pxExamples.slice(0, 2).join(', ')})` : ''}`)
  if (m.h1 && m.h1.length === 0 && !(m.dialogs || []).length) bits.push('no h1')
  if (m.horizontalScrollers?.length) bits.push(`sideways scroller: ${m.horizontalScrollers.join(', ')}`)
  return bits.length ? `metrics: ${bits.join('; ')}` : ''
}
const byMatrix = [
  ['1. Player routes × 7 fixtures at 15pro (393×852 @2x), with full-page live/juegos/dinero', (r) => r.device === '15pro' && ['minimal4-setup', 'minimal4-live', 'full12-live', 'full12-finished', 'pairs8', 'large60', 'longnames'].includes(r.fixture) && (r.state === 'default' || r.state === 'full') && !(r.fixture === 'full12-live' && r.route === 't_mas' && r.state === 'full')],
  ['2. Device sweep (se 375×667 @2x, android 412×915 @2x, ipad 1024×1366 @1x)', (r) => r.device !== '15pro'],
  ['3. Other fixtures × live/juegos/dinero at 15pro', (r) => r.device === '15pro' && !['minimal4-setup', 'minimal4-live', 'full12-live', 'full12-finished', 'pairs8', 'large60', 'longnames'].includes(r.fixture) && r.state === 'default'],
  ['4. States on full12-live at 15pro', (r) => r.device === '15pro' && r.fixture === 'full12-live' && (r.state !== 'default' && r.state !== 'full' || (r.route === 't_mas' && r.state === 'full'))],
  ['5. Extra states on other fixtures at 15pro', (r) => r.device === '15pro' && r.fixture !== 'full12-live' && r.state !== 'default' && r.state !== 'full'],
]
const used = new Set()
let md = `# SHOTS-A: player-facing tournament screens on the fixtures\n\n`
md += `${rows.length} PNGs, ${(total / 1024 / 1024).toFixed(1)} MB after palette compression, in \`docs/review/2026-09-30/shots/\`. Built from HEAD \`379ed52\` on the shared preview server (\`http://127.0.0.1:4173\`, \`VITE_DESIGN_ROUTES=1\`). Script: \`$S/panel/evidence/SHOTS-A/capture.mjs\` (+ \`analyze.mjs\`), raw results \`results-A.json\`, machine-readable index \`$S/shots-A.json\`.\n\n`
md += `## Issues seen\n\n`
for (const i of issues.issues) md += `- ${i}\n`
md += `\n## How to read this\n\n`
for (const n of issues.notes) md += `- ${n}\n`
for (const [title, pred] of byMatrix) {
  const list = rows.filter((r) => !used.has(r.file) && pred(r))
  list.forEach((r) => used.add(r.file))
  if (!list.length) continue
  md += `\n## ${title}\n\n| file | URL | viewport | observations |\n|---|---|---|---|\n`
  for (const r of list) {
    const o = [...r.observations, compact(r)].filter(Boolean)
    md += `| \`${r.file.split('/').pop()}\` | ${esc(r.url.replace('http://127.0.0.1:4173', ''))}${r.state !== 'default' && r.state !== 'full' ? ` → state '${r.state.replace(/-full$/, '')}'` : ''} | ${esc(r.viewport)}${r.fullPage ? `, full page ${r.metrics.capturedHeight}px` : ''} | ${o.length ? esc(o.join(' · ')) : 'none'} |\n`
  }
}
const rest = rows.filter((r) => !used.has(r.file))
if (rest.length) {
  md += `\n## Other\n\n| file | URL | viewport | observations |\n|---|---|---|---|\n`
  for (const r of rest) md += `| \`${r.file.split('/').pop()}\` | ${esc(r.url)} | ${esc(r.viewport)} | ${esc([...r.observations, compact(r)].filter(Boolean).join(' · ')) || 'none'} |\n`
}
writeFileSync(path.join(S, 'shots-index-A.md'), md)
console.log(`${rows.length} rows, ${(total / 1024 / 1024).toFixed(2)} MB`)
