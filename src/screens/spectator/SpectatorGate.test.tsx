// @vitest-environment happy-dom
/**
 * STRAT-05: a link to watch, as a browser with no session opens it
 * (`/v/<token>`), on the real screens and the real router. The page asks the
 * server for one thing, `spectator_board`, and writes nothing: no table is
 * read or written, no user starts, no Tarjeta, Comité or Más is reachable.
 * «Sin dinero» shows no money at all, every word read, the sheets and every
 * «¿Cómo se calculó?» opened; «Con dinero» shows Dinero, read-only. A link the
 * Comité changes or switches off stops on screen within one poll, and the page
 * polls as the boards move, only while it is on screen.
 */
import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Snapshot } from '../../engine/types'
import { t } from '../../i18n/es-MX'

type Answer = { data: unknown; error: { message: string; code?: string } | null }
const rpc = vi.fn<(name: string, args: Record<string, unknown>) => Promise<Answer>>()
const from = vi.fn(() => {
  throw new Error('a link to watch reads and writes no table')
})
const auth = new Proxy({}, { get: () => () => { throw new Error('a link to watch starts no session') } })
// The app's client is never used on a link: its asks go as anon with no session (`anonRpc`), which answers from `rpc`.
const appClient = vi.fn(() => {
  throw new Error('a link to watch asks nothing with the app’s client (its session)')
})
vi.mock('../../lib/supabase', () => ({ supabase: () => ({ rpc: appClient, from, auth, channel: from, removeChannel: from }), supabaseConfigured: true }))
vi.mock('../../data/anonRpc', async () => {
  const { ApiError } = await import('../../data/api')
  return {
    anonRpc: async (name: string, args: Record<string, unknown>) => {
      const res = await rpc(name, args)
      if (res.error) throw ApiError.from(res.error)
      return res.data
    },
  }
})
vi.mock('canvas-confetti', () => ({ default: vi.fn() }))
// The share image stays mounted while it is being made: the test reads it, and nothing is ever shared.
vi.mock('../../components/shareAction', () => ({ shareCard: vi.fn(() => new Promise(() => undefined)) }))

const { getFixture } = await import('../../dev/fixtures')
const { spectatorAnswer } = await import('../../data/testing/spectatorAnswer')
const { spectatorStoreId } = await import('../../data/spectator')
const { useTournament } = await import('../../data/tournamentStore')
const { SpectatorGate } = await import('./SpectatorGate')
const { spectatorChildren } = await import('./routes')
// The routes' screens are lazy (PERF-02): loaded here, so each test's waits time the page, not a module's first load.
const screens = await import('../../app/screens')
await Promise.all([screens.TournamentShell, screens.LiveScreen, screens.GamesScreen, screens.SpectatorMoney, screens.TvScreen].map((s) => s.preload()))

// happy-dom rejects a running animation's `finished` when the test unmounts it; nothing here waits on it.
const cancelAnimation = Animation.prototype.cancel
Animation.prototype.cancel = function (this: Animation) {
  this.finished.catch(() => undefined)
  return cancelAnimation.call(this)
}

const TOKEN = 'sSjvTXmU1SDUNaaBFsFGLc7N'
let answers: Array<Answer | (() => Answer)> = []
/** The server: each call takes the next answer; the last one repeats. */
function serve(...list: Array<Answer | (() => Answer)>) {
  answers = list
}
const board = (fixture: string, money: boolean, version = 'v1', edit?: (s: Snapshot) => void): Answer => {
  const s = structuredClone(getFixture(fixture)!.snapshot)
  edit?.(s)
  return { data: spectatorAnswer(s, money, version), error: null }
}

beforeEach(() => {
  rpc.mockImplementation(async () => {
    const next = answers.length > 1 ? answers.shift()! : answers[0]!
    return typeof next === 'function' ? next() : next
  })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  rpc.mockReset()
  from.mockClear()
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
})

