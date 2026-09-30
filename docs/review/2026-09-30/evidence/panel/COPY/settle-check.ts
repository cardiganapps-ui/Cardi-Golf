// Scratch-only: for full12-finished, compare what the two "Liquidación" lists tell
// each person to pay/receive against what the ledger says they have already paid.
import { getFixture } from '/home/user/Cardi-Golf/src/dev/fixtures.ts'
import { computeTournament } from '/home/user/Cardi-Golf/src/engine/computeTournament.ts'
import { parseSettings } from '/home/user/Cardi-Golf/src/engine/settings/index.ts'

const f = getFixture(process.argv[2] ?? 'full12-finished')!
const settings = parseSettings(f.snapshot.tournament.settings)
const s = computeTournament(f.snapshot, settings)
const name = (id: string | null) => (id ? f.snapshot.players.find((p) => p.id === id)?.displayName ?? id : 'BANCO')
console.log('tournamentFinal', s.tournamentFinal, 'banker', name(s.money.banker.playerId), 'difference', s.money.banker.difference)
console.log('payments rows (paid):', f.snapshot.payments.filter((p) => p.paid).map((p) => `${p.kind} ${name(p.fromPlayerId)}→${name(p.toPlayerId)} ${p.amount}`).join(' | '))
const rows: string[] = []
for (const p of f.snapshot.players) {
  const m = s.money.people[p.id]!
  const flowsOut = s.money.flows.filter((x) => x.from === p.id)
  const paidOut = flowsOut.filter((x) => x.paid).reduce((a, x) => a + x.amount, 0)
  const unpaidOut = flowsOut.filter((x) => !x.paid && ['entry', 'calcutta', 'buyback', 'side'].includes(x.kind)).reduce((a, x) => a + x.amount, 0)
  const vb = s.money.viaBank.filter((t) => t.from === p.id || t.to === p.id).map((t) => (t.from === p.id ? -t.amount : t.amount)).reduce((a, x) => a + x, 0)
  // If a person follows both lists: pays the unpaid checklist items AND settles the vía-banco line.
  const followBoth = m.net + 0 // true net is m.net (receives − all obligations)
  const cashAfterBoth = -paidOut - unpaidOut + vb // what his wallet shows if he already paid `paidOut`, pays checklist, then vía banco
  rows.push(`${name(p.id).padEnd(10)} net ${String(m.net).padStart(7)} | 'Pagó' shown ${String(m.paid).padStart(6)} (actually marked paid ${String(paidOut).padStart(5)}) | checklist unpaid ${String(unpaidOut).padStart(5)} | vía banco ${String(vb).padStart(7)} | wallet if he follows checklist + vía banco ${String(cashAfterBoth).padStart(7)} vs true net ${followBoth}`)
}
console.log(rows.join('\n'))
