// @vitest-environment happy-dom
/**
 * UX-06: «Para empezar» at the top of Comité › Torneo. Each line says what is
 * done or missing and opens the section that fixes it; a screen reader hears
 * which is which. «Listo para jugar» waits for the PINs and for anything the
 * engine still warns about; once the tournament is under way the card
 * prepares the next day. The card and the Torneo tab read one answer about
 * the PINs, asked again whenever it could have changed.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ playersWithPin: vi.fn(), tournamentProfiles: vi.fn(async () => [] as unknown[]) }))
vi.mock('../../data/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../data/api')>()), playersWithPin: api.playersWithPin }))
vi.mock('../../data/profiles', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../data/profiles')>()), tournamentProfiles: api.tournamentProfiles }))

import { FixtureGate } from '../../dev/FixtureGate'
import { getFixture } from '../../dev/fixtures'
import { entryChanged } from '../../data/entryEvents'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import { makePlayer, makeRound } from '../../engine/testing/fixtures'
import type { TournamentSettings } from '../../engine/settings/schema'
import type { Snapshot } from '../../engine/types'
import { t } from '../../i18n/es-MX'
import { TournamentContext } from '../tournament/TournamentGate'
import { AdminLayout } from './AdminLayout'
import { ReadinessCard } from './ReadinessCard'

const R = t.admin.ready
const LISTO = /^Listo para jugar: /
let tid = 0

function snapshotOf(name: string, edit?: (s: Snapshot) => void) {
  const snapshot = structuredClone(getFixture(name)!.snapshot)
  edit?.(snapshot)
  return snapshot
}

function provider(name: string, tournamentId: string, children: React.ReactNode) {
  return (
    <TournamentContext.Provider value={{ tournamentId, slug: 'viaje', lookup: getFixture(name)!.lookup, me: { playerId: null, isOrganizer: true, isAdmin: true }, refresh: async () => undefined, leave: async () => undefined }}>
      {children}
    </TournamentContext.Provider>
  )
}

/** The card alone, on a real tournament (the store and the context share its id). */
function mount(name: string, edit?: (s: Snapshot) => void, tournamentId = `t-real-${++tid}`) {
  useTournament.setState({ tournamentId, data: dataFromSnapshot(snapshotOf(name, edit)) })
  return render(<MemoryRouter>{provider(name, tournamentId, <ReadinessCard />)}</MemoryRouter>)
}

/** The Comité as the app routes it: the tabs (AdminLayout) around Torneo (the card) or Jugadores. */
function mountComite(name: string, edit?: (s: Snapshot) => void, tournamentId = `t-real-${++tid}`) {
  const snapshot = snapshotOf(name, edit)
  useTournament.setState({ tournamentId, data: dataFromSnapshot(snapshot) })
  const view = render(
    <MemoryRouter initialEntries={['/t/viaje/admin/torneo']}>
      {provider(
        name,
        tournamentId,
        <Routes>
          <Route path="/t/viaje/admin" element={<AdminLayout />}>
            <Route path="torneo" element={<ReadinessCard />} />
            <Route path="jugadores" element={<p>Jugadores</p>} />
          </Route>
        </Routes>,
      )}
    </MemoryRouter>,
  )
  const tab = () => screen.getByRole('link', { name: new RegExp(`^${t.admin.sections.tournament}`) })
  const go = async (section: 'jugadores' | 'torneo') => {
    await act(async () => fireEvent.click(screen.getByRole('link', { name: new RegExp(`^${section === 'torneo' ? t.admin.sections.tournament : t.admin.sections.players}`) })))
  }
  return { ...view, snapshot, tab, go }
}

const pinsOf = (ids: string[]) => new Set(ids)

afterEach(() => {
  cleanup()
  api.playersWithPin.mockReset()
  api.tournamentProfiles.mockReset()
  api.tournamentProfiles.mockResolvedValue([])
})