function open(path = `/v/${TOKEN}`) {
  const router = createMemoryRouter([{ path: '/v/:token', element: <SpectatorGate />, children: spectatorChildren }], { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}
/** Every peso on screen: there must be none on a link «Sin dinero». */
const pesos = () => (document.body.textContent ?? '').match(/\$\s?[\d,.]+|\bMXN\b/g) ?? []
const rows = () => document.querySelectorAll('button[class*="leaderRow"]')
/** Each «¿Cómo se calculó?» on screen, opened and read, then closed. */
async function readEveryExplanation(inside: ParentNode = document) {
  const triggers = Array.from(inside.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="dialog"]'))
  for (const b of triggers) {
    fireEvent.click(b)
    const dialogs = await screen.findAllByRole('dialog')
    expect(pesos(), `«${b.textContent}» explains no money`).toEqual([])
    fireEvent.click(within(dialogs.at(-1)!).getAllByRole('button', { name: t.common.close }).at(0)!)
  }
  return triggers.length
}
/** Copy that sends the reader to a Comité screen: never on a link to watch, which is nobody's to act on. */
const comiteSteps = () => (document.body.textContent ?? '').match(/[^.]*en Comité, sección[^.]*\./g) ?? []
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
/** The calls the page made: only ever the boards. */
const asked = () => rpc.mock.calls.map(([name]) => name)
/**
 * The page's timers on a fake clock the test moves, which also keeps moving
 * with real time: the testing library's own zero-delay waits must still run.
 */
const fakeTimers = () => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true })

