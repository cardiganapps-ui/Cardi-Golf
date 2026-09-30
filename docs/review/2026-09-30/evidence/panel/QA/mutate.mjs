import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { MUTANTS } from './mutants.mjs'
const repo = process.argv[2]
const only = process.argv[3]?.split(',')
const out = []
for (const m of MUTANTS) {
  if (only && !only.includes(m.id)) continue
  const f = path.join(repo, m.file)
  const orig = fs.readFileSync(f, 'utf8')
  const count = orig.split(m.find).length - 1
  if (count !== 1) { out.push({ ...m, result: `SKIPPED (find matched ${count}×)` }); console.log(m.id, 'SKIP', count); continue }
  fs.writeFileSync(f, orig.replace(m.find, m.replace))
  const json = path.join(repo, `../mut-${m.id}.json`)
  const t0 = Date.now()
  const r = spawnSync('nice', ['-n', '10', 'npx', 'vitest', 'run', '--reporter=json', `--outputFile=${json}`], { cwd: repo, encoding: 'utf8', timeout: 300000 })
  fs.writeFileSync(f, orig) // restore
  let failed = []
  try {
    const j = JSON.parse(fs.readFileSync(json, 'utf8'))
    for (const tf of j.testResults) for (const a of tf.assertionResults) if (a.status === 'failed') failed.push(`${path.relative(repo, tf.name)} › ${a.fullName}`)
    if (!j.testResults.length || j.numFailedTestSuites && !failed.length) failed.push(`suite error: ${j.testResults.filter(t=>t.status==='failed').map(t=>path.relative(repo,t.name)+': '+(t.message||'').slice(0,200)).join(' | ')}`)
  } catch (e) { failed.push('could not read vitest json: ' + e.message + ' exit ' + r.status) }
  const res = { id: m.id, what: m.what, file: m.file, result: failed.length ? 'KILLED' : 'SURVIVED', killedBy: failed.slice(0, 6), nKilledBy: failed.length, secs: Math.round((Date.now() - t0) / 1000) }
  out.push(res)
  console.log(res.id, res.result, res.nKilledBy, res.secs + 's', res.killedBy[0] ?? '')
  // sanity: file restored
  if (fs.readFileSync(f, 'utf8') !== orig) throw new Error('restore failed ' + f)
}
fs.writeFileSync(path.join(repo, `../mutation-results${only ? '-' + only.join('_') : ''}.json`), JSON.stringify(out, null, 2))
