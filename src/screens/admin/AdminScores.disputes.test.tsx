// @vitest-environment happy-dom
/**
 * COPY-20: a discrepancy is said in words. It read «Día 2. ahora 5/1 (?),
 * antes 6/1 (Damián)»: figures with a slash, «L» for a pick-up and «?» for a
 * write nobody's phone made (the Comité's own).
 */
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import { t } from '../../i18n/es-MX'
import { TournamentContext } from '../tournament/tournamentContext'
import { AdminScores } from './AdminScores'

const SC = t.admin.scores
const IB = t.admin.inbox

/** full12-live with one hole of day 1 disputed: `now` over `before`, each by whom. */
function mount(now: { strokes: number | null; putts: number | null; pickedUp: boolean; by: number | null }, before: { strokes: number | null; putts: number | null; picked_up: boolean; by: number | null }) {
  const fx = getFixture('full12-live')!
  const snap = structuredClone(fx.snapshot)
  const round = snap.rounds.find((r) => r.number === 1)!
  const [a, b, c] = snap.players
  const sc = snap.scores.find((x) => x.roundId === round.id && x.playerId === a!.id && x.hole === 3)!
  const id = (i: number | null) => (i === null ? null : [a, b, c][i]!.id)
  Object.assign(sc, { strokes: now.strokes, putts: now.putts, pickedUp: now.pickedUp, enteredBy: id(now.by), disputed: true, previous: { strokes: before.strokes, putts: before.putts, picked_up: before.picked_up, entered_by: id(before.by) } })
  useTournament.setState({ tournamentId: 'fixture:full12-live', data: dataFromSnapshot(snap), loading: false, error: null, realtime: 'off', reload: async () => undefined } as never)
  render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: snap.tournament.id, slug: '_/full12-live', lookup: fx.lookup, me: fx.me, refresh: async () => undefined, leave: async () => undefined }}>
        <AdminScores />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
  return { names: [a!.displayName, b!.displayName, c!.displayName] }
}

afterEach(() => cleanup())

describe('Comité › Tarjetas: a discrepancy in words (COPY-20)', () => {
  it('each value in golpes and putts, with who captured it; the Comité’s own write is the Comité, never «?»', () => {
    const { names } = mount({ strokes: 5, putts: 1, pickedUp: false, by: null }, { strokes: 6, putts: 1, picked_up: false, by: 1 })
    const line = `${t.round.day(1)}. ${SC.disputeNow('5 golpes, 1 putt', null)} ${SC.disputeBefore('6 golpes, 1 putt', names[1]!)}`
    expect(screen.getByText(line)).toBeTruthy()
    expect(line).toContain('Ahora: 5 golpes, 1 putt (capturó el Comité).')
    expect(screen.queryByText(/5\/1|6\/1|\(\?\)/)).toBeNull()
  })

  it('a pick-up says «levantó», not «L»', () => {
    const { names } = mount({ strokes: null, putts: null, pickedUp: true, by: 2 }, { strokes: 7, putts: 2, picked_up: false, by: 1 })
    expect(screen.getByText(`${t.round.day(1)}. ${SC.disputeNow(IB.scoreValue(null, null, true), names[2]!)} ${SC.disputeBefore('7 golpes, 2 putts', names[1]!)}`)).toBeTruthy()
    expect(IB.scoreValue(null, null, true)).toBe('levantó')
  })
})
