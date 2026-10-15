// @vitest-environment happy-dom
/**
 * TRUST-14: a Comité correction of a hole (admin_save_score, «Aplicar» in Pendientes, a discrepancy resolved)
 * wrote the score with its reason, and only the Comité's history showed it: the player whose card it was saw no
 * mark and no reason, heard nothing, and nobody but the Comité could read how a card got to what it holds. The
 * reason now rides the score (it was fetched and dropped), the Tarjeta's grid marks the hole and says what the
 * Comité decided, the player's sheet lists it and reads the card's history (0062 `card_history`), and the player
 * gets a notice that opens his own sheet (0062).
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../data/profiles', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../data/profiles')>()), useTournamentProfiles: () => [[], () => undefined] }))
vi.mock('../../data/cardHistory', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../data/cardHistory')>()), cardHistory: vi.fn() }))

import { getFixture } from '../../dev/fixtures'
import { cardHistory, holeTrails, type CardStep } from '../../data/cardHistory'
import { ApiError } from '../../data/api'
import { mapScore } from '../../data/mappers'
import { forSpectators } from '../../data/spectator'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import type { TournamentSettings } from '../../engine/settings/schema'
import type { Snapshot } from '../../engine/types'
import { t } from '../../i18n/es-MX'
import { COMITE_REASONS, correctionLine } from '../../lib/comiteReasons'
import { localWhen } from '../../lib/localWhen'
import { noticeLine } from '../../lib/noticeText'
import { PlayerSheet } from './PlayerSheet'
import { tournamentPushHint } from './pushHint'
import { ScoreGrid } from './scorecard/ScoreGrid'
import { TournamentContext } from './TournamentGate'

const { LiveScreen } = await import('./LiveScreen')

const S = t.card
const H = t.card.history
const REASON = 'Se apuntó un 6; era un 5'
beforeEach(() => vi.mocked(cardHistory).mockReset())
afterEach(cleanup)

/** The live fixture with the first player's hole 3 corrected by the Comité. */
function corrected() {
  const fx = getFixture('minimal4-live')!
  const snap: Snapshot = structuredClone(fx.snapshot)
  const round = snap.rounds.find((r) => r.status === 'live')!
  const group = snap.groups.find((g) => g.roundId === round.id && g.playerIds.includes(fx.me.playerId!))!
  const who = group.playerIds[0]!
  const s = snap.scores.find((x) => x.roundId === round.id && x.playerId === who && x.hole === 3)
  if (s) s.reason = REASON
  else snap.scores.push({ roundId: round.id, playerId: who, hole: 3, strokes: 5, putts: 2, pickedUp: false, enteredBy: null, updatedAt: null, reason: REASON })
  return { fx, snap, round, group, who }
}

