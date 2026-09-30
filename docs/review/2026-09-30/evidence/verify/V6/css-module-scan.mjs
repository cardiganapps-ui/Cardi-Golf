// V6: list every `<name>.<cls>` reference in src/**/*.tsx whose imported CSS module does not define `.cls`.
import fs from 'node:fs'
import path from 'node:path'
const ROOT = '/home/user/Cardi-Golf/src'
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]))
const files = walk(ROOT).filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'))
const missing = []
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  for (const m of src.matchAll(/import\s+(\w+)\s+from\s+'([^']+\.module\.css)'/g)) {
    const [, name, rel] = m
    const cssPath = path.resolve(path.dirname(f), rel)
    const css = fs.readFileSync(cssPath, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const defined = new Set([...css.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((x) => x[1]))
    const used = new Set([...src.matchAll(new RegExp(`\\b${name}\\.([A-Za-z_]\\w*)`, 'g'))].map((x) => x[1]))
    const usedBracket = [...src.matchAll(new RegExp(`\\b${name}\\[`, 'g'))].length
    for (const u of used) if (!defined.has(u)) missing.push({ file: path.relative('/home/user/Cardi-Golf', f), module: path.relative('/home/user/Cardi-Golf', cssPath), cls: u, line: src.split('\n').findIndex((l) => l.includes(`${name}.${u}`)) + 1, dynamicLookups: usedBracket })
  }
}
console.log(JSON.stringify(missing, null, 1))
console.log('total missing', missing.length)
