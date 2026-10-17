// @vitest-environment happy-dom
/**
 * «Avisos del torneo» (PWA-10): the switch in Más and the offer on En vivo. The permission prompt only ever
 * comes from the tap; the offer comes in the installed app once this phone's player saved a hole, never before
 * and never over the Tarjeta. A PIN phone saves its address for the player it holds; an account that is the
 * player turns on its own notices.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const browser = vi.hoisted(() => ({ state: 'off', standalone: true, platform: 'android' }))
vi.mock('../../lib/install', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/install')>()),
  isStandalone: () => browser.standalone,
  devicePlatform: () => browser.platform,
}))
vi.mock('../../data/push', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../data/push')>()
  return {
    ...real,
    pushState: vi.fn(async () => browser.state),
    enablePush: vi.fn(async () => (browser.state = 'on')),
    disablePush: vi.fn(async () => (browser.state = 'off')),
  }
})
vi.mock('../../components/toast', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../components/toast')>()),
  toast: vi.fn(),
}))

import { disablePush, enablePush } from '../../data/push'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import { getFixture } from '../../dev/fixtures'
import type { Snapshot } from '../../engine/types'
import { t } from '../../i18n/es-MX'
import { TournamentContext, type Me } from './tournamentContext'
import { TournamentPushOffer, TournamentPushSwitch } from './TournamentPush'

const T = t.push.tournament
const fx = getFixture('full12-live')!
const PIN_NOTE =
  'Al activarlos, Polo guarda la dirección de avisos de este navegador, ligada a tu jugador, hasta que este teléfono deje de entrar como él, como dice el Aviso de privacidad (se abre en otra pestaña).'
const ACCOUNT_NOTE =
  'Al activarlos, Polo guarda la dirección de avisos de este navegador, como dice el Aviso de privacidad (se abre en otra pestaña).'

function mount(node: React.ReactNode, o: { me?: Partial<Me>; edit?: (s: Snapshot) => void } = {}) {
  const snap = structuredClone(fx.snapshot)
  o.edit?.(snap)
  useTournament.setState({
    tournamentId: 'fixture:full12-live',
    data: dataFromSnapshot(snap),
    loading: false,
    error: null,
    realtime: 'off',
  })
  const me: Me = { ...fx.me, via: 'device', ...o.me }
  return render(
    <MemoryRouter>
      <TournamentContext.Provider
        value={{
          tournamentId: snap.tournament.id,
          slug: '_/full12-live',
          lookup: fx.lookup,
          me,
          refresh: async () => undefined,
          leave: async () => undefined,
        }}
      >
        {node}
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
}
/** A hole this phone's player saved: what the offer waits for. */
const holeByMe = (s: Snapshot) =>
  void s.scores.push({
    roundId: s.rounds[0]!.id,
    playerId: fx.me.playerId!,
    hole: 18,
    strokes: 4,
    putts: 2,
    pickedUp: false,
    enteredBy: fx.me.playerId!,
    updatedAt: '2027-04-09T16:00:00Z',
  })
const settle = () => act(() => new Promise((r) => setTimeout(r, 0)))

beforeEach(() => {
  browser.state = 'off'
  browser.standalone = true
  browser.platform = 'android'
  localStorage.clear()
  vi.mocked(enablePush).mockClear()
  vi.mocked(disablePush).mockClear()
})
afterEach(cleanup)