describe('Para empezar (UX-06)', () => {
  it('a new tournament: each missing thing links to the section that fixes it', () => {
    api.playersWithPin.mockResolvedValue(new Set())
    mount('new-setup')
    expect(screen.getByRole('heading', { name: R.title })).toBeTruthy()
    const players = screen.getByRole('link', { name: `${R.todoLabel}: ${R.playersMissing}` })
    expect(players.getAttribute('href')).toBe('/t/viaje/admin/jugadores')
    const rounds = screen.getByRole('link', { name: `${R.todoLabel}: ${R.roundSetupMissing('día 1 y día 2')}` })
    expect(rounds.getAttribute('href')).toBe('/t/viaje/admin/rondas')
    expect(screen.getByRole('link', { name: `${R.doneLabel}: ${R.rounds(2)}` })).toBeTruthy()
  })

  it('the PIN line arrives with the server\'s answer', async () => {
    api.playersWithPin.mockResolvedValue(pinsOf(['p1', 'p2', 'p3']))
    const { unmount } = mount('minimal4-setup', undefined, 't-pins')
    expect(await screen.findByRole('link', { name: `${R.todoLabel}: ${R.pinsMissing(1)}` })).toBeTruthy()
    expect(api.playersWithPin).toHaveBeenCalledWith('t-pins')
    // A PIN set on this phone (setPlayerPin calls entryChanged): the card asks again.
    api.playersWithPin.mockResolvedValue(pinsOf(['p1', 'p2', 'p3', 'p4']))
    await act(async () => entryChanged())
    expect(await screen.findByText(LISTO)).toBeTruthy()
    expect(api.playersWithPin).toHaveBeenCalledTimes(2)
    unmount()
  })

  it('a player linked to an account needs no PIN', async () => {
    api.playersWithPin.mockResolvedValue(pinsOf(['p1', 'p2', 'p3']))
    api.tournamentProfiles.mockResolvedValue([{ playerId: 'p4', handle: 'camilo', displayName: 'Camilo', avatarUrl: null, status: 'confirmed' }])
    mount('minimal4-setup')
    expect(await screen.findByText(LISTO)).toBeTruthy()
  })

  it('ready to play: one quiet line instead of the list, saying what it checked, and only once the PINs are known', async () => {
    let answer: (pins: Set<string>) => void = () => undefined
    api.playersWithPin.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    mount('minimal4-setup')
    // Everything else is done, but nobody knows the PINs yet: no «Listo».
    expect(screen.queryByText(LISTO)).toBeNull()
    await act(async () => answer(pinsOf(['p1', 'p2', 'p3', 'p4'])))
    // One tee on the course: no tees were checked, so it does not say «tees».
    expect(await screen.findByText(R.allSet('jugadores, PIN, rondas, campo y grupos'))).toBeTruthy()
    expect(screen.queryByRole('heading', { name: R.title })).toBeNull()
  })

  it('without signal the PINs stay unknown, and «Listo» is not said', async () => {
    api.playersWithPin.mockRejectedValue(new Error('Sin conexión'))
    mount('minimal4-setup')
    await waitFor(() => expect(api.playersWithPin).toHaveBeenCalled())
    await act(async () => undefined)
    expect(screen.queryByText(LISTO)).toBeNull()
  })

  it('a quick round, created ready to play, never shows it', () => {
    api.playersWithPin.mockResolvedValue(new Set())
    mount('new-setup', (s) => {
      s.tournament.quick = true
    })
    expect(screen.queryByRole('heading', { name: R.title })).toBeNull()
  })

  it('under way: the card prepares the next day, and the groups line opens Grupos on it', async () => {
    api.playersWithPin.mockResolvedValue(pinsOf(getFixture('bracket8')!.snapshot.players.map((p) => p.id)))
    mount('bracket8')
    expect(await screen.findByRole('heading', { name: R.titleNext(2) })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: R.title })).toBeNull()
    const groups = screen.getByRole('link', { name: `${R.todoLabel}: ${R.groupsMissing(2)}` })
    expect(groups.getAttribute('href')).toBe('/t/viaje/admin/grupos?ronda=r2')
  })
})

