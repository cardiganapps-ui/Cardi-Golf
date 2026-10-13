// @vitest-environment happy-dom
/**
 * ARCH-13: Torneo and Juegos saved the whole settings blob, so the screen
 * that saved last undid the other's change and nobody was told: a Torneo
 * draft opened before a game changed in Juegos (or on the organizer's other
 * phone) wrote the old games back. Here both screens save through the app's
 * real client to the test server, which runs update_settings as the database
 * does (cases/serverRules.json pins one against the other), while another
 * phone saves in between.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

const net = vi.hoisted(() => ({ client: null as SupabaseClient | null }))
vi.mock('../../lib/supabase', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../lib/supabase')>()), supabase: () => net.client! }))

import { updateSettings } from '../../data/api'
import type { Row } from '../../data/mappers'
import { fakeSupabase, type FakeSupabase } from '../../data/testing/fakeSupabase'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import { getFixture } from '../../dev/fixtures'
import type { Snapshot } from '../../engine/types'
import { t } from '../../i18n/es-MX'
import { Toaster } from '../../components/ui'
import { TournamentContext } from '../tournament/TournamentGate'
import { AdminGames } from './AdminGames'
import { AdminTournament } from './AdminTournament'

const A = t.admin.tournament
const G = t.admin.games

let server: FakeSupabase
let snap: Snapshot
let worlds = 0

/** The fixture's tournament on the test server, its Comité signed in on this phone, and the store holding it. */
function world(name: string, edit: (s: Snapshot) => void = () => undefined) {
  const fx = getFixture(name)!
  snap = structuredClone(fx.snapshot)
  edit(snap)
  const tr = snap.tournament
  server = fakeSupabase({})
  server.seed('tournaments', [{ id: tr.id, slug: tr.slug, name: tr.name, tagline: tr.tagline ?? null, accent_color: tr.accentColor ?? null, join_code: 'ENSAYO', status: tr.status, settings: structuredClone(tr.settings) }])
  server.seed('tournament_organizers', [{ tournament_id: tr.id, auth_user_id: 'uid-org', role: 'owner' }])
  net.client = createClient(server.url, server.anonKey, {
    // A key of its own per world: one GoTrue client per storage key.
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: `settings-saves-${++worlds}` },
    global: { fetch: server.fetch, headers: { Authorization: `Bearer ${server.auth.sessionFor('uid-org')}` } },
  })
  // What a fetch brings: the tournament's row as the server holds it.
  const reload = vi.fn(async () => {
    const r = row()
    const next = structuredClone(useTournament.getState().data!.base)
    next.tournament = { ...next.tournament, name: r.name as string, tagline: (r.tagline as string | null) ?? null, accentColor: (r.accent_color as string | null) ?? null, settings: structuredClone(r.settings) }
    useTournament.setState({ data: dataFromSnapshot(next) })
  })
  useTournament.setState({ tournamentId: tr.id, data: dataFromSnapshot(structuredClone(snap)), reload, loading: false, error: null, realtime: 'off' })
  return { fx, reload }
}
const row = (): Row => server.tables.tournaments!.find((r) => r.id === snap.tournament.id)!
/** The settings as the server holds them: the keys these tests read. */
interface Stored {
  labels: { lastPlace: string; honoree: string; trophy?: string }
  games: Array<{ id: string; label: string; entrants: string }>
  entryFee: number
  expectedPlayers?: number
  [key: string]: unknown
}
const stored = () => row().settings as Stored

function mount(fx: ReturnType<typeof world>['fx'], screenEl: React.ReactNode) {
  render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: snap.tournament.id, slug: snap.tournament.slug, lookup: fx.lookup, me: { playerId: null, isOrganizer: true, isAdmin: true }, refresh: async () => undefined, leave: async () => undefined }}>
        {screenEl}
        <Toaster />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
}
const type = (el: HTMLElement, value: string) => act(async () => fireEvent.change(el, { target: { value } }))
const click = (el: HTMLElement) => act(async () => fireEvent.click(el))
const tab = (name: string) => click(screen.getByRole('tab', { name }))
const saveButton = () => screen.getByRole('button', { name: t.common.save }) as HTMLButtonElement
/** Another phone of the Comité saves, from the row as it is now. */
async function otherPhone(set: { settings?: Record<string, unknown>; name?: string }) {
  const r = row()
  const seen = { ...(set.settings ? { settings: Object.fromEntries(Object.keys(set.settings).map((k) => [k, stored()[k] ?? null])) } : {}), ...(set.name ? { name: r.name as string } : {}) }
  await updateSettings(snap.tournament.id, seen, set)
}

afterEach(() => {
  cleanup()
  expect(server.unexpected).toEqual([])
})

