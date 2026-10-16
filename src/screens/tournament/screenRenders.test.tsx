// @vitest-environment happy-dom
/**
 * PERF-09: every store update re-rendered every mounted screen component,
 * even when nothing had changed. On En vivo a reload that brought nothing new
 * cost 282 component renders and 3 commits, one changed score 414, and the
 * «hace N min» clock rendered the whole board every 30 s. The budget: a reload
 * with nothing new ≤ 5 component renders; one changed score ≤ the rows that
 * changed + 1 (plus what shows the change: the feed, the spotlight); the clock
 * renders its own line, and only when its words change.
 *
 * Juegos, Dinero and the Tarjeta rendered 26, 50 and 74 components on the same
 * reload; they render nothing now.
 *
 * Renders are counted the way React DevTools counts them: a hook React reports
 * every commit to, and the component fibers that did work in it.
 */
import 'fake-indexeddb/auto'
import { act, cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const renders = vi.hoisted(() => {
  type Fiber = { tag: number; flags: number; type: unknown; elementType: unknown; child: Fiber | null; sibling: Fiber | null; alternate: Fiber | null }
  const out = { commits: 0, total: 0, byName: new Map<string, number>() }
  // FunctionComponent, ClassComponent, ForwardRef, MemoComponent, SimpleMemoComponent.
  const COMPONENT = new Set([0, 1, 11, 14, 15])
  const PERFORMED_WORK = 1
  const nameOf = (f: Fiber): string => {
    const t = (f.type ?? f.elementType) as { displayName?: string; name?: string; render?: { name?: string }; type?: { name?: string } } | null
    return t?.displayName ?? t?.name ?? t?.render?.name ?? t?.type?.name ?? 'Anonymous'
  }
  const walk = (f: Fiber, prev: Fiber | null) => {
    if (COMPONENT.has(f.tag) && (prev === null || (f.flags & PERFORMED_WORK) !== 0)) {
      out.total++
      const n = nameOf(f)
      out.byName.set(n, (out.byName.get(n) ?? 0) + 1)
    }
    // A subtree React did not visit in this render keeps the children it had.
    if (prev !== null && f.child === prev.child) return
    for (let c = f.child; c; c = c.sibling) walk(c, c.alternate)
  }
  ;(globalThis as Record<string, unknown>).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    isDisabled: false,
    renderers: new Map(),
    inject: () => 1,
    onScheduleFiberRoot: () => undefined,
    onCommitFiberRoot: (_id: number, root: { current: Fiber }) => {
      out.commits++
      walk(root.current, root.current.alternate)
    },
    onPostCommitFiberRoot: () => undefined,
    onCommitFiberUnmount: () => undefined,
    checkDCE: () => undefined,
  }
  return {
    reset: () => {
      out.commits = 0
      out.total = 0
      out.byName.clear()
    },
    get: () => ({ commits: out.commits, total: out.total, byName: Object.fromEntries(out.byName) }),
  }
})

import { getFixture } from '../../dev/fixtures'
import { fakeSupabase, type FakeSupabase } from '../../data/testing/fakeSupabase'
import { snapshotToRows } from '../../data/testing/rows'

let server: FakeSupabase = fakeSupabase({})
vi.mock('../../lib/supabase', () => ({ supabase: () => server.client, supabaseConfigured: true }))
vi.mock('canvas-confetti', () => ({ default: vi.fn() }))

const { useTournament } = await import('../../data/tournamentStore')
const { LiveScreen } = await import('./LiveScreen')
const { GamesScreen } = await import('./GamesScreen')
const { MoneyScreen } = await import('./MoneyScreen')
const { ScorecardScreen } = await import('./ScorecardScreen')
const { TournamentContext } = await import('./tournamentContext')

// happy-dom rejects a running animation's `finished` when the test unmounts it; nothing here waits on it.
const cancelAnimation = Animation.prototype.cancel
Animation.prototype.cancel = function (this: Animation) {
  this.finished.catch(() => undefined)
  return cancelAnimation.call(this)
}

const fx = getFixture('full12-live')!
const TID = fx.snapshot.tournament.id
const store = () => useTournament.getState()

async function mountLive(screen: React.ReactNode = <LiveScreen />) {
  server = fakeSupabase(snapshotToRows(fx.snapshot))
  await store().load(TID)
  expect(store().error).toBeNull()
  render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: TID, slug: 'full12', lookup: fx.lookup, me: fx.me, refresh: async () => undefined, leave: async () => undefined }}>
        {screen}
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
  // The channel comes up and fetches what it missed; the board's first moves settle.
  server.channels.at(-1)?.status?.('SUBSCRIBED')
  await act(async () => {
    await new Promise((r) => setTimeout(r, 800))
  })
}

