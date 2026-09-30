import { it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { computeTournament } from '/home/user/Cardi-Golf/src/engine/computeTournament'
import { safeParseSettings } from '/home/user/Cardi-Golf/src/engine/settings/schema'
import { checkPrizePool, fieldShape } from '/home/user/Cardi-Golf/src/engine/settings/prizeCheck'
import { answerSnake, gen } from './gen'
it('which format fails P3 at seed 200035', () => {
  const out: Record<string, unknown> = {}
  for (const format of ['strokePlay', 'matchPlay', 'team'] as const) {
    const g = gen(200035, { clean: true, format })
    const settings = safeParseSettings(g.settings).data!
    answerSnake(g.snap, settings, (s, t) => computeTournament(s, t))
    const st = computeTournament(g.snap, settings)
    const main = st.prizes.filter((p) => !p.payerId && (p.potId ?? 'main') === 'main').reduce((s, p) => s + p.amount, 0)
    out[format] = { players: g.snap.players.length, pairs: g.snap.pairs.length, teams: g.snap.teams.length, formatOptions: settings.modules.individual.formatOptions, entrants: st.modules.individual?.rows.map((r) => [r.playerId, r.label, r.figure.text, r.entrant.playerIds]), prizes: settings.prizes.stableford, main, entryPot: settings.entryFee * g.snap.players.length, check: checkPrizePool(settings, fieldShape(g.snap, settings)).balanced, warnings: st.flags.warnings }
  }
  writeFileSync('/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/panel/evidence/MONEY/shrink_fmt.result.json', JSON.stringify(out, null, 1))
})
