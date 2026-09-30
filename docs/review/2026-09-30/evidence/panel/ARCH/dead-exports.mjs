// Exported symbols (non-test src) with no reference in any other non-test file, and none in tests either.
import ts from '/home/user/Cardi-Golf/node_modules/typescript/lib/typescript.js'
import fs from 'node:fs'
import path from 'node:path'
const root = '/home/user/Cardi-Golf'
const all = []
function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(e.name)) all.push(p) } }
walk(path.join(root, 'src')); walk(path.join(root, 'api'))
const src = all.filter((f) => !/\.test\./.test(f))
const text = Object.fromEntries(all.map((f) => [f, fs.readFileSync(f, 'utf8')]))
const out = []
for (const f of src) {
  const sf = ts.createSourceFile(f, text[f], ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const names = []
  sf.forEachChild((n) => {
    const mods = ts.canHaveModifiers(n) ? ts.getModifiers(n) : undefined
    const exported = mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    if (!exported) return
    if (ts.isVariableStatement(n)) n.declarationList.declarations.forEach((d) => ts.isIdentifier(d.name) && names.push(d.name.text))
    else if ((ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n) || ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n) || ts.isEnumDeclaration(n)) && n.name) names.push(n.name.text)
  })
  for (const name of names) {
    const re = new RegExp(`\\b${name}\\b`)
    const usedElsewhere = all.some((g) => g !== f && !/\.test\./.test(g) && re.test(text[g]))
    const usedInTests = all.some((g) => g !== f && /\.test\./.test(g) && re.test(text[g]))
    // count uses inside its own file beyond the declaration
    const own = (text[f].match(new RegExp(`\\b${name}\\b`, 'g')) || []).length
    if (!usedElsewhere) out.push({ file: path.relative(root, f), name, own, usedInTests })
  }
}
const deadEverywhere = out.filter((x) => x.own <= 1 && !x.usedInTests)
const testOnly = out.filter((x) => x.usedInTests && x.own <= 1)
const exportedButLocal = out.filter((x) => x.own > 1 && !x.usedInTests)
console.log(`exports never referenced anywhere else (not even tests, not used in own file): ${deadEverywhere.length}`)
for (const x of deadEverywhere) console.log('  ', x.file, x.name)
console.log(`exports referenced only by tests: ${testOnly.length}`)
for (const x of testOnly) console.log('  ', x.file, x.name)
console.log(`exports only used inside their own file (export unnecessary): ${exportedButLocal.length}`)