beforeEach(() => {
  renders.reset()
})
afterEach(() => {
  cleanup()
  store().unsubscribe()
  vi.useRealTimers()
  useTournament.setState({ tournamentId: null, loading: false, error: null, data: null, realtime: 'off', updatedAt: 0, source: null, keepOnPhone: true })
})

/** What a row shows, per player: a row re-renders when this changes, or when it moved. */
const shown = () =>
  new Map(
    (store().data!.state.modules.individual?.rows ?? []).map((r, i) => {
      const day = r.perRound.at(-1)
      return [r.playerId, `${i}|${r.label}|${r.figure.text}|${day && !day.empty ? day.text : ''}`] as const
    }),
  )
const rowRenders = (byName: Record<string, number>) => Object.entries(byName).reduce((n, [k, v]) => n + (k.startsWith('BoardRow') ? v : 0), 0)

describe('En vivo renders what changed, and nothing when nothing did (PERF-09)', () => {
  it('a reload that brings nothing new: one line renders, the boards’ age, at most 5 components', async () => {
    await mountLive()
    renders.reset()
    await act(async () => {
      await store().reload()
    })
    const r = renders.get()
    expect(r.total).toBeLessThanOrEqual(5)
    expect(rowRenders(r.byName)).toBe(0)
  })

  it('one score changed: only the rows whose values changed, the board around them, and nothing else on the screen', async () => {
    await mountLive()
    const live = fx.snapshot.rounds.find((r) => r.status === 'live')!
    const row = server.tables.scores!.find((x) => x.strokes != null && x.round_id === live.id)!
    row.strokes = (row.strokes as number) + 1
    const before = shown()
    renders.reset()
    await act(async () => {
      await store().reload()
    })
    const after = shown()
    const changed = [...after].filter(([id, sig]) => before.get(id) !== sig).length
    const r = renders.get()
    expect(changed).toBeGreaterThan(0)
    expect(rowRenders(r.byName)).toBe(changed)
    // The screen and the board's frame (its status line, header, spotlight, toggle), then six components per row.
    expect(r.total).toBeLessThanOrEqual(10 + 6 * changed)
    // The feed did not change; a closed sheet, the share button and a Ronda rápida's card are not this score's.
    for (const name of ['FeedTicker', 'PlayerSheet', 'ShareCardButton', 'QuickFinish']) expect(r.byName[name] ?? 0).toBe(0)
  })

  it('a birdie reaches the feed: what the feed shows is what the engine says, line for line', async () => {
    await mountLive()
    const live = fx.snapshot.rounds.find((r) => r.status === 'live')!
    const latest = server.tables.scores!.filter((x) => x.round_id === live.id).reduce((a, b) => ((a.updated_at as string) > (b.updated_at as string) ? a : b))
    const row = server.tables.scores!.find((x) => x.round_id === live.id && x.strokes != null && !x.picked_up)!
    row.strokes = 1
    row.updated_at = new Date(Date.parse(latest.updated_at as string) + 60_000).toISOString()
    await act(async () => {
      await store().reload()
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400))
    })
    const d = store().data!
    const nameOf = (id: string) => d.snapshot.players.find((p) => p.id === id)?.displayName ?? '?'
    const { feedText } = await import('../../lib/figureText')
    const expected = d.state.feed.slice(0, 10).map((e) => feedText(e, nameOf))
    expect(expected.some((x) => x.includes(nameOf(row.player_id as string)))).toBe(true)
    const onScreen = [...document.querySelectorAll('[class*="item"] [class*="text"]')].map((x) => x.textContent)
    expect(onScreen).toEqual(expected)
  })
})

describe('the other tabs render nothing on a reload that brings nothing new (PERF-09)', () => {
  // The panel's counts on full12-live: Juegos 26 component renders, Dinero 50, Tarjeta 74, each for no change on screen.
  for (const [name, screen] of [
    ['Juegos', <GamesScreen key="g" />],
    ['Dinero', <MoneyScreen key="m" />],
    ['Tarjeta', <ScorecardScreen key="s" />],
  ] as const) {
    it(name, async () => {
      await mountLive(screen)
      renders.reset()
      await act(async () => {
        await store().reload()
      })
      expect(renders.get().total).toBeLessThanOrEqual(5)
    })
  }
})
