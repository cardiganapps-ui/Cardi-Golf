// @vitest-environment happy-dom
/**
 * STRAT-05: Comité › Torneo › Estado, «Enlace para ver». Off until the Comité
 * makes it, «Sin dinero» unless it chooses otherwise; «Cambiar enlace» gives it
 * a new token and «Apagar» takes it away, each asked first; money on for a link
 * already out asks first too (whoever has it sees the money from then on).
 * The token comes from the server each time and lives nowhere else on the
 * phone. Comité › Historial says each step, never the link.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import type { AuditEntry } from '../../data/api'
import { t } from '../../i18n/es-MX'
import { TournamentContext } from '../tournament/TournamentGate'

/** The server's link for the tournament, as 0053 keeps it. */
const server = vi.hoisted(() => ({ link: null as null | { token: string; money: boolean }, n: 0, missing: false }))
const rpc = vi.hoisted(() => vi.fn())
vi.mock('../../lib/supabase', () => ({ supabase: () => ({ rpc }), supabaseConfigured: true }))
const audit = vi.hoisted(() => ({ entries: [] as AuditEntry[] }))
vi.mock('../../data/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../data/api')>()), tournamentAudit: vi.fn(async () => audit.entries) }))

const { SpectatorLinkCard } = await import('./SpectatorLinkCard')
const { AdminHistory } = await import('./AdminHistory')

const S = t.spectator
const fx = getFixture('full12-live')!
const token = () => `tok${String(++server.n).padStart(21, '0')}`
const json = (l: typeof server.link) => (l ? { token: l.token, money: l.money, createdAt: '2027-04-08T20:00:00Z', rotatedAt: null } : null)

beforeEach(() => {
  server.link = null
  server.missing = false
  rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (server.missing) return { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }
    if (name === 'spectator_link') return { data: json(server.link), error: null }
    if (name === 'save_spectator_link') {
      if (!server.link) server.link = { token: token(), money: args.p_money as boolean }
      else server.link = { token: args.p_new_token ? token() : server.link.token, money: args.p_money as boolean }
      return { data: json(server.link), error: null }
    }
    if (name === 'delete_spectator_link') {
      server.link = null
      return { data: null, error: null }
    }
    throw new Error(`unexpected call ${name}`)
  })
})
afterEach(() => {
  cleanup()
  rpc.mockReset()
})

function mount() {
  useTournament.setState({ tournamentId: 'fx-full', data: dataFromSnapshot(structuredClone(fx.snapshot)), loading: false, error: null, realtime: 'off' })
  return render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: 'fx-full', slug: 'nacho', lookup: fx.lookup, me: { playerId: null, isOrganizer: true, isAdmin: true }, refresh: async () => undefined, leave: async () => undefined }}>
        <SpectatorLinkCard />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
}
const choice = (label: string) => screen.getByRole('radio', { name: label })
const calls = () => rpc.mock.calls.map(([name, args]) => [name, args])
const confirm = async (title: string, button: string) => {
  const sheet = (await screen.findAllByRole('dialog')).find((d) => within(d).queryByRole('heading', { name: title }))!
  fireEvent.click(within(sheet).getByRole('button', { name: button }))
}

