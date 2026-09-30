import fs from 'node:fs'
const [,, file, depthArg] = process.argv
const sum = JSON.parse(fs.readFileSync(file, 'utf8'))
const root = process.env.ROOT
const groups = {}
const depth = Number(depthArg || 3)
for (const [f, v] of Object.entries(sum)) {
  if (f === 'total') continue
  const rel = f.replace(root + '/', '')
  const parts = rel.split('/')
  let key
  // group engine by module folder, screens by subfolder
  if (parts[0] === 'src' && parts[1] === 'engine') key = parts.slice(0, Math.min(parts.length - 1, parts[2] === 'modules' || parts[2] === 'games' ? 4 : 3)).join('/')
  else if (parts[0] === 'src' && parts[1] === 'screens') key = parts.slice(0, Math.min(parts.length - 1, 3)).join('/')
  else key = parts.slice(0, Math.min(parts.length - 1, depth - 1)).join('/') || parts[0]
  const g = (groups[key] ??= { files: 0, filesZero: 0, lt: 0, lc: 0, bt: 0, bc: 0, ft: 0, fc: 0 })
  g.files++
  if (v.lines.covered === 0) g.filesZero++
  g.lt += v.lines.total; g.lc += v.lines.covered
  g.bt += v.branches.total; g.bc += v.branches.covered
  g.ft += v.functions.total; g.fc += v.functions.covered
}
const pct = (c, t) => (t ? ((100 * c) / t).toFixed(1) : '—').padStart(6)
const rows = Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]))
console.log('dir'.padEnd(34), 'files', 'zero', ' lines%', '(cov/total)'.padEnd(14), 'branch%', ' func%')
for (const [k, g] of rows) console.log(k.padEnd(34), String(g.files).padStart(5), String(g.filesZero).padStart(4), pct(g.lc, g.lt), `(${g.lc}/${g.lt})`.padEnd(14), pct(g.bc, g.bt), pct(g.fc, g.ft))
const t = sum.total
console.log('TOTAL'.padEnd(34), '', '', pct(t.lines.covered, t.lines.total), `(${t.lines.covered}/${t.lines.total})`, pct(t.branches.covered, t.branches.total), pct(t.functions.covered, t.functions.total))