/** The player's sheet, on a tournament the store holds as the server's (`fixture` false) or as a fixture's. */
function openSheet(o: { spectator?: boolean; fixture?: boolean } = {}) {
  const { fx, snap, who } = corrected()
  useTournament.setState({ tournamentId: o.fixture ? 'fixture:minimal4-live' : snap.tournament.id, data: dataFromSnapshot(snap), loading: false, error: null, realtime: 'off' })
  render(
    <MemoryRouter>
      <TournamentContext.Provider
        value={{ tournamentId: snap.tournament.id, slug: '_/minimal4-live', lookup: fx.lookup, me: fx.me, refresh: async () => undefined, leave: async () => undefined, ...(o.spectator ? { spectator: { money: false, url: '/v/abcdefghijklmnopqrstuvwx' } } : {}) }}
      >
        <PlayerSheet playerId={who} onClose={() => undefined} />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
  return { snap, who, sheet: within(screen.getByRole('dialog')) }
}

describe('the reason rides the score (TRUST-14)', () => {
  it('a row with a reason keeps it; a row with none or a blank one carries no key at all, as before', () => {
    const row = { round_id: 'r', player_id: 'p', hole: 3, strokes: 5, putts: 2, picked_up: false }
    expect(mapScore({ ...row, reason: REASON }).reason).toBe(REASON)
    expect('reason' in mapScore({ ...row, reason: null })).toBe(false)
    expect('reason' in mapScore({ ...row, reason: '   ' })).toBe(false)
    expect('reason' in mapScore(row)).toBe(false)
  })

  it('the engine marks the hole with it, and only that hole', () => {
    const { snap, round, who } = corrected()
    const holes = dataFromSnapshot(snap).state.core.rounds[round.id]![who]!.holes
    expect(holes.find((h) => h.hole === 3)!.correction).toBe(REASON)
    expect(holes.filter((h) => 'correction' in h)).toHaveLength(1)
  })

  it('a link to watch never carries it: the Comité’s words stay with the members', () => {
    const { snap } = corrected()
    expect(forSpectators(snap, false, 'link').scores.some((s) => 'reason' in s)).toBe(false)
    expect(forSpectators(snap, true, 'link').scores.some((s) => 'reason' in s)).toBe(false)
  })
})

describe('what the Comité decided, in the card’s words', () => {
  it('a typed reason is quoted; the server’s own words for a correction and a discrepancy say what happened', () => {
    expect(correctionLine(3, 'Ana', REASON)).toBe('Hoyo 3, Ana: lo corrigió el Comité. «Se apuntó un 6; era un 5»')
    expect(correctionLine(3, null, COMITE_REASONS.correction)).toBe('Hoyo 3: lo corrigió el Comité.')
    expect(correctionLine(7, null, COMITE_REASONS.kept)).toBe('Hoyo 7: el Comité resolvió la discrepancia y dejó el valor que tenía.')
    expect(correctionLine(7, null, COMITE_REASONS.restored)).toBe('Hoyo 7: el Comité resolvió la discrepancia y regresó el valor anterior.')
  })

  it('those words are the ones the server writes (0026), so a change there fails here', () => {
    const sql = readFileSync('supabase/migrations/0026_save_hole.sql', 'utf8')
    expect(sql).toContain(`coalesce(r, '${COMITE_REASONS.correction}')`)
    expect(sql).toContain(`reason = '${COMITE_REASONS.kept}'`)
    expect(sql).toContain(`reason = '${COMITE_REASONS.restored}'`)
  })
})

describe('the Tarjeta’s grid', () => {
  it('marks the corrected hole and says why under the grid, naming the player when the grid has more than one', () => {
    const { snap, round, group } = corrected()
    const data = dataFromSnapshot(snap)
    const named = group.playerIds.map((id) => ({ id, name: snap.players.find((p) => p.id === id)!.displayName }))
    const order = Array.from({ length: 18 }, (_, i) => ((group.startHole - 1 + i) % 18) + 1)
    render(<ScoreGrid named={named} roundState={data.state.core.rounds[round.id]!} order={order} hole={4} pointsCount net onOpen={() => undefined} savedNote={null} onUndo={() => undefined} />)
    expect(screen.getAllByText(S.corrected)).toHaveLength(1)
    const list = screen.getByRole('list', { name: S.correctionsTitle })
    expect(within(list).getByText(correctionLine(3, named[0]!.name, REASON))).toBeTruthy()
  })
})

describe('the player’s sheet', () => {
  it('lists his corrections with their reason under that day’s card', () => {
    const { sheet } = openSheet({ fixture: true })
    expect(sheet.getByRole('list', { name: S.correctionsTitle }).textContent).toBe(correctionLine(3, null, REASON))
  })

  it('reads the card’s history on a tap: each value, who wrote it, when, and the Comité’s reason; focus lands on it', async () => {
    const { snap, who } = corrected()
    const round = snap.rounds.find((r) => r.status === 'live')!
    const steps: CardStep[] = [
      { roundId: round.id, round: round.number, hole: 3, at: '2027-04-09T16:41:00Z', before: null, after: { strokes: 6, putts: 2, pickedUp: false }, by: 'Ana', comite: false, reason: null },
      { roundId: round.id, round: round.number, hole: 3, at: '2027-04-09T22:02:00Z', before: { strokes: 6, putts: 2, pickedUp: false }, after: { strokes: 5, putts: 1, pickedUp: false }, by: null, comite: true, reason: REASON },
      // A hole captured once by a player is the card itself: not in the history.
      { roundId: round.id, round: round.number, hole: 4, at: '2027-04-09T16:50:00Z', before: null, after: { strokes: 4, putts: 2, pickedUp: false }, by: 'Ana', comite: false, reason: null },
    ]
    vi.mocked(cardHistory).mockResolvedValue(steps)
    const { sheet } = openSheet()
    await act(async () => fireEvent.click(sheet.getByRole('button', { name: H.show })))
    expect(vi.mocked(cardHistory)).toHaveBeenCalledWith(snap.tournament.id, who)
    const heading = sheet.getByRole('heading', { name: H.title })
    await waitFor(() => expect(document.activeElement).toBe(heading))
    const tz = snap.tournament.timezone
    expect(sheet.getByText(H.step(localWhen('2027-04-09T16:41:00Z', tz), 'Ana', '6 golpes, 2 putts', null))).toBeTruthy()
    expect(sheet.getByText(H.step(localWhen('2027-04-09T22:02:00Z', tz), 'el Comité', '5 golpes, 1 putt', `«${REASON}»`))).toBeTruthy()
    expect(sheet.queryByText(t.round.hole(4))).toBeNull()
  })

  it('says when no hole changed, when the server has no history yet, and an error with a way to ask again', async () => {
    vi.mocked(cardHistory).mockResolvedValueOnce([])
    const first = openSheet()
    await act(async () => fireEvent.click(first.sheet.getByRole('button', { name: H.show })))
    expect(first.sheet.getByText(H.none)).toBeTruthy()
    cleanup()
    vi.mocked(cardHistory).mockResolvedValueOnce('unavailable')
    const second = openSheet()
    await act(async () => fireEvent.click(second.sheet.getByRole('button', { name: H.show })))
    expect(second.sheet.getByText(H.unavailable)).toBeTruthy()
    cleanup()
    vi.mocked(cardHistory).mockRejectedValueOnce(new ApiError('Solo quien está en el torneo ve sus tarjetas', '42501'))
    const third = openSheet()
    await act(async () => fireEvent.click(third.sheet.getByRole('button', { name: H.show })))
    expect(third.sheet.getByRole('alert')).toBeTruthy()
    vi.mocked(cardHistory).mockResolvedValueOnce([])
    await act(async () => fireEvent.click(third.sheet.getByRole('button', { name: t.common.retry })))
    expect(third.sheet.getByText(H.none)).toBeTruthy()
  })

  it('a link to watch and the in-memory fixtures never ask: no session there, no server here', () => {
    openSheet({ spectator: true })
    expect(screen.queryByRole('button', { name: H.show })).toBeNull()
    cleanup()
    openSheet({ fixture: true })
    expect(screen.queryByRole('button', { name: H.show })).toBeNull()
    expect(vi.mocked(cardHistory)).not.toHaveBeenCalled()
  })
})

describe('the history’s holes', () => {
  const step = (hole: number, at: string, o: Partial<CardStep> = {}): CardStep => ({
    roundId: 'r',
    round: 1,
    hole,
    at,
    before: null,
    after: { strokes: 4, putts: 2, pickedUp: false },
    by: 'Ana',
    comite: false,
    reason: null,
    ...o,
  })
  it('a hole that changed, or that the Comité decided, by day and hole, its steps oldest first', () => {
    const trails = holeTrails([
      step(9, '2027-04-09T17:00:00Z'),
      step(5, '2027-04-09T18:00:00Z', { before: { strokes: 4, putts: 2, pickedUp: false }, after: { strokes: 5, putts: 2, pickedUp: false } }),
      step(5, '2027-04-09T16:00:00Z'),
      step(2, '2027-04-09T16:30:00Z', { by: null, comite: true, reason: COMITE_REASONS.correction }),
      step(1, '2027-04-10T16:00:00Z', { round: 2, roundId: 'r2', by: null, comite: true, after: null }),
    ])
    expect(trails.map((h) => `${h.round}:${h.hole}:${h.steps.length}`)).toEqual(['1:2:1', '1:5:2', '2:1:1'])
    expect(trails[1]!.steps.map((s) => s.at)).toEqual(['2027-04-09T16:00:00Z', '2027-04-09T18:00:00Z'])
  })
})

describe('the notice (0062)', () => {
  it('says the day, never the hole, the values or who, and opens his own sheet on En vivo', () => {
    const n = noticeLine({ kind: 'score_corrected', data: { tournament: 'Ensayo', slug: 'ensayo', round: 1, hole: 3 }, actor: null })
    expect(n).toEqual({ text: t.social.notice.score_corrected('Ensayo', 1), to: '/t/ensayo?jugador=yo', title: 'Ensayo', body: t.social.notice.scoreCorrectedBody(1) })
    expect(n.text).toBe('El Comité corrigió tu tarjeta del día 1 en Ensayo')
  })

  it('En vivo opens this phone’s own player’s sheet from it', () => {
    const fx = getFixture('full12-live')!
    const snap = structuredClone(fx.snapshot)
    useTournament.setState({ tournamentId: 'fixture:full12-live', data: dataFromSnapshot(snap), loading: false, error: null, realtime: 'off' })
    render(
      <MemoryRouter initialEntries={['/t/_/full12-live?jugador=yo']}>
        <TournamentContext.Provider value={{ tournamentId: snap.tournament.id, slug: '_/full12-live', lookup: fx.lookup, me: fx.me, refresh: async () => undefined, leave: async () => undefined }}>
          <LiveScreen />
        </TournamentContext.Provider>
      </MemoryRouter>,
    )
    const mine = snap.players.find((p) => p.id === fx.me.playerId)!
    expect(screen.getByRole('dialog', { name: mine.fullName })).toBeTruthy()
  })

  it('«Avisos del torneo» promises it, and a card to sign wherever cards are signed (the marker’s rule too)', () => {
    const base = structuredClone(getFixture('minimal4-live')!.snapshot.tournament.settings) as TournamentSettings
    base.modules.pairs.enabled = false
    delete base.cardSigning
    expect(tournamentPushHint(base)).toContain(t.push.tournament.corrected)
    expect(tournamentPushHint(base)).not.toContain(t.push.tournament.card)
    expect(tournamentPushHint({ ...base, cardSigning: 'marker' })).toContain(t.push.tournament.card)
  })
})
