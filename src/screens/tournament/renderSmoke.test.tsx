// @vitest-environment happy-dom
/**
 * QA-13's render smoke: every tournament screen on every design fixture (`src/dev/fixtures.ts`), with the real
 * header and tabs around it. A screen fails it when it throws, when React or the screen logs an error, or when
 * its text holds «[object Object]» or «undefined»/«NaN» where a value should be (PR 51's «Día 1 [object
 * Object]» reached players this way). The fixture browser suite (e2e/fixtures/pages.spec.ts) checks the main
 * screens in a real browser for uncaught errors, overflow and contrast; this one is every fixture, in seconds.
 */
import { act, cleanup, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('canvas-confetti', () => ({ default: vi.fn() }))
vi.mock('../../data/quick', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/quick')>()),
  roundRivalries: vi.fn(async () => []),
}))

import { FIXTURE_NAMES, getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import { CeremonyScreen } from './CeremonyScreen'
import { GamesScreen } from './GamesScreen'
import { LiveScreen } from './LiveScreen'
import { MoneyScreen } from './MoneyScreen'
import { MoreScreen } from './MoreScreen'
import { RulesScreen } from './RulesScreen'
import { ScorecardScreen } from './ScorecardScreen'
import { StatsScreen } from './StatsScreen'
import { TournamentContext } from './tournamentContext'
import { TournamentShell } from './TournamentShell'
import { TvScreen } from './TvScreen'

// happy-dom rejects a running animation's `finished` when the test unmounts it; nothing here waits on it.
const cancelAnimation = Animation.prototype.cancel
Animation.prototype.cancel = function (this: Animation) {
  this.finished.catch(() => undefined)
  cancelAnimation.call(this)
}

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
/** Words that mean a value went missing on the way to the screen. */
const BROKEN = /\[object Object\]|\bundefined\b|\bNaN\b/

let errors: string[] = []
beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => void errors.push(args.map(String).join(' ')))
})
afterAll(() => vi.restoreAllMocks())
afterEach(() => {
  cleanup()
  errors = []
})

async function show(name: string, path: string) {
  const fx = getFixture(name)!
  useTournament.setState({
    tournamentId: `fixture:${name}`,
    data: dataFromSnapshot(structuredClone(fx.snapshot)),
    loading: false,
    error: null,
    realtime: 'off',
  })
  const ctx = {
    tournamentId: fx.snapshot.tournament.id,
    slug: `_/${name}`,
    lookup: fx.lookup,
    me: fx.me,
    refresh: async () => undefined,
    leave: async () => undefined,
  }
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[`/t/_/${name}/${path}`]}>
        <TournamentContext.Provider value={ctx}>
          <Routes>
            <Route path="/t/_/:name" element={<TournamentShell />}>
              {TABS.map(([p, el]) =>
                p ? <Route key={p} path={p} element={el} /> : <Route key="index" index element={el} />,
              )}
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
  return document.body.textContent ?? ''
}

describe('every tournament screen on every fixture renders whole (QA-13)', () => {
  for (const name of FIXTURE_NAMES) {
    it(name, async () => {
      for (const [path] of [...TABS, ...ROOMS]) {
        const text = await show(name, path)
        expect(text.length, `${name}/${path} drew nothing`).toBeGreaterThan(0)
        expect(text.match(BROKEN)?.[0] ?? null, `${name}/${path}`).toBeNull()
        expect(errors, `${name}/${path}`).toEqual([])
        cleanup()
      }
    })
  }
})
