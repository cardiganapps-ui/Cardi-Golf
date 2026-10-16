// @vitest-environment happy-dom
/**
 * STRAT-11: the first tournament leaked into every tournament. Any champion
 * «se lleva el Putter» (Golfbreaks' trophy for Nacho's trip), and the snake
 * was «la víbora» on the Tarjeta, the boards, the feed, the awards and the
 * Comité whatever the organizer called it. Names are copy, not code (§0.5):
 * here the first tournament plays under other names and no trophy, and no
 * screen may say «Putter», «víbora», «Matrimonios», «Cuchara» or «novio».
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('canvas-confetti', () => ({ default: vi.fn() }))
vi.mock('../../data/quick', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../data/quick')>()), roundRivalries: vi.fn(async () => []) }))

import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import type { TournamentSettings } from '../../engine/settings/schema'
import { t } from '../../i18n/es-MX'
import { CeremonyScreen } from './CeremonyScreen'
import { GamesScreen } from './GamesScreen'
import { LiveScreen } from './LiveScreen'
import { MoneyScreen } from './MoneyScreen'
import { MoreScreen } from './MoreScreen'
import { RulesScreen } from './RulesScreen'
import { ScorecardScreen } from './ScorecardScreen'
import { StatsScreen } from './StatsScreen'
import { TournamentContext } from './TournamentGate'
import { TournamentShell } from './TournamentShell'
import { TvScreen } from './TvScreen'

// happy-dom rejects a running animation's `finished` when the test unmounts it; nothing here waits on it.
const cancelAnimation = Animation.prototype.cancel
Animation.prototype.cancel = function (this: Animation) {
  this.finished.catch(() => undefined)
  return cancelAnimation.call(this)
}

afterEach(() => {
  cleanup()
  useTournament.setState({ tournamentId: null, data: null })
})

const TABS: Array<[string, ReactNode]> = [
  ['', <LiveScreen key="live" />],
  ['tarjeta', <ScorecardScreen key="card" />],
  ['juegos', <GamesScreen key="games" />],
  ['dinero', <MoneyScreen key="money" />],
  ['stats', <StatsScreen key="stats" />],
  ['reglamento', <RulesScreen key="rules" />],
  ['mas', <MoreScreen key="more" />],
]
const ROOMS: Array<[string, ReactNode]> = [
  ['tv', <TvScreen key="tv" />],
  ['ceremonia', <CeremonyScreen key="ceremony" />],
]

/** The first tournament's own names, which another tournament must never read. */
const LEAKS = /putter|víbora|matrimonio|cuchara|novio/i

/** The first tournament, renamed: every label its own, and no trophy. */
function renamed(name: 'full12-live' | 'full12-finished') {
  const fx = getFixture(name)!
  const snap = structuredClone(fx.snapshot)
  const st = snap.tournament.settings as TournamentSettings
  snap.tournament.name = 'Copa del Valle'
  snap.tournament.settings = {
    ...st,
    modules: { ...st.modules, pairs: { ...st.modules.pairs, label: 'Las Duplas' }, snake: { ...st.modules.snake, label: 'El Tres Putts' }, auction: { ...st.modules.auction, label: 'La Subasta' } },
    labels: { lastPlace: 'El Farolito', honoree: 'El festejado', trophy: '' },
  }
  for (const p of snap.pairs) p.name = null
  return { fx, snap }
}

async function show(name: 'full12-live' | 'full12-finished', path: string) {
  const { fx, snap } = renamed(name)
  useTournament.setState({ tournamentId: `fixture:${name}`, data: dataFromSnapshot(snap), loading: false, error: null, realtime: 'off' })
  const ctx = { tournamentId: snap.tournament.id, slug: `_/${name}`, lookup: { ...fx.lookup, name: snap.tournament.name }, me: fx.me, refresh: async () => undefined, leave: async () => undefined }
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[`/t/_/${name}/${path}`]}>
        <TournamentContext.Provider value={ctx}>
          <Routes>
            <Route path="/t/_/:name" element={<TournamentShell />}>
              {TABS.map(([p, el]) => (p ? <Route key={p} path={p} element={el} /> : <Route key="index" index element={el} />))}
            </Route>
            {ROOMS.map(([p, el]) => (
              <Route key={p} path={`/t/_/:name/${p}`} element={el} />
            ))}
          </Routes>
        </TournamentContext.Provider>
      </MemoryRouter>,
    )
    await new Promise((r) => setTimeout(r, 0))
  })
  return text()
}
/** What the page says: its text and its accessible names. */
const text = () => [document.body.textContent ?? '', ...[...document.querySelectorAll('[aria-label]')].map((el) => el.getAttribute('aria-label') ?? '')].join(' ')

describe('another tournament never reads the first one’s names (STRAT-11)', () => {
  for (const name of ['full12-live', 'full12-finished'] as const) {
    it(`${name}: every tab, the TV and the ceremony`, async () => {
      for (const [path] of [...TABS, ...ROOMS]) {
        const said = await show(name, path)
        expect(said.match(LEAKS)?.[0] ?? null, `${name}/${path}`).toBeNull()
        cleanup()
      }
    })
  }

  it('the ceremony, step by step: the champion takes no trophy nobody named, and the snake’s award has its name', async () => {
    await show('full12-finished', 'ceremonia')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: t.ceremony.start })))
    const said: string[] = []
    for (let i = 0; i < 20; i++) {
      for (const b of screen.queryAllByRole('button', { name: t.ceremony.reveal })) await act(async () => fireEvent.click(b))
      said.push(text())
      const next = screen.getByRole('button', { name: t.ceremony.next }) as HTMLButtonElement
      if (next.disabled) break
      await act(async () => fireEvent.click(next))
    }
    const all = said.join(' ')
    expect(all.match(LEAKS)?.[0] ?? null).toBeNull()
    expect(all).toContain(`${t.ceremony.champion}.`)
    expect(all).not.toContain('Se lleva')
    expect(all).toContain('Tres Putts de Oro')
  })

  it('a named trophy is the tournament’s own', async () => {
    const { snap } = renamed('full12-finished')
    const st = snap.tournament.settings as TournamentSettings
    expect(t.ceremony.trophy('la Copa')).toBe('Se lleva la Copa')
    expect(st.labels.trophy).toBe('')
  })
})
