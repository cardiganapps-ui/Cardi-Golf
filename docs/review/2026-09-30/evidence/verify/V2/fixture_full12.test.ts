import { writeFileSync } from 'node:fs'
import { it } from 'vitest'
import { getFixture } from '/home/user/Cardi-Golf/src/dev/fixtures'
import { computeTournament } from '/home/user/Cardi-Golf/src/engine/computeTournament'

it('full12-finished fixture: status, pending snake tiebreaks, bank', () => {
  const f = getFixture('full12-finished')!
  const s = f.snapshot
  const st = computeTournament(s, s.tournament.settings as never)
  const r = {
    status: s.tournament.status,
    rounds: s.rounds.map((x) => `${x.number}:${x.status}:${x.holes}`),
    tournamentFinal: st.tournamentFinal,
    pendingSnake: st.flags.pendingSnakeTiebreaks.map((q) => `${q.roundId}/${q.groupId}/h${q.hole}`),
    bank: st.money.banker,
    warnings: st.flags.warnings,
  }
  writeFileSync('/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V2/fixture_full12.result.json', JSON.stringify(r, null, 1))
  console.log(JSON.stringify(r))
})
