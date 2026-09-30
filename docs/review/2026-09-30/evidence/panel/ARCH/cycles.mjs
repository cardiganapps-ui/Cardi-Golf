import ts from '/home/user/Cardi-Golf/node_modules/typescript/lib/typescript.js'
import fs from 'node:fs'
import path from 'node:path'
const root = '/home/user/Cardi-Golf/src'
const files = []
function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) files.push(p) } }
walk(root)
const resolve = (from, spec) => {
  if (!spec.startsWith('.')) return null
  const base = path.resolve(path.dirname(from), spec)
  for (const c of [base, base + '.ts', base + '.tsx', path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c
  return null
}
const graph = new Map(), typeOnly = new Map()
for (const f of files) {
  const sf = ts.createSourceFile(f, fs.readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true)
  const deps = new Set()
  sf.forEachChild((n) => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
      const isType = ts.isImportDeclaration(n) ? !!n.importClause?.isTypeOnly : !!n.isTypeOnly
      const r = resolve(f, n.moduleSpecifier.text)
      if (r && !isType) deps.add(r)
    }
  })
  graph.set(f, deps)
}
// Tarjan SCC
let idx = 0; const stack = []; const on = new Set(); const ix = new Map(); const low = new Map(); const sccs = []
function sc(v) { ix.set(v, idx); low.set(v, idx); idx++; stack.push(v); on.add(v)
  for (const w of graph.get(v) ?? []) { if (!ix.has(w)) { sc(w); low.set(v, Math.min(low.get(v), low.get(w))) } else if (on.has(w)) low.set(v, Math.min(low.get(v), ix.get(w))) }
  if (low.get(v) === ix.get(v)) { const comp = []; let w; do { w = stack.pop(); on.delete(w); comp.push(w) } while (w !== v); if (comp.length > 1) sccs.push(comp) } }
for (const v of graph.keys()) if (!ix.has(v)) sc(v)
console.log('runtime import cycles (strongly connected components > 1 file):', sccs.length)
for (const c of sccs) console.log(' -', c.map((f) => path.relative(root, f)).join('  <->  '))
// layering: engine must not import from data/screens/components/lib(ui)
const bad = []
for (const [f, deps] of graph) {
  const rf = path.relative(root, f)
  for (const d of deps) { const rd = path.relative(root, d)
    if (rf.startsWith('engine/') && !rd.startsWith('engine/')) bad.push(`${rf} -> ${rd}`)
    if (rf.startsWith('data/') && (rd.startsWith('screens/') || rd.startsWith('components/'))) bad.push(`${rf} -> ${rd}`)
    if (rf.startsWith('lib/') && (rd.startsWith('screens/') || rd.startsWith('components/') || rd.startsWith('data/'))) bad.push(`${rf} -> ${rd}`)
    if (!rf.startsWith('dev/') && !rf.startsWith('app/') && !rf.startsWith('design/') && rd.startsWith('dev/')) bad.push(`${rf} -> ${rd}`)
  }
}
console.log('layer violations (runtime imports):', bad.length); bad.forEach((b) => console.log('  ', b))
