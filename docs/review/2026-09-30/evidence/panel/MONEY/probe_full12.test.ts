import { it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { getFixture } from '/home/user/Cardi-Golf/src/dev/fixtures'
import { computeTournament } from '/home/user/Cardi-Golf/src/engine/computeTournament'
import { parseSettings } from '/home/user/Cardi-Golf/src/engine/settings/schema'

const OUT = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/panel/evidence/MONEY/full12-finished.dump.json'

it('dump full12-finished', () => {
  const fx = getFixture('full12-finished')!
  const snap = fx.snapshot
  const settings = parseSettings(snap.tournament.settings)
  const st = computeTournament(snap, settings)
  const players = snap.players.map((p) => ({ id: p.id, name: p.displayName, tier: p.tier, base: p.baseHcp, honoree: p.isHonoree }))
  const card = snap.courses[0]!.tees[0]!.holes.map((h) => [h.number, h.par, h.strokeIndex])
  const rounds: Record<string, unknown> = {}
  for (const rid of st.core.roundIds) {
    const r: Record<string, unknown> = {}
    for (const p of snap.players) {
      const pr = st.core.rounds[rid]![p.id]!
      r[p.id] = {
        ph: pr.playingHcp, cut: pr.cut, overridden: pr.overridden, points: pr.points, putts: pr.putts, thru: pr.thru,
        gross: pr.holes.map((h) => (h.pickedUp ? 'X' : h.gross)),
        putt: pr.holes.map((h) => h.putts),
        sr: pr.holes.map((h) => h.strokesReceived),
        pts: pr.holes.map((h) => h.points),
      }
    }
    rounds[rid] = r
  }
  const dump = {
    players, card,
    groups: snap.groups,
    pairs: snap.pairs,
    overrides: snap.handicapOverrides,
    tiebreaks: snap.snakeTiebreaks,
    rounds,
    individual: st.modules.individual!.rows.map((r) => ({ id: r.playerId, label: r.label, total: r.total, perRound: r.perRound.map((x) => x.value), cb: r.countbackWhy })),
    indivPrizes: st.modules.individual!.prizes,
    bestRound: st.modules.bestRound!.days.map((d) => ({ r: d.roundNumber, top: d.rows.slice(0, 3), winners: d.winners })),
    pairsRows: st.modules.pairs!.rows,
    pairsPrizes: st.modules.pairs!.prizes,
    snake: st.modules.snake!.groups.map((g) => ({ r: g.roundNumber, g: g.groupNumber, start: snap.groups.find((x) => x.id === g.groupId)?.startHole, passes: g.passes, holder: g.holderId, pending: g.pendingHole, payouts: Object.fromEntries(Object.entries(g.payouts).map(([k, v]) => [k, v.amount])) })),
    putts: st.modules.fewestPutts!.rows,
    puttsPrizes: st.modules.fewestPutts!.prizes,
    lots: snap.calcuttaLots, buybacks: snap.calcuttaBuybacks,
    auction: { pot: st.modules.auction!.pot, slots: st.modules.auction!.slots, payouts: st.modules.auction!.payouts, unfilled: st.modules.auction!.unfilled, balanced: st.modules.auction!.balanced },
    prizes: st.prizes.map((p) => ({ m: p.moduleId, label: p.label, to: p.playerId, amt: p.amount, final: p.final })),
    money: { banker: st.money.banker, netSum: st.money.netSum, people: st.money.people, viaBank: st.money.viaBank, p2p: st.money.peerToPeer },
    flags: st.flags,
    payments: snap.payments,
  }
  writeFileSync(OUT, JSON.stringify(dump, null, 1))
})
