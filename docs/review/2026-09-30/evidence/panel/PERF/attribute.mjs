// Attribute the bytes of a minified chunk to its original sources via its sourcemap.
// Usage: node attribute.mjs <chunk.js> [--files]
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { SourceMapConsumer } from 'source-map-js'

const file = process.argv[2]
const showFiles = process.argv.includes('--files')
const code = readFileSync(file, 'utf8')
const map = JSON.parse(readFileSync(file + '.map', 'utf8'))
const smc = new SourceMapConsumer(map)

const lines = code.split('\n')
const bySource = new Map()
const codeBySource = new Map()
let unmapped = 0
// Collect all mappings sorted by generated position.
const segs = []
smc.eachMapping((m) => segs.push(m), null, SourceMapConsumer.GENERATED_ORDER)
for (let i = 0; i < segs.length; i++) {
  const m = segs[i]
  const next = segs[i + 1]
  const line = lines[m.generatedLine - 1] ?? ''
  const end = next && next.generatedLine === m.generatedLine ? next.generatedColumn : line.length
  const len = Math.max(0, end - m.generatedColumn)
  const src = m.source ?? '(unmapped)'
  bySource.set(src, (bySource.get(src) ?? 0) + len)
  if (!codeBySource.has(src)) codeBySource.set(src, [])
  codeBySource.get(src).push(line.slice(m.generatedColumn, end))
}
const total = code.length
const mapped = [...bySource.values()].reduce((a, b) => a + b, 0)

function group(src) {
  const nm = src.lastIndexOf('node_modules/')
  if (nm >= 0) {
    const rest = src.slice(nm + 'node_modules/'.length).split('/')
    return 'npm:' + (rest[0].startsWith('@') ? rest[0] + '/' + rest[1] : rest[0])
  }
  const s = src.replace(/^.*?\/src\//, 'src/')
  if (s.startsWith('src/')) {
    const parts = s.split('/')
    if (parts[1] === 'screens' || parts[1] === 'engine' || parts[1] === 'dev' || parts[1] === 'design') return parts.slice(0, 3).join('/')
    return parts.slice(0, 2).join('/')
  }
  return src
}
const byGroup = new Map()
const codeByGroup = new Map()
for (const [src, n] of bySource) {
  const g = group(src)
  byGroup.set(g, (byGroup.get(g) ?? 0) + n)
  if (!codeByGroup.has(g)) codeByGroup.set(g, [])
  codeByGroup.get(g).push(...codeBySource.get(src))
}
const rows = [...byGroup.entries()].sort((a, b) => b[1] - a[1])
console.log(`chunk ${file}\ntotal ${total} B, mapped ${mapped} B (${((mapped / total) * 100).toFixed(1)}%), gzip(whole) ${gzipSync(code).length} B`)
console.log('group\traw_B\traw_%\tgzip_alone_B')
for (const [g, n] of rows) {
  const gz = gzipSync(codeByGroup.get(g).join('')).length
  console.log(`${g}\t${n}\t${((n / total) * 100).toFixed(1)}\t${gz}`)
}
if (showFiles) {
  console.log('\n--- top 60 files ---')
  for (const [src, n] of [...bySource.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60)) console.log(`${n}\t${src.replace(/^.*?(node_modules|src)\//, '$1/')}`)
}
