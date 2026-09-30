import { it } from 'vitest'
import { computeTournament } from '/home/user/Cardi-Golf/src/engine/computeTournament'
import { FIRST_TOURNAMENT_SETTINGS } from '/home/user/Cardi-Golf/src/engine/settings/presets'
import { fillRound, makeFirstTournament } from '/home/user/Cardi-Golf/src/engine/testing/fixtures'
import { splitPrizes } from '/home/user/Cardi-Golf/src/engine/core/ranking'
it('money inside explanations', () => {
  const snap = makeFirstTournament()
  fillRound(snap, 'r1', 11); fillRound(snap, 'r2', 12)
  snap.rounds.forEach((r) => (r.status = 'finished')); snap.tournament.status = 'finished'
  const st = computeTournament(snap, FIRST_TOURNAMENT_SETTINGS)
  const first = st.prizes.find((p) => p.moduleId === 'individual')!
  console.log('PRIZE', first.label, first.amount, JSON.stringify(first.why))
  const tie = splitPrizes([{ position: 1, members: ['A', 'B'] }], [10000, 5000], (x) => x)
  console.log('TIE', JSON.stringify(tie[0]!.why))
})