describe('a link «Sin dinero» (the default)', () => {
  it('En vivo: the board, no money anywhere, no way to the Tarjeta, the Comité or Más', async () => {
    serve(board('full12-live', false))
    open()
    await waitFor(() => expect(rows().length).toBe(12))
    expect(pesos()).toEqual([])
    expect(screen.queryByText(t.money.ifEndedNow)).toBeNull()
    // The tabs it has: En vivo and Juegos. No Tarjeta, no Dinero, no Más.
    const tabs = within(screen.getByRole('navigation', { name: t.common.sections })).getAllByRole('link').map((a) => a.textContent)
    expect(tabs).toEqual([t.nav.live, t.nav.games])
    // Every link stays on the link to watch: none leads to the tournament's own pages (Entrar, the PIN).
    for (const a of document.querySelectorAll('a[href]')) expect(a.getAttribute('href')).toMatch(new RegExp(`^/v/${TOKEN}(/|$)`))
    // What the page is, and the TV.
    expect(screen.getByText(t.spectator.note)).toBeTruthy()
    expect(screen.getByRole('link', { name: new RegExp(t.spectator.viewTv) }).getAttribute('href')).toBe(`/v/${TOKEN}/tv`)
    // The Comité's lines (a tiebreak to answer, a warning) are not a spectator's: the fixture has a pending one.
    expect(screen.queryByText(t.live.pendingSnake(1))).toBeNull()
    expect(asked()).toEqual(['spectator_board'])
    expect(rpc.mock.calls[0]![1]).toEqual({ p_token: TOKEN, p_seen: null })
    expect(appClient).not.toHaveBeenCalled()
    expect(from).not.toHaveBeenCalled()
  })

  it('on a phone that could install Polo: no install card and no notices offer (the app would open Home, not the link)', async () => {
    const ua = navigator.userAgent
    Object.defineProperty(navigator, 'userAgent', { value: IPHONE, configurable: true })
    try {
      serve(board('full12-live', false))
      open()
      await waitFor(() => expect(rows().length).toBe(12))
      expect(screen.queryByRole('region', { name: t.install.title })).toBeNull()
      expect(screen.queryByText(t.install.why)).toBeNull()
    } finally {
      Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true })
    }
  })

  it('tells a search engine to keep away while it is on screen', async () => {
    serve(board('full12-live', false))
    open()
    await waitFor(() => expect(rows().length).toBe(12))
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, nofollow')
    cleanup()
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull()
  })

  it('the leaderboard’s share image says nothing of money either: no «si terminara ahora»', async () => {
    serve(board('full12-live', false))
    open()
    await waitFor(() => expect(rows().length).toBe(12))
    fireEvent.click(screen.getAllByRole('button', { name: t.share.leaderboard })[0]!)
    const card = await waitFor(() => document.querySelector('[data-share-card="leaderboard"]')!)
    expect(card.textContent).toContain(getFixture('full12-live')!.snapshot.tournament.name)
    expect(card.textContent).not.toContain(t.money.ifEndedNow)
    expect(card.textContent?.match(/\$\s?[\d,.]+/g) ?? []).toEqual([])
  })

  it('a player’s sheet: his card and handicap, every explanation opened, and not a peso; no money section', async () => {
    serve(board('full12-live', false))
    open()
    await waitFor(() => expect(rows().length).toBe(12))
    fireEvent.click(rows()[0]!)
    const sheet = await screen.findByRole('dialog')
    expect(within(sheet).queryByText(t.nav.money)).toBeNull()
    expect(pesos()).toEqual([])
    expect(await readEveryExplanation(sheet)).toBeGreaterThan(0)
    expect(from).not.toHaveBeenCalled()
  })

  // One fixture per test: all three in one ran past Vitest's 5 s on a loaded machine.
  it.each(['full12-live', 'friends8', 'large60'])('Juegos and each of its games on %s, every explanation opened: not a peso, no way to Dinero or the Reglamento', async (fixture) => {
    {
      serve(board(fixture, false))
      const router = open(`/v/${TOKEN}/juegos`)
      await screen.findByRole('heading', { level: 1, name: t.nav.games })
      expect(pesos(), fixture).toEqual([])
      expect(screen.queryByText(t.games.seeMoney)).toBeNull()
      expect(screen.queryByText(t.games.seeRules)).toBeNull()
      const games = Array.from(document.querySelectorAll<HTMLButtonElement>('button[class*="gameRow"]')).map((b) => b.querySelector('[class*="gameLabel"]')?.textContent ?? '')
      expect(games.length, fixture).toBeGreaterThan(0)
      // The Calcutta is all money: it is not one of them.
      expect(games).not.toContain('La Calcutta')
      for (const label of games) {
        fireEvent.click(screen.getAllByRole('button').find((b) => b.querySelector('[class*="gameLabel"]')?.textContent === label)!)
        await screen.findByRole('heading', { level: 1, name: label })
        expect(pesos(), `${fixture}: ${label}`).toEqual([])
        await readEveryExplanation()
        fireEvent.click(screen.getByRole('button', { name: t.common.back }))
        await screen.findByRole('heading', { level: 1, name: t.nav.games })
      }
      expect(router.state.location.pathname).toBe(`/v/${TOKEN}/juegos`)
    }
    expect(new Set(asked())).toEqual(new Set(['spectator_board']))
    expect(from).not.toHaveBeenCalled()
  })

  it('Dinero is not there, and its address leads back to En vivo', async () => {
    serve(board('full12-live', false))
    const router = open(`/v/${TOKEN}/dinero`)
    await waitFor(() => expect(router.state.location.pathname).toBe(`/v/${TOKEN}`))
    await waitFor(() => expect(rows().length).toBe(12))
    expect(pesos()).toEqual([])
  })

  it('the TV: every board of the rotation, and not a peso', async () => {
    serve(board('full12-live', false))
    open(`/v/${TOKEN}/tv`)
    await screen.findAllByRole('heading', { level: 2 })
    const seen = new Set<string>()
    for (let i = 0; i < 8; i++) {
      // The board leaving and the one coming in can share the screen a moment (MOT-01): both are read.
      for (const h of document.querySelectorAll('section h2')) seen.add((h.textContent ?? '').replace(/\s*\d+–\d+ de \d+$/, ''))
      expect(pesos(), `board ${i}`).toEqual([])
      await act(async () => {
        fireEvent.keyDown(window, { key: 'ArrowRight' })
      })
    }
    // Individual, the pairs, the snake, the feed at least: and never the Calcutta's values.
    expect(seen.size).toBeGreaterThanOrEqual(4)
    expect([...seen].some((x) => x.startsWith('La Calcutta'))).toBe(false)
    expect(screen.getByRole('link', { name: t.tv.exit }).getAttribute('href')).toBe(`/v/${TOKEN}`)
  })

  it('Calcutta night on the TV: it says the auction needs the link with money', async () => {
    serve(board('auction12', false))
    open(`/v/${TOKEN}/tv`)
    expect(await screen.findByText(t.spectator.tvNeedsMoney)).toBeTruthy()
    expect(pesos()).toEqual([])
  })

  it('…and once the pairs are drawn, the draw, which carries no money', async () => {
    serve(board('draw12', false))
    open(`/v/${TOKEN}/tv`)
    await waitFor(() => expect(document.querySelectorAll('[data-pair]').length).toBe(6))
    expect(screen.queryByText(t.spectator.tvNeedsMoney)).toBeNull()
    expect(pesos()).toEqual([])
  })
})

