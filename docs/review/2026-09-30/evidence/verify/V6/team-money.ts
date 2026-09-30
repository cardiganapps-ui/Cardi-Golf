// V6: in the team format, does the champion team's prize reach real people in Dinero?
import { getFixture } from '/home/user/Cardi-Golf/src/dev/fixtures'
import { parseSettings } from '/home/user/Cardi-Golf/src/engine/settings/schema'
import { computeTournament } from '/home/user/Cardi-Golf/src/engine/computeTournament'
for (const name of ['team8', 'scramble8']) {
  const fx = getFixture(name)!
  const snap = structuredClone(fx.snapshot)
  const st = computeTournament(snap, parseSettings(snap.tournament.settings))
  const ids = new Set(snap.players.map((p) => p.id))
  const people = Object.entries(st.money.people)
  const nonPlayers = people.filter(([id]) => !ids.has(id)).map(([id]) => id)
  const prizeRows = Object.entries(st.modules.individual!.prizes).map(([id, p]) => ({ id, isPlayer: ids.has(id), amount: p.amount }))
  const receivers = people.filter(([, m]) => (m as any).receives > 0).map(([id, m]) => ({ id, name: snap.players.find((p) => p.id === id)?.displayName ?? '(not a player)', receives: (m as any).receives }))
  console.log(JSON.stringify({ fixture: name, prizeRows, nonPlayerKeysInMoney: nonPlayers, receivers, banker: st.money.banker, netSum: st.money.netSum }))
}
