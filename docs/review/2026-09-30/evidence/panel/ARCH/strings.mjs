// Extract string/template literals with Spanish-looking user copy from TS/TSX files outside src/i18n.
import ts from '/home/user/Cardi-Golf/node_modules/typescript/lib/typescript.js'
import fs from 'node:fs'
import path from 'node:path'
const root = '/home/user/Cardi-Golf'
const files = []
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) files.push(p)
  }
}
walk(path.join(root, 'src')); walk(path.join(root, 'api'))
const spanishWords = /\b(el|la|los|las|del|de|en|con|sin|por|para|que|una|uno|hoyo|hoyos|ronda|torneo|jugador|jugadores|pareja|grupo|día|pts|golpes?|puntos|pagar?|paga|bolsa|pozo|Comité|premio|sin asignar|lote|juego|equipo|campo|tarjeta|índice|hándicap|neto|gross|vence|Firmar|Guardar|Cerrar|Entrar|Salir|Error|No se|no se|Reintenta|Actualiza)\b/
const accents = /[áéíóúñ¿¡ÁÉÍÓÚÑ]/
const out = {}
let total = 0
for (const f of files) {
  const rel = path.relative(root, f)
  if (rel.startsWith('src/i18n/')) continue
  const src = fs.readFileSync(f, 'utf8')
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const hits = []
  function text(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
    if (ts.isTemplateExpression(node)) return node.head.text + node.templateSpans.map((s) => '${…}' + s.literal.text).join('')
    if (ts.isJsxText(node)) return node.text.trim()
    return null
  }
  function visit(node) {
    const s = text(node)
    if (s != null && s.length > 1) {
      // skip import specifiers, object keys that are identifiers, css class-like strings
      const parent = node.parent
      const isImport = parent && (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent))
      if (!isImport && (accents.test(s) || (spanishWords.test(s) && /\s/.test(s)))) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart())
        hits.push(`${line + 1}: ${s.slice(0, 110).replace(/\n/g, ' ')}`)
      }
    }
    if (!ts.isTemplateExpression(node)) ts.forEachChild(node, visit)
    else node.templateSpans.forEach((sp) => visit(sp.expression))
  }
  visit(sf)
  if (hits.length) { out[rel] = hits; total += hits.length }
}
const sorted = Object.entries(out).sort((a, b) => b[1].length - a[1].length)
console.log('TOTAL', total, 'in', sorted.length, 'files')
for (const [f, h] of sorted) console.log(String(h.length).padStart(4), f)
fs.writeFileSync(new URL('./spanish-literals.json', import.meta.url), JSON.stringify(out, null, 1))
