import ts from '/home/user/Cardi-Golf/node_modules/typescript/lib/typescript.js'
import fs from 'node:fs'
import path from 'node:path'
const root = '/home/user/Cardi-Golf'
const files = []
function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) files.push(p) } }
walk(path.join(root, 'src')); walk(path.join(root, 'api'))
const per = {}
const tot = { nonNull: 0, asCast: 0, asConst: 0, asUnknownAs: 0, jsonParse: 0 }
for (const f of files) {
  const rel = path.relative(root, f)
  const sf = ts.createSourceFile(f, fs.readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const c = { nonNull: 0, asCast: 0, asConst: 0, asUnknownAs: 0, jsonParse: 0 }
  const visit = (n) => {
    if (ts.isNonNullExpression(n)) c.nonNull++
    if (ts.isAsExpression(n)) {
      if (ts.isTypeReferenceNode(n.type) && n.type.getText() === 'const') c.asConst++
      else { c.asCast++; if (ts.isAsExpression(n.expression) && n.expression.type.kind === ts.SyntaxKind.UnknownKeyword) c.asUnknownAs++ }
    }
    if (ts.isCallExpression(n) && n.expression.getText() === 'JSON.parse') c.jsonParse++
    ts.forEachChild(n, visit)
  }
  visit(sf)
  per[rel] = c
  for (const k in c) tot[k] += c[k]
}
console.log('TOTAL (non-test src+api):', JSON.stringify(tot))
const layer = (r) => r.startsWith('src/engine') ? 'engine' : r.startsWith('src/data') ? 'data' : r.startsWith('src/screens') ? 'screens' : r.startsWith('src/components') ? 'components' : r.startsWith('src/dev') || r.startsWith('src/design') ? 'dev' : r.startsWith('api') || r.startsWith('src/server') ? 'api' : 'other'
const byLayer = {}
for (const [r, c] of Object.entries(per)) { const l = layer(r); byLayer[l] ??= { nonNull: 0, asCast: 0 }; byLayer[l].nonNull += c.nonNull; byLayer[l].asCast += c.asCast }
console.log('by layer:', JSON.stringify(byLayer))
console.log('worst files by non-null `!`:')
for (const [r, c] of Object.entries(per).sort((a, b) => b[1].nonNull - a[1].nonNull).slice(0, 10)) console.log(`  ${String(c.nonNull).padStart(4)} ${r}`)
console.log('worst files by `as` casts:')
for (const [r, c] of Object.entries(per).sort((a, b) => b[1].asCast - a[1].asCast).slice(0, 10)) console.log(`  ${String(c.asCast).padStart(4)} ${r}`)
console.log('JSON.parse sites:')
for (const [r, c] of Object.entries(per)) if (c.jsonParse) console.log(`  ${c.jsonParse} ${r}`)