describe('Para empezar: a design fixture has no server (N4)', () => {
  it('mounted the way FixtureGate mounts it (store id «fixture:<name>», context id the snapshot\'s), its players count as able to get in', async () => {
    useTournament.setState({ tournamentId: null, data: null })
    render(
      <MemoryRouter initialEntries={['/t/_/minimal4-setup/admin/torneo']}>
        <Routes>
          <Route path="/t/_/:name" element={<FixtureGate />}>
            <Route path="admin" element={<AdminLayout />}>
              <Route path="torneo" element={<ReadinessCard />} />
            </Route>
          </Route>
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText(LISTO)).toBeTruthy()
    // The gate's context carries the snapshot's id, not the store's.
    expect(useTournament.getState().tournamentId).toBe('fixture:minimal4-setup')
    expect(getFixture('minimal4-setup')!.snapshot.tournament.id).toBe('fx-min')
    expect(api.playersWithPin).not.toHaveBeenCalled()
    expect(api.tournamentProfiles).not.toHaveBeenCalled()
    // Nothing pending on the tab either.
    expect(screen.getByRole('link', { name: t.admin.sections.tournament })).toBeTruthy()
  })
})

describe('Para empezar: «Listo» only when the day can be played (N1, N5)', () => {
  it('everything on the list done, but the engine warns about something it does not say: no «Listo»', async () => {
    api.playersWithPin.mockResolvedValue(pinsOf(['p1', 'p2', 'p3', 'p4']))
    // The round's course is not loaded: the engine plays par 4 everywhere and says so above the card.
    const { tab } = mountComite('minimal4-setup', (s) => {
      s.rounds[0]!.courseId = 'ghost'
    })
    await waitFor(() => expect(api.playersWithPin).toHaveBeenCalled())
    await act(async () => undefined)
    expect(useTournament.getState().data!.state.flags.warnings).toHaveLength(1)
    expect(screen.queryByText(LISTO)).toBeNull()
    expect(tab().textContent).toContain('1')
  })

  it('under way with every day left cancelled: nothing to prepare, so no card at all', async () => {
    api.playersWithPin.mockResolvedValue(pinsOf(['p1', 'p2', 'p3']))
    mount('minimal4-setup', (s) => {
      s.tournament.status = 'live'
      s.tournament.settings = { ...(s.tournament.settings as TournamentSettings), rounds: 2 }
      s.rounds = [makeRound(1, { status: 'finished', date: '2027-05-15' }), makeRound(2, { status: 'cancelled', date: '2027-05-16' })]
    })
    await act(async () => undefined)
    expect(screen.queryByRole('heading')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
    // Showing nothing, it asks nothing.
    expect(api.playersWithPin).not.toHaveBeenCalled()
  })

  it('a line about the day count opens Torneo on its Reglas tab', async () => {
    api.playersWithPin.mockResolvedValue(pinsOf(getFixture('match8')!.snapshot.players.map((p) => p.id)))
    mount('match8')
    const days = await screen.findByRole('link', { name: `${R.todoLabel}: ${R.bracketDays(3, 1)}` })
    expect(days.getAttribute('href')).toBe('/t/viaje/admin/torneo?pestana=reglas')
  })
})

describe('Para empezar: the card and the tab read one answer, asked again when it can have changed (N3)', () => {
  it('a pending link is not a way in (M11)', async () => {
    api.playersWithPin.mockResolvedValue(pinsOf(['p1', 'p2', 'p3']))
    api.tournamentProfiles.mockResolvedValue([{ playerId: 'p4', handle: 'camilo', displayName: 'Camilo', avatarUrl: null, status: 'pending' }])
    mount('minimal4-setup')
    expect(await screen.findByRole('link', { name: `${R.todoLabel}: ${R.pinsMissing(1)}` })).toBeTruthy()
  })

  it('the tab counts the PIN line, the same answer the card shows, and says «1 pendiente» (M13)', async () => {
    api.playersWithPin.mockResolvedValue(pinsOf(['p1', 'p2', 'p3']))
    const { tab } = mountComite('minimal4-setup')
    expect(await screen.findByRole('link', { name: `${R.todoLabel}: ${R.pinsMissing(1)}` })).toBeTruthy()
    expect(tab().textContent).toBe(`${t.admin.sections.tournament}1`)
    expect(screen.getByRole('link', { name: `${t.admin.sections.tournament} 1 pendiente` })).toBe(tab())
  })

  it('a failed answer is asked for again when the card opens again, and the tab follows the card (M9)', async () => {
    api.playersWithPin.mockRejectedValueOnce(new Error('Sin conexión'))
    const { tab, go } = mountComite('minimal4-setup')
    await waitFor(() => expect(api.playersWithPin).toHaveBeenCalledTimes(1))
    await act(async () => undefined)
    expect(screen.queryByText(LISTO)).toBeNull()
    api.playersWithPin.mockResolvedValue(pinsOf(['p1']))
    await go('jugadores')
    await go('torneo')
    expect(await screen.findByRole('link', { name: `${R.todoLabel}: ${R.pinsMissing(3)}` })).toBeTruthy()
    expect(tab().textContent).toBe(`${t.admin.sections.tournament}1`)
  })

  it('PINs set on another phone: opening the card again asks again (a settled answer is not kept)', async () => {
    api.playersWithPin.mockResolvedValue(pinsOf(['p1', 'p2', 'p3']))
    const { tab, go } = mountComite('minimal4-setup')
    expect(await screen.findByRole('link', { name: `${R.todoLabel}: ${R.pinsMissing(1)}` })).toBeTruthy()
    api.playersWithPin.mockResolvedValue(pinsOf(['p1', 'p2', 'p3', 'p4']))
    await go('jugadores')
    await go('torneo')
    expect(await screen.findByText(LISTO)).toBeTruthy()
    expect(tab().textContent).toBe(t.admin.sections.tournament)
  })

  it('a link undone on another phone arrives with the players\' reload, and is asked about again', async () => {
    api.playersWithPin.mockResolvedValue(pinsOf(['p1', 'p2', 'p3']))
    api.tournamentProfiles.mockResolvedValue([{ playerId: 'p4', handle: 'camilo', displayName: 'Camilo', avatarUrl: null, status: 'confirmed' }])
    const { snapshot } = mountComite('minimal4-setup')
    expect(await screen.findByText(LISTO)).toBeTruthy()
    api.tournamentProfiles.mockResolvedValue([])
    // Realtime: a players row changed (its profile link, which the snapshot's players don't carry), and the
    // store reloads with a new players key (tournamentStore.test: the key follows the rows as fetched).
    await act(async () => useTournament.setState({ data: { ...dataFromSnapshot(structuredClone(snapshot)), playersKey: 'p4-unlinked' } }))
    expect(await screen.findByRole('link', { name: `${R.todoLabel}: ${R.pinsMissing(1)}` })).toBeTruthy()
  })

  it('a player added: asked again, with him in it (M12)', async () => {
    api.playersWithPin.mockResolvedValue(pinsOf(['p1', 'p2', 'p3', 'p4']))
    const { snapshot } = mountComite('minimal4-setup')
    expect(await screen.findByText(LISTO)).toBeTruthy()
    api.playersWithPin.mockResolvedValue(pinsOf(['p1', 'p2', 'p3', 'p4', 'p5']))
    const more = structuredClone(snapshot)
    more.players.push(makePlayer(5))
    more.groups[0]!.playerIds.push('p5')
    await act(async () => useTournament.setState({ data: dataFromSnapshot(more) }))
    await waitFor(() => expect(api.playersWithPin).toHaveBeenCalledTimes(2))
    expect(await screen.findByText(LISTO)).toBeTruthy()
    expect(screen.queryByRole('link', { name: `${R.todoLabel}: ${R.pinsMissing(1)}` })).toBeNull()
  })

  it('a reload that changes no player asks nothing: ten realtime reloads of scores, one request pair', async () => {
    api.playersWithPin.mockResolvedValue(pinsOf(['p1', 'p2', 'p3', 'p4']))
    const { snapshot } = mountComite('minimal4-setup')
    expect(await screen.findByText(LISTO)).toBeTruthy()
    for (let i = 0; i < 10; i++) {
      // The store rebuilds everything, players included, on every reload: a new array, the same rows.
      await act(async () => useTournament.setState({ data: dataFromSnapshot(structuredClone(snapshot)) }))
    }
    await act(async () => undefined)
    expect(api.playersWithPin).toHaveBeenCalledTimes(1)
    expect(api.tournamentProfiles).toHaveBeenCalledTimes(1)
    expect(screen.getByText(LISTO)).toBeTruthy()
  })

  it('where the card shows nothing it asks nothing: a quick round, a finished tournament', async () => {
    api.playersWithPin.mockResolvedValue(new Set())
    mount('minimal4-live', (s) => {
      s.tournament.quick = true
    })
    cleanup()
    mount('minimal4-live', (s) => {
      s.tournament.status = 'finished'
    })
    await act(async () => undefined)
    expect(api.playersWithPin).not.toHaveBeenCalled()
    expect(api.tournamentProfiles).not.toHaveBeenCalled()
  })

  it('an older answer that lands after a newer one about the same tournament is dropped (M11)', async () => {
    const answers: Array<(pins: Set<string>) => void> = []
    api.playersWithPin.mockImplementation(() => new Promise((resolve) => answers.push(resolve)))
    mount('minimal4-setup')
    await waitFor(() => expect(answers).toHaveLength(1))
    // This phone sets a PIN: asked again while the first answer is still on its way.
    await act(async () => entryChanged())
    await waitFor(() => expect(answers).toHaveLength(2))
    await act(async () => answers[1]!(pinsOf(['p1', 'p2', 'p3', 'p4'])))
    expect(await screen.findByText(LISTO)).toBeTruthy()
    // The first answer, from before the PIN, arrives last: it is not applied.
    await act(async () => answers[0]!(pinsOf(['p1', 'p2', 'p3'])))
    await act(async () => undefined)
    expect(screen.getByText(LISTO)).toBeTruthy()
    expect(screen.queryByRole('link', { name: `${R.todoLabel}: ${R.pinsMissing(1)}` })).toBeNull()
  })

  it('a late answer about another tournament never blanks this one\'s card', async () => {
    let first: (pins: Set<string>) => void = () => undefined
    api.playersWithPin.mockReturnValueOnce(new Promise((resolve) => (first = resolve)))
    const one = mount('minimal4-setup', undefined, 't-late-1')
    await act(async () => undefined)
    one.unmount()
    // The second tournament's answer arrives first.
    api.playersWithPin.mockResolvedValue(pinsOf(['p1', 'p2', 'p3']))
    mount('minimal4-setup', undefined, 't-late-2')
    expect(await screen.findByRole('link', { name: `${R.todoLabel}: ${R.pinsMissing(1)}` })).toBeTruthy()
    // Then the first tournament's lands.
    await act(async () => first(pinsOf(['p1', 'p2', 'p3', 'p4'])))
    await act(async () => undefined)
    expect(screen.getByRole('link', { name: `${R.todoLabel}: ${R.pinsMissing(1)}` })).toBeTruthy()
    expect(screen.queryByText(LISTO)).toBeNull()
  })

  it('an answer about one tournament is never read as another\'s (M10)', async () => {
    api.playersWithPin.mockResolvedValue(pinsOf(['p1', 'p2', 'p3', 'p4']))
    const first = mount('minimal4-setup', undefined, 't-first')
    expect(await screen.findByText(LISTO)).toBeTruthy()
    first.unmount()
    // Another tournament with the same player ids, its answer still on the way.
    let answer: (pins: Set<string>) => void = () => undefined
    api.playersWithPin.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    mount('minimal4-setup', undefined, 't-second')
    await act(async () => undefined)
    expect(screen.queryByText(LISTO)).toBeNull()
    await act(async () => answer(pinsOf(['p1', 'p2', 'p3'])))
    expect(await screen.findByRole('link', { name: `${R.todoLabel}: ${R.pinsMissing(1)}` })).toBeTruthy()
  })
})
