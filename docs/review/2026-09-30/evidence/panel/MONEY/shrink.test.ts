/** Print the minimal counter-examples found by prop.test.ts in full. */
import { it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { computeTournament } from '/home/user/Cardi-Golf/src/engine/computeTournament'
import { safeParseSettings } from '/home/user/Cardi-Golf/src/engine/settings/schema'
import { answerSnake, gen } from './gen'

const OUT = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/panel/evidence/MONEY/shrink.result.json'

it('dump minimal counter-examples', () => {
  const out: Record<string, unknown> = {}
  const show = (key: string, seed: number, clean: boolean) => {
    const g = gen(seed, { clean })
    const settings = safeParseSettings(g.settings).data!
    if (clean) answerSnake(g.snap, settings, (s, t) => computeTournament(s, t))
    const st = computeTournament(g.snap, settings)
    out[key] = {
      seed,
      players: g.snap.players.map((p) => ({ id: p.id, tier: p.tier, base: p.baseHcp })),
      rounds: g.snap.rounds.map((r) => ({ id: r.id, holes: r.holes, status: r.status })),
      games: settings.games,
      payout: settings.auction.payout,
      lots: g.snap.calcuttaLots,
      buybacks: g.snap.calcuttaBuybacks,
      auction: st.modules.auction ? { pot: st.modules.auction.pot, unfilled: st.modules.auction.unfilled, balanced: st.modules.auction.balanced, slots: st.modules.auction.slots.map((s) => ({ label: s.label, share: s.share, ids: s.playerIds, amount: s.amount, unfilled: s.unfilled, why: s.why.steps })), payouts: st.modules.auction.payouts } : null,
      individual: st.modules.individual?.rows.map((r) => [r.playerId, r.label, r.total, r.thru]),
      gamesState: Object.fromEntries(Object.entries(st.games).map(([k, v]) => [k, { pot: v.pot, entrants: v.entrants, final: v.final, state: v.state, board: v.board }])),
      prizes: st.prizes.filter((p) => p.gameId || p.moduleId === 'auction').map((p) => ({ m: p.moduleId, g: p.gameId, to: p.playerId, amt: p.amount, label: p.label, why: p.why })),
      warnings: st.flags.warnings,
      bank: st.money.banker,
    }
  }
  show('P2-calcutta-half-peso', 324, false)
  show('P3-side-lowScore', 102053, true)
  show('P3-side-eventPot', 100433, true)
  writeFileSync(OUT, JSON.stringify(out, null, 1))
})
