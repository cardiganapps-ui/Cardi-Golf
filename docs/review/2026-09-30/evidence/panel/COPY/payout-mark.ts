// Scratch-only: simulate the admin tapping "Pagado" on "Banco paga a Camilo $X" (vía banco),
// which calls setPaymentPaid({kind:'payout', from:null, to, amount: <vía-banco amount>, paid:true}).
import { getFixture } from '/home/user/Cardi-Golf/src/dev/fixtures.ts'
import { computeTournament } from '/home/user/Cardi-Golf/src/engine/computeTournament.ts'
import { parseSettings } from '/home/user/Cardi-Golf/src/engine/settings/index.ts'
const f = getFixture('full12-finished')!
const settings = parseSettings(f.snapshot.tournament.settings)
const before = computeTournament(f.snapshot, settings)
const camilo = f.snapshot.players.find((p) => p.displayName === 'Camilo')!
const tr = before.money.viaBank.find((t) => t.from === null && t.to === camilo.id)!
const gross = before.money.flows.filter((x) => x.kind === 'payout' && x.to === camilo.id).reduce((s, x) => s + x.amount, 0)
console.log('vía banco line: Banco paga a Camilo', tr.amount, '| gross payouts owed to Camilo', gross)
const snap = structuredClone(f.snapshot)
snap.payments.push({ id: 'sim', tournamentId: snap.tournament.id, fromPlayerId: null, toPlayerId: camilo.id, amount: tr.amount, kind: 'payout', paid: true, note: null } as never)
const after = computeTournament(snap, settings)
const flowsPaid = after.money.flows.filter((x) => x.kind === 'payout' && x.to === camilo.id).map((x) => x.paid)
console.log('after tapping Pagado: payout flows paid =', JSON.stringify(flowsPaid), '=> row shows as paid?', flowsPaid.length > 0 && flowsPaid.every(Boolean))