describe('the switch in Más', () => {
  it('a PIN phone: what they say for this tournament’s games, what turning them on keeps, then the tap', async () => {
    mount(<TournamentPushSwitch />)
    const enable = await screen.findByRole('button', { name: t.push.enable })
    const settings = useTournament.getState().data!.settings
    expect(screen.getByText(T.title)).toBeTruthy()
    expect(
      screen.getByText(
        `Te avisamos en este teléfono cuando empiece cada día, cuando te toque firmar una tarjeta, cuando en ${settings.modules.snake.label} falte decir quién embocó al último, cuando el Comité corrija tu tarjeta y cuando salgan los resultados. Nunca llevan montos.`,
      ),
    ).toBeTruthy()
    const line = document.querySelector<HTMLElement>('[data-legal-consent]')!
    expect(line.textContent).toBe(PIN_NOTE)
    expect(line.compareDocumentPosition(enable) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(enable.getAttribute('aria-describedby')).toBe(line.id)
    // Nothing is asked of the browser until the tap.
    expect(enablePush).not.toHaveBeenCalled()
    fireEvent.click(enable)
    await settle()
    expect(enablePush).toHaveBeenCalledWith({ kind: 'player', tournamentId: fx.snapshot.tournament.id })
    expect(await screen.findByText(t.push.on)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: t.push.disable }))
    await settle()
    expect(disablePush).toHaveBeenCalledWith({ kind: 'player', tournamentId: fx.snapshot.tournament.id })
  })

  it('an account that is the player: its own notices, and the account’s line', async () => {
    mount(<TournamentPushSwitch />, { me: { via: 'profile' } })
    fireEvent.click(await screen.findByRole('button', { name: t.push.enable }))
    await settle()
    expect(enablePush).toHaveBeenCalledWith({ kind: 'account' })
    browser.state = 'off'
    cleanup()
    mount(<TournamentPushSwitch />, { me: { via: 'profile' } })
    await screen.findByRole('button', { name: t.push.enable })
    expect(document.querySelector('[data-legal-consent]')!.textContent).toBe(ACCOUNT_NOTE)
  })

  it('a tournament without the pairs game or the snake promises neither', async () => {
    mount(<TournamentPushSwitch />, {
      edit: (s) => {
        const settings = s.tournament.settings as { modules: Record<string, { enabled: boolean }> }
        settings.modules.pairs!.enabled = false
        settings.modules.snake!.enabled = false
      },
    })
    expect(
      await screen.findByText(
        'Te avisamos en este teléfono cuando empiece cada día, cuando el Comité corrija tu tarjeta y cuando salgan los resultados. Nunca llevan montos.',
      ),
    ).toBeTruthy()
  })

  it('the Comité with no player, and the Admin de Polo, have no player to hear for', async () => {
    mount(<TournamentPushSwitch />, { me: { playerId: null, isOrganizer: true, isComite: true, via: null } })
    await settle()
    expect(screen.queryByText(T.title)).toBeNull()
    cleanup()
    mount(<TournamentPushSwitch />, { me: { playerId: null, isOrganizer: true, isComite: true, via: 'platform' } })
    await settle()
    expect(screen.queryByText(T.title)).toBeNull()
  })

  it('an iPhone in Safari: the app on the home screen first (iOS 16.4 or newer), and no button', async () => {
    browser.state = 'needsInstall'
    browser.platform = 'ios'
    browser.standalone = false
    mount(<TournamentPushSwitch />)
    expect(await screen.findByText(t.push.needsInstall)).toBeTruthy()
    expect(t.push.needsInstall).toContain('iOS 16.4')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('blocked in the installed iPhone app: the phone’s Ajustes, not a browser’s (PWA-12)', async () => {
    browser.state = 'denied'
    browser.platform = 'ios'
    mount(<TournamentPushSwitch />)
    expect(await screen.findByText(t.push.deniedIos)).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('the offer on En vivo', () => {
  it('not before this phone’s player saved a hole', async () => {
    mount(<TournamentPushOffer />)
    await settle()
    expect(screen.queryByRole('region', { name: T.title })).toBeNull()
  })

  it('not in a browser tab: only in the installed app', async () => {
    browser.standalone = false
    mount(<TournamentPushOffer />, { edit: holeByMe })
    await settle()
    expect(screen.queryByRole('region', { name: T.title })).toBeNull()
  })

  it('after the first saved hole in the installed app: one tap turns them on, and it goes', async () => {
    mount(<TournamentPushOffer />, { edit: holeByMe })
    const card = await screen.findByRole('region', { name: T.title })
    expect(card.querySelector('[data-legal-consent]')!.textContent).toBe(PIN_NOTE)
    fireEvent.click(screen.getByRole('button', { name: t.push.enable }))
    await settle()
    expect(enablePush).toHaveBeenCalledWith({ kind: 'player', tournamentId: fx.snapshot.tournament.id })
    expect(screen.queryByRole('region', { name: T.title })).toBeNull()
  })

  it('«Ahora no» puts it away for this tournament, and it stays away', async () => {
    mount(<TournamentPushOffer />, { edit: holeByMe })
    fireEvent.click(await screen.findByRole('button', { name: T.later }))
    expect(screen.queryByRole('region', { name: T.title })).toBeNull()
    cleanup()
    mount(<TournamentPushOffer />, { edit: holeByMe })
    await settle()
    expect(screen.queryByRole('region', { name: T.title })).toBeNull()
    expect(enablePush).not.toHaveBeenCalled()
  })

  it('nothing to offer when they are on, blocked or impossible here: that is Más’s to explain', async () => {
    for (const state of ['on', 'denied', 'unsupported']) {
      browser.state = state
      mount(<TournamentPushOffer />, { edit: holeByMe })
      await settle()
      expect(screen.queryByRole('region', { name: T.title }), state).toBeNull()
      cleanup()
    }
  })
})