describe('a link «Con dinero»', () => {
  it('Dinero is there, read-only: no «Marcar pagado», no «El Comité decide»', async () => {
    serve(board('full12-finished', true))
    open()
    await waitFor(() => expect(rows().length).toBe(12))
    expect(pesos().length).toBeGreaterThan(0)
    const tabs = within(screen.getByRole('navigation', { name: t.common.sections })).getAllByRole('link').map((a) => a.textContent)
    expect(tabs).toEqual([t.nav.live, t.nav.games, t.nav.money])
    fireEvent.click(screen.getByRole('link', { name: t.nav.money }))
    await screen.findByRole('heading', { level: 1, name: t.nav.money })
    for (const mode of [t.moneyScreen.live, t.moneyScreen.byGame, t.moneyScreen.final]) {
      fireEvent.click(screen.getByRole('radio', { name: mode }))
      expect(screen.queryByRole('button', { name: new RegExp(`^${t.moneyScreen.markPaid}`) })).toBeNull()
      expect(screen.queryByRole('button', { name: t.unassigned.decide })).toBeNull()
      expect(screen.queryByRole('button', { name: new RegExp(`^${t.moneyScreen.paid}`) })).toBeNull()
    }
    // Nor a way to the Reglamento, which a link does not open.
    expect(screen.queryByRole('link', { name: t.moneyScreen.seeRules })).toBeNull()
    expect(from).not.toHaveBeenCalled()
  })

  it('nothing sends the reader to a Comité screen, on any tab, even with a pot that doesn’t square and no banker', async () => {
    // The verifier's case: «El Comité ajusta los premios en Comité, sección Torneo» on a link's Dinero.
    serve(board('full12-live', true, 'v1', (s) => {
      ;(s.tournament.settings as { entryFee: number }).entryFee = 100
      s.tournament.bankerPlayerId = null
    }))
    open()
    await waitFor(() => expect(rows().length).toBe(12))
    expect(comiteSteps()).toEqual([])
    for (const tab of [t.nav.games, t.nav.money]) {
      fireEvent.click(screen.getByRole('link', { name: tab }))
      await screen.findByRole('heading', { level: 1, name: tab })
      if (tab === t.nav.money) {
        for (const mode of [t.moneyScreen.live, t.moneyScreen.byGame, t.moneyScreen.final]) {
          fireEvent.click(screen.getByRole('radio', { name: mode }))
          expect(comiteSteps(), mode).toEqual([])
        }
      } else expect(comiteSteps(), tab).toEqual([])
    }
    // The verdict still says the pot is open: only where the Comité fixes it is left out.
    expect(document.body.textContent).toContain(t.moneyScreen.provisional)
  })

  it('the TV on Calcutta night: the auction board, with its prices', async () => {
    serve(board('auction12', true))
    open(`/v/${TOKEN}/tv`)
    await waitFor(() => expect(document.querySelectorAll('[data-sold-at]').length).toBe(9))
    expect(screen.queryByText(t.spectator.tvNeedsMoney)).toBeNull()
  })
})

describe('a link that does not work', () => {
  it('wrong, changed or switched off: «Este enlace ya no funciona», and nothing else is asked', async () => {
    serve({ data: null, error: null })
    open()
    expect(await screen.findByText(t.spectator.gone)).toBeTruthy()
    expect(screen.getByText(t.spectator.goneHint)).toBeTruthy()
    expect(asked()).toEqual(['spectator_board'])
  })

  it('a token that is not one is never sent', async () => {
    serve(board('full12-live', false))
    open('/v/no-es-un-enlace')
    expect(await screen.findByText(t.spectator.gone)).toBeTruthy()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('changed while on screen: the boards go at the next ask, and so does what they showed', async () => {
    fakeTimers()
    serve(board('full12-live', false), { data: null, error: null })
    open()
    await waitFor(() => expect(rows().length).toBe(12))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000)
    })
    expect(await screen.findByText(t.spectator.gone)).toBeTruthy()
    expect(useTournament.getState().data).toBeNull()
  })
})