describe('Torneo saves only what it changed, and never over a change made meanwhile (ARCH-13)', () => {
  it('a game changed on another phone while a Torneo draft is open stays: the draft is refused once, then saves over it', async () => {
    const { fx } = world('friends8')
    const before = structuredClone(stored())
    mount(fx, <AdminTournament />)
    await tab(A.tabs.rules)
    await type(screen.getByLabelText(A.lastPlaceLabel), 'La Cuchara de Palo')
    const games = structuredClone(before.games)
    games[0]!.label = 'Skins de la tarde'
    await otherPhone({ settings: { games } })

    await click(saveButton())
    expect(screen.getByText(A.settingsMerged)).toBeTruthy()
    // Nothing was written by the refused save; the other phone's games stand.
    expect(stored().labels).toEqual(before.labels)
    expect(stored().games[0]!.label).toBe('Skins de la tarde')
    // The draft is still here, over the games as they are now.
    expect((screen.getByLabelText(A.lastPlaceLabel) as HTMLInputElement).value).toBe('La Cuchara de Palo')
    expect(saveButton().disabled).toBe(false)

    await click(saveButton())
    expect(screen.getByText(t.common.saved)).toBeTruthy()
    expect(stored().labels.lastPlace).toBe('La Cuchara de Palo')
    expect(stored().games[0]!.label).toBe('Skins de la tarde')
    // Only the labels changed, from what the other phone left.
    const { labels: _l, games: _g, ...rest } = stored()
    const { labels: _bl, games: _bg, ...restBefore } = before
    expect(rest).toEqual(restBefore)
    // And the store holds the row as stored, which the screen now follows.
    expect(useTournament.getState().data!.snapshot.tournament.settings).toEqual(stored())
  })

  it('the same thing changed on both: theirs stays, the toast says so, and nothing is left to save', async () => {
    const { fx } = world('friends8')
    const before = structuredClone(stored())
    mount(fx, <AdminTournament />)
    await tab(A.tabs.rules)
    await type(screen.getByLabelText(A.lastPlaceLabel), 'La Cuchara de Palo')
    await otherPhone({ settings: { labels: { ...before.labels, lastPlace: 'El Farolito' } } })

    await click(saveButton())
    expect(screen.getByText(A.settingsMergedLost)).toBeTruthy()
    expect(stored().labels.lastPlace).toBe('El Farolito')
    expect((screen.getByLabelText(A.lastPlaceLabel) as HTMLInputElement).value).toBe('El Farolito')
    expect(saveButton().disabled).toBe(true)
  })

  it('a name changed on another phone stays; the tagline typed here saves beside it', async () => {
    const { fx } = world('friends8')
    mount(fx, <AdminTournament />)
    await type(screen.getByLabelText(A.tagline), 'La despedida')
    await otherPhone({ name: 'Los Cabos 2027' })

    await click(saveButton())
    expect(screen.getByText(A.settingsMerged)).toBeTruthy()
    expect(row().tagline ?? null).toBe(snap.tournament.tagline ?? null)
    expect((screen.getByLabelText(A.name) as HTMLInputElement).value).toBe('Los Cabos 2027')

    await click(saveButton())
    expect([row().name, row().tagline]).toEqual(['Los Cabos 2027', 'La despedida'])
  })

  it('an untouched accent is never written: a tournament without one keeps none', async () => {
    const { fx } = world('friends8', (s) => (s.tournament.accentColor = null))
    mount(fx, <AdminTournament />)
    await type(screen.getByLabelText(A.tagline), 'La despedida')
    await click(saveButton())
    expect([row().tagline, row().accent_color ?? null]).toEqual(['La despedida', null])
  })
})

describe('the prize check never assumes a field of 12 (ARCH-13, UX-16)', () => {
  it('with no players and no planned field, a pot that pays nothing still saves', async () => {
    const { fx } = world('new-setup')
    expect((snap.tournament.settings as Record<string, unknown>).expectedPlayers).toBeUndefined()
    mount(fx, <AdminTournament />)
    await type(screen.getByLabelText(A.tagline), 'La despedida')
    expect(screen.queryByText(A.fieldUnknownNearSave)).toBeNull()
    await click(saveButton())
    expect(row().tagline).toBe('La despedida')
  })

  it('with no players and no planned field, Dinero asks for one and Guardar waits for it', async () => {
    const { fx } = world('minimal4-setup', (s) => {
      s.players = []
      s.groups = []
      delete (s.tournament.settings as Record<string, unknown>).expectedPlayers
    })
    mount(fx, <AdminTournament />)
    await type(screen.getByLabelText(A.tagline), 'La despedida')
    expect(saveButton().disabled).toBe(true)
    expect(screen.getByText(A.fieldUnknownNearSave)).toBeTruthy()

    await tab(A.tabs.money)
    await type(screen.getByLabelText(A.expectedPlayers), '4')
    expect(screen.queryByText(A.fieldUnknownNearSave)).toBeNull()
    expect(saveButton().disabled).toBe(false)
    await click(saveButton())
    expect(stored().expectedPlayers).toBe(4)
  })
})

describe('Juegos writes only the games (ARCH-13)', () => {
  /** A game's card on Juegos, by its title. */
  const section = (label: string) => screen.getByText(label).closest('section') as HTMLElement

  it('an entry changed on another phone stays when a game changes here', async () => {
    const { fx, reload } = world('friends8')
    const before = structuredClone(stored())
    const low = before.games.find((g) => g.entrants === 'list')!
    mount(fx, <AdminGames />)
    await otherPhone({ settings: { entryFee: before.entryFee + 100 } })

    await click(within(section(low.label)).getByRole('radio', { name: G.everyone }))
    expect(stored().entryFee).toBe(before.entryFee + 100)
    expect(stored().games.find((g) => g.id === low.id)!.entrants).toBe('all')
    expect(reload).toHaveBeenCalled()
  })

  it('a game changed on another phone meanwhile refuses this change instead of being undone, and the screen reads the games again', async () => {
    const { fx, reload } = world('friends8')
    const before = structuredClone(stored())
    const games = structuredClone(before.games)
    const low = games.find((g) => g.entrants === 'list')!
    mount(fx, <AdminGames />)
    games[0]!.label = 'Skins de la tarde'
    await otherPhone({ settings: { games } })

    await click(within(section(low.label)).getByRole('radio', { name: G.everyone }))
    expect(screen.getByText(A.settingsChanged)).toBeTruthy()
    expect(stored().games).toEqual(games)
    expect(reload).toHaveBeenCalled()
  })
})
