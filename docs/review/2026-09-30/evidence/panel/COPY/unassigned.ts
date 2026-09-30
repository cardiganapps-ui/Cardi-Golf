import { getFixture } from '/home/user/Cardi-Golf/src/dev/fixtures.ts'
import { computeTournament } from '/home/user/Cardi-Golf/src/engine/computeTournament.ts'
import { parseSettings } from '/home/user/Cardi-Golf/src/engine/settings/index.ts'
for (const fx of ['full12-live', 'full12-finished']) {
  const f = getFixture(fx)!
  const settings = parseSettings(f.snapshot.tournament.settings)
  const s = computeTournament(f.snapshot, settings)
  const byMod: Record<string, number> = {}
  for (const p of s.prizes) byMod[p.moduleId] = (byMod[p.moduleId] ?? 0) + p.amount
  const flowsIn = s.money.flows.filter((x) => x.to === null).reduce((a, x) => a + x.amount, 0)
  console.log(fx, 'final', s.tournamentFinal, 'bank in', flowsIn, 'difference', s.money.banker.difference, 'prizes by module', JSON.stringify(byMod))
  console.log('  rounds', f.snapshot.rounds.map((r) => `${r.number}:${r.status}`).join(','), 'snake groups settled', s.modules.snake?.groups.map((g) => `${g.roundNumber}/${g.groupNumber}:${g.status ?? (g as any).state ?? '?'}`).join(' '))
  console.log('  bestRound winners', JSON.stringify(Object.keys((s.modules.bestRound as any)?.days ?? {})), 'warnings', JSON.stringify(s.flags.warnings), 'pending tiebreaks', s.flags.pendingSnakeTiebreaks.length, 'unfilled calcutta', (s.modules.auction as any)?.unfilled)
}
