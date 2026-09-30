// V13: attribute every byte of a minified chunk to its original source file via the source map.
// Bytes between mappings are charged to the segment's source; unmapped bytes go to '(unmapped)'.
// usage: node attribute-v13.mjs <chunk.js>
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire('/home/user/Cardi-Golf/package.json')
const { SourceMapConsumer } = require('source-map-js')

const file = process.argv[2]
const code = readFileSync(file, 'utf8')
const map = JSON.parse(readFileSync(file + '.map', 'utf8'))
const smc = new SourceMapConsumer(map)
const lines = code.split('\n')
// Byte offset of each line start (UTF-8 bytes, what goes over the wire).
const enc = new TextEncoder()
const bySource = new Map()
const add = (src, n) => bySource.set(src, (bySource.get(src) ?? 0) + n)
const segs = []
smc.eachMapping((m) => segs.push({ line: m.generatedLine, col: m.generatedColumn, src: m.source }), null, SourceMapConsumer.GENERATED_ORDER)
// Walk each line, charging [col_i, col_{i+1}) to seg i's source.
let si = 0
for (let li = 0; li < lines.length; li++) {
  const line = lines[li]
  const lineNo = li + 1
  const lineSegs = []
  while (si < segs.length && segs[si].line === lineNo) lineSegs.push(segs[si++])
  if (!lineSegs.length) {
    add('(unmapped)', enc.encode(line).length + 1)
    continue
  }
  if (lineSegs[0].col > 0) add('(unmapped)', enc.encode(line.slice(0, lineSegs[0].col)).length)
  for (let k = 0; k < lineSegs.length; k++) {
    const a = lineSegs[k].col
    const b = k + 1 < lineSegs.length ? lineSegs[k + 1].col : line.length
    add(lineSegs[k].src ?? '(unmapped)', enc.encode(line.slice(a, b)).length)
  }
  add('(newline)', 1)
}
const total = [...bySource.values()].reduce((a, b) => a + b, 0)
// Group into packages / app folders.
const group = (src) => {
  if (!src || src.startsWith('(')) return src ?? '(unmapped)'
  const nm = src.lastIndexOf('node_modules/')
  if (nm >= 0) {
    const rest = src.slice(nm + 'node_modules/'.length).split('/')
    return 'npm:' + (rest[0].startsWith('@') ? rest[0] + '/' + rest[1] : rest[0])
  }
  const m = src.match(/src\/(.*)$/)
  if (m) {
    const parts = m[1].split('/')
    return 'src/' + (parts.length > 2 ? parts.slice(0, 2).join('/') : parts.length === 2 ? parts[0] : parts[0])
  }
  return src
}
const groups = new Map()
for (const [src, n] of bySource) groups.set(group(src), (groups.get(group(src)) ?? 0) + n)
const rows = [...groups].sort((a, b) => b[1] - a[1])
console.log(`total ${total} B (file ${Buffer.byteLength(code)} B)`)
for (const [g, n] of rows) if (n > 2000) console.log(`${(n / 1024).toFixed(1).padStart(8)} KiB  ${((n / total) * 100).toFixed(1).padStart(5)}%  ${g}`)
if (process.argv.includes('--files')) {
  console.log('\n-- src files --')
  for (const [src, n] of [...bySource].filter(([s]) => s && s.includes('/src/')).sort((a, b) => b[1] - a[1]).slice(0, 60)) console.log(`${(n / 1024).toFixed(1).padStart(8)} KiB  ${src.replace(/.*\/src\//, 'src/')}`)
}