describe('Enlace para ver (STRAT-05)', () => {
  it('off until the Comité makes it, «Sin dinero» unless it says', async () => {
    mount()
    expect(await screen.findByText(S.none)).toBeTruthy()
    expect(choice(S.noMoney).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText(S.noMoneyHint)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: S.create }))
    await screen.findByText(`${window.location.origin}/v/${server.link!.token}`)
    expect(calls()).toEqual([
      ['spectator_link', { p_tournament_id: 'fx-full' }],
      ['save_spectator_link', { p_tournament_id: 'fx-full', p_money: false, p_new_token: false }],
    ])
    // The TV opens the link's own TV view, in a tab of its own.
    const tv = screen.getByRole('link', { name: S.tv })
    expect(tv.getAttribute('href')).toBe(`${window.location.origin}/v/${server.link!.token}/tv`)
    // The token is the card's: never in the tournament's settings or boards on the phone.
    expect(JSON.stringify(useTournament.getState().data)).not.toContain(server.link!.token)
  })

  it('«Con dinero» chosen before it exists makes it with money, and says what that shows', async () => {
    mount()
    await screen.findByText(S.none)
    fireEvent.click(choice(S.withMoney))
    expect(screen.getByText(S.withMoneyHint)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: S.create }))
    await waitFor(() => expect(server.link?.money).toBe(true))
  })

  it('money on for a link already out asks first; money off does not', async () => {
    server.link = { token: token(), money: false }
    mount()
    await screen.findByText(`${window.location.origin}/v/${server.link.token}`)
    fireEvent.click(choice(S.withMoney))
    expect(await screen.findByText(S.moneyOnBody)).toBeTruthy()
    expect(server.link.money).toBe(false)
    await confirm(S.moneyOnTitle, S.withMoney)
    await waitFor(() => expect(choice(S.withMoney).getAttribute('aria-checked')).toBe('true'))
    expect(server.link!.money).toBe(true)
    fireEvent.click(choice(S.noMoney))
    await waitFor(() => expect(server.link!.money).toBe(false))
  })

  it('«Cambiar enlace» asks, then the old link is gone and the new one is on the card', async () => {
    server.link = { token: token(), money: true }
    const old = server.link.token
    mount()
    await screen.findByText(`${window.location.origin}/v/${old}`)
    fireEvent.click(screen.getByRole('button', { name: S.rotate }))
    expect(await screen.findByText(S.rotateBody)).toBeTruthy()
    await confirm(S.rotate, S.rotate)
    await waitFor(() => expect(screen.queryByText(`${window.location.origin}/v/${old}`)).toBeNull())
    expect(server.link!.token).not.toBe(old)
    expect(server.link!.money).toBe(true)
    expect(screen.getByText(`${window.location.origin}/v/${server.link!.token}`)).toBeTruthy()
  })

  it('«Apagar» asks, then there is no link', async () => {
    server.link = { token: token(), money: false }
    mount()
    await screen.findByText(`${window.location.origin}/v/${server.link.token}`)
    fireEvent.click(screen.getByRole('button', { name: S.off }))
    expect(await screen.findByText(S.offBody)).toBeTruthy()
    await confirm(S.off, S.off)
    expect(await screen.findByText(S.none)).toBeTruthy()
    expect(server.link).toBeNull()
  })

  it('a database without 0053 says so, never an error', async () => {
    server.missing = true
    mount()
    expect(await screen.findByText(S.unavailable)).toBeTruthy()
    expect(screen.queryByRole('button', { name: S.create })).toBeNull()
  })
})

describe('Comité › Historial says each step of the link, never the link (STRAT-05)', () => {
  it('made, money on, a new token, turned off', async () => {
    let id = 0
    const e = (x: Partial<AuditEntry>): AuditEntry => ({ id: ++id, at: '2027-04-08T20:00:00Z', table: 'spectator_links', action: 'UPDATE', rowId: 'fx-full', platform: false, actor: null, reason: null, before: null, after: null, ...x })
    audit.entries = [
      e({ action: 'INSERT', after: { money: false, rotated_at: null } }),
      e({ before: { money: false, rotated_at: null }, after: { money: true, rotated_at: null } }),
      e({ before: { money: true, rotated_at: null }, after: { money: true, rotated_at: '2027-04-09T08:00:00Z' } }),
      e({ action: 'DELETE', before: { money: true, rotated_at: '2027-04-09T08:00:00Z' } }),
    ]
    useTournament.setState({ tournamentId: 'fx-full', data: dataFromSnapshot(structuredClone(fx.snapshot)) })
    render(
      <MemoryRouter>
        <TournamentContext.Provider value={{ tournamentId: 'fx-full', slug: 'nacho', lookup: fx.lookup, me: { playerId: null, isOrganizer: true, isAdmin: true }, refresh: async () => undefined, leave: async () => undefined }}>
          <AdminHistory />
        </TournamentContext.Provider>
      </MemoryRouter>,
    )
    for (const line of [S.history.created(false), S.history.money(true), S.history.rotated, S.history.off]) expect(await screen.findByText(line)).toBeTruthy()
  })
})
