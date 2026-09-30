import fs from 'node:fs'
const cov = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const want = process.argv.slice(3)
for (const [f, d] of Object.entries(cov)) {
  if (!want.some((w) => f.endsWith(w))) continue
  const ub = []
  for (const [id, counts] of Object.entries(d.b)) {
    const m = d.branchMap[id]
    counts.forEach((c, i) => { if (c === 0) ub.push(`${m.locations[i]?.start.line ?? m.loc.start.line}(${m.type})`) })
  }
  const ul = new Set()
  for (const [id, c] of Object.entries(d.s)) if (c === 0) ul.add(d.statementMap[id].start.line)
  console.log(f.split('/src/')[1] ?? f)
  console.log('  uncovered branches at lines:', [...new Set(ub)].join(', '))
  console.log('  uncovered statements at lines:', [...ul].sort((a, b) => a - b).join(', '))
}
