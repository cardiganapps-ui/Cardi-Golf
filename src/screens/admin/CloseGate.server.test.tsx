// @vitest-environment happy-dom
/**
 * «Cerrar torneo» on the server (0029, MONEY-05). The phone's gate stays the
 * first line, with the engine's checks; the database refuses Terminado and a
 * publish on its own for what SQL decides exactly (a planned day missing or
 * open, a hole waiting in «Pendientes de revisar»), so a stale board, a second
 * phone or an older bundle can't close what is still open. Its refusal is a
 * 22023 sentence in Spanish: every one cases/serverRules.json pins on the
 * database reaches the person as written (humanError, which an older bundle
 * runs too), and Datos shows it when the phone's gate let the publish through
 * and the server did not.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { PostgrestError } from '@supabase/supabase-js'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import spec from '../../data/testing/cases/serverRules.json'

const server = vi.hoisted(() => ({ refusal: null as Error | null, published: 0 }))
vi.mock('../../data/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../data/api')>()), openRejectedWrites: vi.fn(async () => 0) }))
vi.mock('../../data/publish', () => ({
  publishFromStore: vi.fn(async () => {
    if (server.refusal) throw server.refusal
    server.published++
    return { players: 4 }
  }),
}))

import { ApiError } from '../../data/api'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import { closeCheck } from '../../engine/close'
import { t } from '../../i18n/es-MX'
import { humanError } from '../../lib/humanError'
import { Toaster } from '../../components/ui'
import { TournamentContext } from '../tournament/TournamentGate'
import { AdminData } from './AdminData'

const C = t.closeGate

/** The refusals the case file pins on the database (and on the test server): the close gate's own. */
const refusals = (spec.cases as Array<{ name: string; expect: { code?: string; message?: string } }>)
  .filter((c) => c.expect.code === '22023' && c.expect.message?.startsWith('Todavía no se'))
  .map((c) => [c.name, c.expect.message!] as const)

describe('the server refuses with a sentence people read (0029)', () => {
  it('the case file pins a refusal for each item and for both actions', () => {
    const all = refusals.map(([, m]) => m)
    expect(all.some((m) => m.startsWith(C.serverRefusedFinish))).toBe(true)
    expect(all.some((m) => m.startsWith(C.serverRefusedPublish))).toBe(true)
    for (const piece of [C.missingRounds([2]), C.openRounds([1]), C.rejectedWrites(1)]) expect(all.some((m) => m.includes(piece))).toBe(true)
    // Several days and several items, as the phone's sheet words them.
    expect(all.some((m) => m.includes(C.openRounds([1, 2])) && m.includes(C.missingRounds([3])))).toBe(true)
  })

  it.each(refusals)('%s: shown as the server says it', (_name, message) => {
    expect(humanError(new ApiError(message, '22023'))).toBe(message)
    expect(humanError(new PostgrestError({ message, code: '22023', details: null as unknown as string, hint: null as unknown as string }))).toBe(message)
  })
})

function mount() {
  // A tournament the phone's gate lets close: its one day finished, Terminado, nothing owed or open.
  const fx = getFixture('minimal4-live')!
  const snap = structuredClone(fx.snapshot)
  snap.rounds = snap.rounds.map((r) => ({ ...r, status: 'finished' }))
  snap.tournament = { ...snap.tournament, status: 'finished' }
  const data = dataFromSnapshot(snap)
  const check = closeCheck(data.snapshot, data.settings, { openRejected: 0 })
  expect(check.ok).toBe(true)
  // Only what people still owe, which never holds the close: the sheet asks once and goes on.
  expect(check.warnings).toHaveLength(1)
  useTournament.setState({ tournamentId: snap.tournament.id, data, loading: false, error: null, realtime: 'off' })
  render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: snap.tournament.id, slug: snap.tournament.slug, lookup: fx.lookup, me: { ...fx.me, isOrganizer: true }, refresh: async () => undefined, leave: async () => undefined }}>
        <AdminData />
        <Toaster />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
}
/** «Publicar resultados», then the gate's sheet (it only warns what is still owed): publish. */
async function publish() {
  fireEvent.click(screen.getByRole('button', { name: t.admin.data.publishButton }))
  const sheet = within(await screen.findByRole('dialog', { name: C.title }))
  expect(sheet.queryByText(C.blocked)).toBeNull()
  fireEvent.click(sheet.getByRole('button', { name: t.admin.data.publishButton }))
  await settle()
}
const settle = () =>
  act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve()
  })

afterEach(() => {
  cleanup()
  server.refusal = null
  server.published = 0
})

describe('«Publicar resultados» when the server holds what the phone did not see (0029)', () => {
  it('a day another phone reopened: the phone\'s gate lets it through, the server refuses, and the screen says what and where', async () => {
    const message = refusals.find(([name]) => name.includes('publishing a Terminado tournament with a day reopened'))![1]
    server.refusal = new ApiError(message, '22023')
    mount()
    await publish()
    expect((await screen.findByText(message)).textContent).toBe(message)
    expect(server.published).toBe(0)
  })

  it('nothing open on either side: it publishes', async () => {
    mount()
    await publish()
    expect(server.published).toBe(1)
  })
})
