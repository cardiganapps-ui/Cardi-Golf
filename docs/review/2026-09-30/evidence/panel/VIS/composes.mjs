import fs from 'node:fs'
import path from 'node:path'
const root = '/home/user/Cardi-Golf/src'
const prim = fs.readFileSync(root + '/components/primitives.module.css', 'utf8')
function blocks(css) {
  const out = {}
  const re = /(^|\n)\s*(\.[A-Za-z0-9_-]+)\s*\{([^}]*)\}/g
  let m
  while ((m = re.exec(css))) { const sel = m[2]; const body = m[3]; const decls = {}; for (const d of body.split(';')) { const i = d.indexOf(':'); if (i < 0) continue; const k = d.slice(0, i).trim(); const v = d.slice(i + 1).trim(); if (k && !k.startsWith('/*')) decls[k] = v } out[sel] = { ...(out[sel] || {}), ...decls } }
  return out
}
const P = blocks(prim)
const files = []
;(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (p.endsWith('.module.css') && !p.endsWith('primitives.module.css')) files.push(p) } })(root)
let n = 0
for (const f of files) {
  const B = blocks(fs.readFileSync(f, 'utf8'))
  for (const [sel, decls] of Object.entries(B)) {
    const c = decls['composes']; if (!c || !/primitives/.test(c)) continue
    const names = c.replace(/from.*/, '').trim().split(/\s+/)
    for (const nm of names) {
      const base = P['.' + nm]; if (!base) continue
      const conflicts = Object.keys(decls).filter(k => k !== 'composes' && k in base && base[k] !== decls[k])
      if (conflicts.length) { n++; console.log(`${path.relative('/home/user/Cardi-Golf', f)} ${sel} composes ${nm}: local ${conflicts.map(k => `${k}:${decls[k]}`).join('; ')}  LOSES TO base ${conflicts.map(k => `${k}:${base[k]}`).join('; ')}`) }
    }
  }
}
console.log('conflicting overrides:', n)
