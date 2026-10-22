// @vitest-environment happy-dom
/**
 * ARCH-04 on the screens. A row this build can't read (a newer build's key)
 * used to be computed on the defaults and shown as if it were the tournament:
 * now every screen but Más says to update, with the update bar's button, and
 * the Comité keeps only what computes nothing (Datos, Historial). A side game
 * this build doesn't know that may move money takes every peso off the
 * screens, and En vivo says why.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { matchRoutes, MemoryRouter, Route, Routes, type RouteObject } from 'react-router'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('canvas-confetti', () => ({ default: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: () => ({}), supabaseConfigured: false }))
vi.mock('../../data/quick', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/quick')>()),
  roundRivalries: vi.fn(async () => []),
}))
vi.mock('../../data/appUpdate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/appUpdate')>()),
  applyUpdate: vi.fn(async () => undefined),
}))

import { applyUpdate } from '../../data/appUpdate'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import { t } from '../../i18n/es-MX'
import { AdminLayout } from '../admin/AdminLayout'
import { CeremonyScreen } from './CeremonyScreen'
import { GamesScreen } from './GamesScreen'
import { LiveScreen } from './LiveScreen'
import { MoneyScreen } from './MoneyScreen'
import { MoreScreen } from './MoreScreen'
import { RulesScreen } from './RulesScreen'
import { ScorecardScreen } from './ScorecardScreen'
import { SettingsGuard } from './SettingsGuard'
import { TournamentContext, type TournamentCtx } from './tournamentContext'
import { TournamentShell } from './TournamentShell'

// happy-dom rejects a running animation's `finished` when the test unmounts it; nothing here waits on it.
const cancelAnimation = Animation.prototype.cancel
Animation.prototype.cancel = function (this: Animation) {
  this.finished.catch(() => undefined)
  cancelAnimation.call(this)
}

const FX = 'full12-live'
type Raw = Record<string, unknown>
const WOLF = {
  id: 'wolf-1',
  type: 'wolf',
  label: 'Wolf',
  enabled: true,
  money: { source: 'direct', stake: 50 },
  options: {},
}
const newerKey = (raw: unknown): Raw => ({
  ...(raw as Raw),
  modules: { ...((raw as Raw).modules as Raw), wolf: { enabled: true, label: 'Wolf' } },
})
const newerGame = (raw: unknown): Raw => ({
  ...(raw as Raw),
  games: [...(((raw as Raw).games as unknown[]) ?? []), WOLF],
})

const TABS: Array<[string, ReactNode]> = [
  ['', <LiveScreen key="live" />],
  ['tarjeta', <ScorecardScreen key="card" />],
  ['juegos', <GamesScreen key="games" />],
  ['dinero', <MoneyScreen key="money" />],
  ['reglamento', <RulesScreen key="rules" />],
  ['mas', <MoreScreen key="more" />],
]

beforeAll(() => vi.spyOn(console, 'error').mockImplementation(() => undefined))
afterAll(() => vi.restoreAllMocks())
afterEach(() => cleanup())

async function show(path: string, edit: ((raw: unknown) => Raw) | null, me: Partial<TournamentCtx['me']> = {}) {
  const fx = getFixture(FX)!
  const snap = structuredClone(fx.snapshot)
  if (edit) snap.tournament.settings = edit(snap.tournament.settings)
  useTournament.setState({
    tournamentId: `fixture:${FX}`,
    data: dataFromSnapshot(snap),
    loading: false,
    error: null,
    realtime: 'off',
  })
  const ctx: TournamentCtx = {
    tournamentId: snap.tournament.id,
    slug: `_/${FX}`,
    lookup: fx.lookup,
    me: { ...fx.me, ...me },
    refresh: async () => undefined,
    leave: async () => undefined,
  }
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[`/t/_/${FX}${path}`]}>
        <TournamentContext.Provider value={ctx}>
          <Routes>
            <Route path="/t/_/:name" element={<TournamentShell />}>
              {TABS.map(([p, el]) =>
                p ? <Route key={p} path={p} element={el} /> : <Route key="index" index element={el} />,
              )}
            </Route>
            <Route
              path="/t/_/:name/ceremonia"
              element={
                <SettingsGuard money>
                  <CeremonyScreen />
                </SettingsGuard>
              }
            />
            <Route path="/t/_/:name/admin" element={<AdminLayout />}>
              <Route path="torneo" element={<p>Pantalla de Torneo</p>} />
              <Route path="datos" element={<p>Pantalla de Datos</p>} />
              <Route path="historial" element={<p>Pantalla de Historial</p>} />
            </Route>
          </Routes>
        </TournamentContext.Provider>
      </MemoryRouter>,
    )
    await new Promise((r) => setTimeout(r, 0))
  })
  return document.body.textContent ?? ''
}

const notice = () => screen.queryByRole('heading', { level: 1, name: t.outdated.title })
const someone = () => getFixture(FX)!.snapshot.players[0]!.displayName

describe('settings this build can’t read: nothing computed from them shows', () => {
  it.each(TABS.filter(([p]) => p !== 'mas').map(([p]) => p))(
    '«%s» says to update, with no board under it',
    async (p) => {
      const text = await show(p ? `/${p}` : '', newerKey)
      expect(notice()).toBeTruthy()
      expect(text).not.toContain(someone())
      expect(text).not.toMatch(/\$\d/)
    },
  )

  it('Más stays: the player’s session, the join code, the Comité are none of the settings', async () => {
    await show('/mas', newerKey)
    expect(notice()).toBeNull()
  })

  it('«Actualizar» is the update bar’s: the waiting update, else a look for one, else a reload', async () => {
    await show('', newerKey)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: t.sync.update })))
    expect(applyUpdate).toHaveBeenCalledTimes(1)
  })

  it('what it doesn’t recognize, for the Comité only', async () => {
    await show('', newerKey, { isOrganizer: true, isComite: true })
    expect(screen.getByText(t.outdated.detail('modules.wolf'))).toBeTruthy()
    cleanup()
    await show('', newerKey, { isOrganizer: false, isComite: false })
    expect(screen.queryByText(t.outdated.detail('modules.wolf'))).toBeNull()
  })

  it('the Comité keeps Datos (a backup) and Historial; its setup waits for the update', async () => {
    const admin = { isOrganizer: true, isComite: true }
    expect(await show('/admin/torneo', newerKey, admin)).not.toContain('Pantalla de Torneo')
    expect(notice()).toBeTruthy()
    cleanup()
    expect(await show('/admin/datos', newerKey, admin)).toContain('Pantalla de Datos')
    cleanup()
    expect(await show('/admin/historial', newerKey, admin)).toContain('Pantalla de Historial')
    cleanup()
    expect(await show('/admin/torneo', null, admin)).toContain('Pantalla de Torneo')
  })

  it('the same tournament read whole shows its boards', async () => {
    const text = await show('', null)
    expect(notice()).toBeNull()
    expect(text).toContain(someone())
    expect(text).toMatch(/\$\d/)
  })
})

describe('a side game this build doesn’t know that may move money: no money anywhere', () => {
  it('En vivo keeps its board, drops every peso and says why; the bar has no Dinero', async () => {
    const text = await show('', newerGame)
    expect(notice()).toBeNull()
    expect(text).toContain(someone())
    expect(text).not.toMatch(/\$\d/)
    expect(screen.getByText(t.outdated.money(['Wolf']))).toBeTruthy()
    expect(screen.queryByRole('link', { name: t.nav.money })).toBeNull()
  })

  it('Dinero and the Ceremonia wait for the update', async () => {
    await show('/dinero', newerGame)
    expect(notice()).toBeTruthy()
    cleanup()
    await show('/ceremonia', newerGame, { isOrganizer: true, isComite: true })
    expect(notice()).toBeTruthy()
    expect(screen.getByText(t.outdated.money(['Wolf']))).toBeTruthy()
  })

  it('Juegos lists it by name and says this build doesn’t know it', async () => {
    const text = await show('/juegos', newerGame)
    expect(text).toContain('Wolf')
    expect(text).toContain(t.games.outdated)
  })
})

describe('the app’s own routes wait for the settings too', () => {
  it('TV, the Ceremonia (money too) and the printable cards, and a link’s TV', async () => {
    const { router } = await import('../../app/router')
    const guardAt = (path: string) => {
      const el = matchRoutes(router.routes as RouteObject[], path)?.at(-1)?.route.element as
        { type?: unknown; props?: { money?: boolean } } | undefined
      return el?.type === SettingsGuard ? { money: !!el.props?.money } : null
    }
    expect(guardAt('/t/x/tv')).toEqual({ money: false })
    expect(guardAt('/t/x/ceremonia')).toEqual({ money: true })
    expect(guardAt('/t/x/imprimir')).toEqual({ money: false })
    expect(guardAt('/v/AbCdEfGhIjKlMnOpQrStUv12/tv')).toEqual({ money: false })
  })
})
