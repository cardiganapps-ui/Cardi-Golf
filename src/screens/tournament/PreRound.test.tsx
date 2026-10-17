// @vitest-environment happy-dom
/**
 * STRAT-10: before the first hole, every player's En vivo was a board of
 * zeros, through the weeks the PINs are out and all of Calcutta night. Now,
 * above that board: the next day with its date and course, how long to go,
 * his group (its tee time, starting hole and who is in it), his tee, his
 * handicap for the day with its «¿Cómo se calculó?», and what he still owes,
 * each line only where the tournament has it. It goes once a hole is saved.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import type { Snapshot } from '../../engine/types'
import { t } from '../../i18n/es-MX'
import type { TournamentCtx } from './tournamentContext'
import { TournamentContext } from './tournamentContext'
import { countdownText, preRoundInfo } from './preRoundInfo'
import { words } from '../../engine/testing/words'

vi.mock('../../data/profiles', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../data/profiles')>()), useTournamentProfiles: () => [[], () => undefined] }))
const { LiveScreen } = await import('./LiveScreen')

const P = t.live.pre

function open(fixture: string, edit: (s: Snapshot) => void = () => undefined, ctx: Partial<TournamentCtx> = {}) {
  const fx = getFixture(fixture)!
  const snap = structuredClone(fx.snapshot)
  edit(snap)
  const data = dataFromSnapshot(snap)
  useTournament.setState({ tournamentId: `fixture:${fixture}`, data, loading: false, error: null, realtime: 'off' })
  render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: snap.tournament.id, slug: `_/${fixture}`, lookup: fx.lookup, me: fx.me, refresh: async () => undefined, leave: async () => undefined, ...ctx }}>
        <LiveScreen />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
  return { snap, data }
}
const block = () => screen.queryByRole('region', { name: new RegExp(`^${P.title}`) })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  // A month before the first fixture's day 1, 10 a.m. in Mazatlán.
  vi.setSystemTime(new Date('2027-03-09T17:00:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

describe('En vivo before the first hole (STRAT-10)', () => {
  it('Calcutta night: the day, its date and course, the countdown, his group, tee and handicap', () => {
    const { snap, data } = open('auction12', (s) => {
      s.groups = s.groups.map((g) => ({ ...g, teeTime: `09:${String((g.number - 1) * 10).padStart(2, '0')}` }))
    })
    const region = block()!
    expect(region).toBeTruthy()
    const r = within(region)
    expect(r.getByText(`${P.title}: ${P.day(1, 2)}`)).toBeTruthy()
    expect(r.getByText(`viernes, 9 de abril, ${snap.courses[0]!.name}`)).toBeTruthy()
    // p9 plays in group 3, at 09:20: 31 days from 9 March in Mazatlán's calendar.
    expect(r.getByText(P.days(31))).toBeTruthy()
    const mates = snap.groups.find((g) => g.roundId === 'r1' && g.playerIds.includes('p9'))!.playerIds.filter((id) => id !== 'p9').map((id) => snap.players.find((p) => p.id === id)!.displayName)
    expect(r.getByText(P.groupLine(3, '09:20', 1))).toBeTruthy()
    expect(r.getByText(P.groupWith(mates))).toBeTruthy()
    expect(r.getByText(data.state.core.rounds.r1!.p9!.tee!.name)).toBeTruthy()
    expect(r.getByText(String(data.state.core.rounds.r1!.p9!.playingHcp))).toBeTruthy()
  })

  it('the handicap opens how it was calculated: from his base to the day', async () => {
    const { data } = open('auction12')
    const pr = data.state.core.rounds.r1!.p9!
    await act(async () => fireEvent.click(within(block()!).getByRole('button', { name: t.money.howCalculatedOf(`${P.hcp}, ${pr.playingHcp}`) })))
    const sheet = screen.getByRole('dialog')
    expect(within(sheet).getByText(words(pr.playingHcpWhy).title)).toBeTruthy()
  })

  it('what he still owes, by kind, when the tournament moves money', () => {
    open('minimal4-setup')
    expect(within(block()!).getByText(P.owesLine('$500', [P.part(t.moneyScreen.owesEntry, '$500')]))).toBeTruthy()
  })

  it('nothing owed once paid; no money line in a tournament without money', () => {
    open('minimal4-setup', (s) => {
      s.payments.push({ id: 'pay1', fromPlayerId: 'p1', toPlayerId: null, amount: 500, kind: 'entry', paid: true, note: null })
    })
    expect(within(block()!).getByText(P.paid)).toBeTruthy()
    cleanup()
    open('gloria4', (s) => {
      s.scores = []
      s.rounds = s.rounds.map((r) => ({ ...r, status: 'scheduled' }))
    })
    expect(within(block()!).queryByText(P.owes)).toBeNull()
    expect(within(block()!).queryByText(P.money)).toBeNull()
  })

  it('no groups yet: says so, and a link to watch sees the day only', () => {
    open('calcutta12', (s) => {
      s.groups = []
    })
    expect(within(block()!).getByText(P.noGroup)).toBeTruthy()
    cleanup()
    open('calcutta12', () => undefined, { me: { playerId: null, isOrganizer: false, isComite: false, via: null }, spectator: { money: false, url: 'https://polo.example/v/x' } })
    const r = within(block()!)
    expect(r.queryByText(P.group)).toBeNull()
    expect(r.queryByText(P.hcp)).toBeNull()
    expect(r.getByText(P.days(31))).toBeTruthy()
  })

  it('goes once a hole is saved, and never shows on a tournament under way', () => {
    open('auction12', (s) => {
      s.scores.push({ roundId: 'r1', playerId: 'p1', hole: 1, strokes: 4, putts: 2, pickedUp: false, enteredBy: 'p1', updatedAt: null })
    })
    expect(block()).toBeNull()
    cleanup()
    open('full12-live')
    expect(block()).toBeNull()
  })
})

describe('the countdown words', () => {
  it('days, tomorrow, today with the hours left, nothing once started', () => {
    expect(countdownText({ unit: 'days', n: 12 })).toBe('Faltan 12 días')
    expect(countdownText({ unit: 'tomorrow' })).toBe(P.tomorrow)
    expect(countdownText({ unit: 'today', hours: 2, minutes: 35 })).toBe('Salen en 2 horas y 35 min')
    expect(countdownText({ unit: 'today', hours: 0, minutes: 20 })).toBe('Salen en 20 min')
    expect(countdownText({ unit: 'today', hours: null, minutes: null })).toBe(P.today)
    expect(countdownText({ unit: 'started' })).toBeNull()
  })
  it('a tournament with no date says no countdown, and a day with no course names none', () => {
    const fx = getFixture('new-setup')!
    const info = preRoundInfo(dataFromSnapshot(structuredClone(fx.snapshot)), null, true)!
    expect(info.at).toBeNull()
    expect(info.course).toBeNull()
    expect(info.days).toBe(2)
  })
})
