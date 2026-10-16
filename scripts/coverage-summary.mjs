#!/usr/bin/env node
/**
 * Where coverage stands, on the check run (QA-15). `npm test` measures the whole app (vite.config.ts) and fails
 * below the bars it keeps for the outbox and the serverless routes; until this, CI said pass or fail and nothing
 * else, so coverage could fall anywhere without a word. This reads coverage/coverage-summary.json (vitest's
 * json-summary) and writes a table by area to the run's summary ($GITHUB_STEP_SUMMARY), and to the log.
 *   node scripts/coverage-summary.mjs [coverage/coverage-summary.json]
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const file = process.argv[2] ?? path.join(root, 'coverage', 'coverage-summary.json')
if (!existsSync(file)) {
  console.error(`No coverage summary at ${path.relative(root, file)}: did \`npm test\` run?`)
  process.exit(1)
}
const summary = JSON.parse(readFileSync(file, 'utf8'))
const KINDS = ['lines', 'statements', 'branches', 'functions']

/** The area a file counts in: src by its first folder (the entry's own files by name), api as one. */
function areaOf(rel) {
  const parts = rel.split('/')
  if (parts[0] !== 'src') return parts[0]
  return parts.length > 2 ? `src/${parts[1]}` : rel
}

const areas = new Map()
for (const [key, entry] of Object.entries(summary)) {
  if (key === 'total') continue
  const area = areaOf(path.relative(root, key).split(path.sep).join('/'))
  const sum = areas.get(area) ?? Object.fromEntries(KINDS.map((k) => [k, { total: 0, covered: 0 }]))
  for (const k of KINDS) {
    sum[k].total += entry[k].total
    sum[k].covered += entry[k].covered
  }
  areas.set(area, sum)
}
const pct = (c) => (c.total ? `${((100 * c.covered) / c.total).toFixed(1)}%` : '–')
const rows = [...areas].sort(([a], [b]) => a.localeCompare(b)).map(([area, sum]) => `| ${area} | ${KINDS.map((k) => pct(sum[k])).join(' | ')} |`)
const total = summary.total
const md = [
  '### Coverage',
  '',
  `| Area | ${KINDS.map((k) => k[0].toUpperCase() + k.slice(1)).join(' | ')} |`,
  `|---|${KINDS.map(() => '---:').join('|')}|`,
  ...rows,
  `| **All** | ${KINDS.map((k) => `**${total[k].pct.toFixed(1)}%**`).join(' | ')} |`,
  '',
  'The outbox, the engine, `api/` and `src/server/` have bars (vite.config.ts): raise them when a test covers more, never lower them.',
  '',
].join('\n')
console.log(md)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`)
