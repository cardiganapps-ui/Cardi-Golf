import fs from 'node:fs'
import { TraceMap, eachMapping } from '/home/user/Cardi-Golf/node_modules/@jridgewell/trace-mapping/dist/trace-mapping.mjs'
const E = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/panel/evidence/ARCH'
const files = fs.readdirSync(`${E}/dist-sm/assets`).filter((f) => /^index-.*\.js$/.test(f))
const main = files.map((f) => [f, fs.statSync(`${E}/dist-sm/assets/${f}`).size]).sort((a, b) => b[1] - a[1])[0][0]
const code = fs.readFileSync(`${E}/dist-sm/assets/${main}`, 'utf8')
const map = new TraceMap(JSON.parse(fs.readFileSync(`${E}/dist-sm/assets/${main}.map`, 'utf8')))
const lines = code.split('\n')
const bytes = new Map()
let prev = null
eachMapping(map, (m) => {
  if (prev && prev.generatedLine === m.generatedLine) {
    const len = m.generatedColumn - prev.generatedColumn
    const k = prev.source ?? '(none)'
    bytes.set(k, (bytes.get(k) ?? 0) + len)
  } else if (prev) {
    const len = lines[prev.generatedLine - 1].length - prev.generatedColumn
    const k = prev.source ?? '(none)'
    bytes.set(k, (bytes.get(k) ?? 0) + len)
  }
  prev = m
})
const group = (s) => {
  s = s.replace(/^(\.\.\/)+/, '').replace(/^home\/user\/Cardi-Golf\//, '')
  if (s.includes('node_modules/')) { const m = s.split('node_modules/').pop().split('/'); return 'npm:' + (m[0].startsWith('@') ? m[0] + '/' + m[1] : m[0]) }
  const m = s.match(/^src\/([^/]+)(?:\/([^/]+))?/)
  if (!m) return s
  if (m[1] === 'screens' || m[1] === 'engine') return `src/${m[1]}/${m[2]}`
  if (m[1] === 'i18n') return 'src/i18n'
  return `src/${m[1]}`
}
const g = new Map()
for (const [k, v] of bytes) g.set(group(k), (g.get(group(k)) ?? 0) + v)
const total = [...g.values()].reduce((a, b) => a + b, 0)
console.log(`main chunk ${main}: ${code.length} bytes, attributed ${total}`)
for (const [k, v] of [...g].sort((a, b) => b[1] - a[1]).slice(0, 28)) console.log(`${(v / 1024).toFixed(1).padStart(7)} KiB  ${((v / total) * 100).toFixed(1).padStart(5)}%  ${k}`)
