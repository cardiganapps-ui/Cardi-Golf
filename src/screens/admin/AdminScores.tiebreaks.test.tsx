// @vitest-environment happy-dom
/**
 * UX-22: an answered «¿Quién embocó al último?» could never be corrected, by
 * the group or the Comité; a thumb on the wrong name decided who carried the
 * snake. Comité › Tarjetas now lists each answer, who gave it, and «Cambiar».
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import type { TournamentSettings } from '../../engine/settings/schema'
import { t } from '../../i18n/es-MX'
import { TournamentContext } from '../tournament/tournamentContext'

const api = vi.hoisted(() => ({ answerTiebreak: vi.fn(async () => undefined) }))
vi.mock('../../data/api', async (orig) => ({ ...(await orig<typeof import('../../data/api')>()), answerTiebreak: api.answerTiebreak }))
const { AdminScores } = await import('./AdminScores')
const IB = t.admin.inbox

/** full12-live with a tie on day 1: two of a group 3-putted hole 4, and one of them answered. */
function mount() {
  const fx = getFixture('full12-live')!
  const snap = structuredClone(fx.snapshot)
  const st = snap.tournament.settings as TournamentSettings
  snap.tournament.settings = { ...st, modules: { ...st.modules, snake: { ...st.modules.snake, enabled: true } } }
  const round = snap.rounds.find((r) => r.number === 1)!
  const group = snap.groups.find((g) => g.roundId === round.id)!
  const [a, b, c] = group.playerIds as [string, string, string]
  for (const pid of [a, b]) {
    const sc = snap.scores.find((x) => x.roundId === round.id && x.playerId === pid && x.hole === 4)
    if (sc) sc.putts = 3
    else snap.scores.push({ roundId: round.id, playerId: pid, hole: 4, strokes: 6, putts: 3, pickedUp: false, enteredBy: pid, updatedAt: '2027-04-09T16:00:00Z' })
  }
  snap.snakeTiebreaks = [{ roundId: round.id, groupId: group.id, hole: 4, lastHoledPlayerId: a, decidedBy: c }]
  useTournament.setState({ tournamentId: 'fixture:full12-live', data: dataFromSnapshot(snap), loading: false, error: null, realtime: 'off', reload: async () => undefined } as never)
  render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: snap.tournament.id, slug: '_/full12-live', lookup: fx.lookup, me: fx.me, refresh: async () => undefined, leave: async () => undefined }}>
        <AdminScores />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
  const name = (id: string) => snap.players.find((p) => p.id === id)!.displayName
  return { round, group, a, b, c, name, me: fx.me }
}

beforeEach(() => api.answerTiebreak.mockClear())
afterEach(() => cleanup())

describe('Comité › Tarjetas: answered snake tiebreaks can be changed (UX-22)', () => {
  it('lists the answer with who holed out last and who said so', () => {
    const { group, a, c, name } = mount()
    const section = screen.getByText(IB.answeredTitle).closest('section')!
    expect(within(section).getByText(IB.tiebreak(group.number, 4))).toBeTruthy()
    expect(within(section).getByText(IB.answeredSub(t.round.day(1), name(a), name(c)))).toBeTruthy()
  })

  it('«Cambiar» offers the two at 3 putts, the current one pressed, and saves the other with the Comité as who decided', async () => {
    const { round, group, a, b, name, me } = mount()
    fireEvent.click(within(screen.getByText(IB.answeredTitle).closest('section')!).getByRole('button', { name: IB.change }))
    const sheet = screen.getByRole('dialog', { name: IB.changeTitle(group.number, 4) })
    const options = within(sheet).getAllByRole('button').filter((x) => x.getAttribute('aria-pressed') !== null)
    expect(options.map((x) => x.textContent)).toEqual([name(a), name(b)])
    expect(within(sheet).getByRole('button', { name: name(a) }).getAttribute('aria-pressed')).toBe('true')
    await act(async () => fireEvent.click(within(sheet).getByRole('button', { name: name(b) })))
    expect(api.answerTiebreak).toHaveBeenCalledWith({ round_id: round.id, group_id: group.id, hole: 4, last_holed_player_id: b, decided_by: me.playerId })
  })

  it('tapping the answer it already has changes nothing', async () => {
    const { group, a, name } = mount()
    fireEvent.click(within(screen.getByText(IB.answeredTitle).closest('section')!).getByRole('button', { name: IB.change }))
    const sheet = screen.getByRole('dialog', { name: IB.changeTitle(group.number, 4) })
    await act(async () => fireEvent.click(within(sheet).getByRole('button', { name: name(a) })))
    expect(api.answerTiebreak).not.toHaveBeenCalled()
  })
})