describe('polling', () => {
  it('a day in play: every 20 s, sending the version it holds; nothing changed costs the version alone', async () => {
    fakeTimers()
    serve(board('full12-live', false, 'v1'), { data: { version: 'v1', same: true }, error: null })
    open()
    await waitFor(() => expect(rows().length).toBe(12))
    const first = useTournament.getState().updatedAt
    await act(async () => {
      await vi.advanceTimersByTimeAsync(19_000)
    })
    expect(rpc).toHaveBeenCalledTimes(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(rpc.mock.calls[1]![1]).toEqual({ p_token: TOKEN, p_seen: 'v1' })
    // The boards stay as they were, as fresh as the answer.
    expect(rows().length).toBe(12)
    expect(useTournament.getState().updatedAt).toBeGreaterThanOrEqual(first)
    expect(useTournament.getState().tournamentId).toBe(spectatorStoreId(TOKEN))
  })

  it('a hole saved elsewhere shows at the next ask', async () => {
    fakeTimers()
    const fx = getFixture('full12-live')!
    const live = fx.snapshot.rounds.find((r) => r.status === 'live')!
    // One more hole for the leader's group: the board changes.
    const moved = board('full12-live', false, 'v2', (s) => {
      for (const x of s.scores) if (x.roundId === live.id && x.strokes != null) x.strokes = 1
    })
    serve(board('full12-live', false, 'v1'), moved)
    open()
    await waitFor(() => expect(rows().length).toBe(12))
    const before = Array.from(rows()).map((r) => r.getAttribute('aria-label')).join('|')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000)
    })
    await waitFor(() => expect(Array.from(rows()).map((r) => r.getAttribute('aria-label')).join('|')).not.toBe(before))
  })

  it('out of sight it asks nothing; back on screen it asks at once', async () => {
    fakeTimers()
    serve(board('full12-live', false, 'v1'), { data: { version: 'v1', same: true }, error: null })
    open()
    await waitFor(() => expect(rows().length).toBe(12))
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000)
    })
    expect(rpc).toHaveBeenCalledTimes(1)
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(rpc).toHaveBeenCalledTimes(2)
  })

  it('a failed ask keeps the boards up, says how old they are, and waits longer before the next', async () => {
    fakeTimers()
    serve(board('full12-live', false, 'v1'), { data: null, error: { message: 'gateway', code: '503' } })
    open()
    await waitFor(() => expect(rows().length).toBe(12))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000)
    })
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(rows().length).toBe(12)
    expect(useTournament.getState().error).not.toBeNull()
    expect(document.querySelector('header')?.textContent).toContain(t.sync.boardsAge('').trim())
    // The next ask waits twice as long (40 s), not 20.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000)
    })
    expect(rpc).toHaveBeenCalledTimes(2)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000)
    })
    expect(rpc).toHaveBeenCalledTimes(3)
  })

  it('keeps nothing on the phone: no boards saved, no entry, nothing in storage (the notice’s «no guarda nada»)', async () => {
    fakeTimers()
    serve(board('full12-live', true, 'v1'), board('full12-live', true, 'v2', (s) => void (s.scores = s.scores.slice(1))))
    open()
    await waitFor(() => expect(rows().length).toBe(12))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(rpc).toHaveBeenCalledTimes(2)
    cleanup()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    // The boards a member's phone keeps for opening with no signal (snapshotCache): none for a link.
    const cache = new Dexie('cardi-golf-cache')
    cache.version(1).stores({ entries: 'slug, tournamentId', snapshots: 'tournamentId' })
    expect([await cache.table('entries').count(), await cache.table('snapshots').count()]).toEqual([0, 0])
    cache.close()
    const stored = JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)])
    expect(stored).not.toContain(TOKEN)
    expect(stored).not.toContain(getFixture('full12-live')!.snapshot.tournament.name)
  })

  it('leaving the page stops the asks and forgets the boards', async () => {
    fakeTimers()
    serve(board('full12-live', true, 'v1'))
    open()
    await waitFor(() => expect(rows().length).toBe(12))
    cleanup()
    expect(useTournament.getState().data).toBeNull()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000)
    })
    expect(rpc).toHaveBeenCalledTimes(1)
  })
})
