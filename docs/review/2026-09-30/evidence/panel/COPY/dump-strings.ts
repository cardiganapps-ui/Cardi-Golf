// Scratch-only: compute every design fixture with the real engine and dump
// every user-visible string the engine produces (prize labels, explanations,
// warnings, slot labels, handicap whys, game notes), so copy can be scanned.
import { getFixture, FIXTURE_NAMES } from '/home/user/Cardi-Golf/src/dev/fixtures.ts'
import { computeTournament } from '/home/user/Cardi-Golf/src/engine/computeTournament.ts'
import { parseSettings } from '/home/user/Cardi-Golf/src/engine/settings/index.ts'
import { writeFileSync } from 'node:fs'

const out: Record<string, string[]> = {}
function walk(v: unknown, path: string, acc: string[], depth = 0) {
  if (depth > 12 || v == null) return
  if (typeof v === 'string') {
    if (/[a-zA-ZáéíóúñÁÉÍÓÚ]{2,}/.test(v) && !/^[0-9a-f-]{8,}$/.test(v) && !/^(p|r|g|fx)[0-9-]/.test(v)) acc.push(`${path}\t${v}`)
    return
  }
  if (Array.isArray(v)) {
    v.forEach((x, i) => walk(x, `${path}[${i}]`, acc, depth + 1))
    return
  }
  if (typeof v === 'object') {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (k === 'snapshot' || k === 'settings') continue
      walk(x, path ? `${path}.${k}` : k, acc, depth + 1)
    }
  }
}
for (const name of FIXTURE_NAMES) {
  const f = getFixture(name)!
  let settings
  try {
    settings = parseSettings(f.snapshot.tournament.settings)
  } catch (e) {
    out[name] = [`PARSE ERROR ${(e as Error).message}`]
    continue
  }
  const state = computeTournament(f.snapshot, settings)
  const acc: string[] = []
  walk(state, '', acc)
  out[name] = [...new Set(acc)]
}
writeFileSync(process.argv[2] ?? '/dev/stdout', JSON.stringify(out, null, 1))
console.error('fixtures', FIXTURE_NAMES.length, 'strings', Object.values(out).reduce((n, a) => n + a.length, 0))
