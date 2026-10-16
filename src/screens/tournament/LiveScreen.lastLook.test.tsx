// @vitest-environment happy-dom
/**
 * MOT-06, MOT-18 on En vivo: the board counts from what this phone last showed. The arrows used to live in the
 * screen's own memory and for 600 ms: a player back from the Tarjeta (a new mount) never saw who moved, and a
 * score that moved nobody left no trace at all.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import { forgetSeen, lastSeen } from '../../data/boardSeen'
import type { Snapshot } from '../../engine/types'
import { t } from '../../i18n/es-MX'
import s from '../../components/primitives.module.css'
import { LiveScreen } from './LiveScreen'
import { TournamentContext, type TournamentCtx } from './tournamentContext'

const NAME = 'full12-live'
const fx = getFixture(NAME)!
const TID = fx.snapshot.tournament.id

function show(snap: Snapshot, spectator?: TournamentCtx['spectator']) {
  useTournament.setState({ tournamentId: `fixture:${NAME}`, data: dataFromSnapshot(snap), loading: false, error: null, realtime: 'off' })
  return render(
    <MemoryRouter>
      <TournamentContext.Provider value={{ tournamentId: TID, slug: `_/${NAME}`, lookup: fx.lookup, me: fx.me, refresh: async () => undefined, leave: async () => undefined, spectator }}>
        <LiveScreen />
      </TournamentContext.Provider>
    </MemoryRouter>,
  )
}
const rowsNow = () => useTournament.getState().data!.state.modules.individual!.rows
const nameOf = (id: string) => fx.snapshot.players.find((p) => p.id === id)!.displayName
const rowOf = (id: string) => screen.getAllByRole('button').find((b) => b.getAttribute('aria-label')?.includes(`, ${nameOf(id)}`))!
const markOf = (id: string) => rowOf(id).querySelector(`.${s.moved}`)
const washOf = (id: string) => rowOf(id).querySelector<HTMLElement>(`.${s.figure}`)!.dataset.wash

/** The last-placed player eagles every hole he played on the live day: he climbs the board. */
function climb(snap: Snapshot): string {
  const last = dataFromSnapshot(snap).state.modules.individual!.rows.at(-1)!.playerId
  const live = snap.rounds.find((r) => r.status === 'live')!
  for (const sc of snap.scores) if (sc.roundId === live.id && sc.playerId === last && sc.strokes != null) sc.strokes = 2
  return last
}

beforeEach(() => {
  localStorage.clear()
  forgetSeen(null)
})
afterEach(() => cleanup())

describe('the board counts from the last look (MOT-06, MOT-18)', () => {
  it('back on the board after a change it did not see: who moved, by how much, and whose figure changed', () => {
    const snap = structuredClone(fx.snapshot)
    show(snap).unmount()
    const before = new Map(rowsNow().map((r) => [r.playerId, r]))
    // While the phone was on the Tarjeta, one player climbed.
    const who = climb(snap)
    show(snap)
    const after = rowsNow().find((r) => r.playerId === who)!
    const by = before.get(who)!.position - after.position
    expect(by).toBeGreaterThan(1)
    expect(markOf(who)!.textContent).toBe(String(by))
    expect(markOf(who)!.classList.contains(s.movedUp!)).toBe(true)
    expect(rowOf(who).getAttribute('aria-label')).toContain(t.live.movedSpoken(by))
    expect(washOf(who)).toBeDefined()
    // Those he passed went down one place each and say so; their figures did not change.
    const passed = rowsNow().filter((r) => r.playerId !== who && r.position > before.get(r.playerId)!.position)
    expect(passed.length).toBeGreaterThan(0)
    for (const r of passed) {
      expect(markOf(r.playerId)!.classList.contains(s.movedDown!)).toBe(true)
      expect(washOf(r.playerId)).toBeUndefined()
    }
    // Rows that held their place carry nothing.
    const held = rowsNow().filter((r) => r.position === before.get(r.playerId)!.position)
    for (const r of held) expect(markOf(r.playerId)).toBeNull()
  })

  it('what is on screen is the next look: open again with no change, and nothing is marked', () => {
    const snap = structuredClone(fx.snapshot)
    show(snap).unmount()
    climb(snap)
    show(snap).unmount()
    show(snap)
    expect(screen.getAllByRole('button').some((b) => b.querySelector(`.${s.moved}`))).toBe(false)
    expect(lastSeen(TID, true)!.rows[rowsNow()[0]!.playerId]!.place).toBe(1)
  })

  it('a change that arrives while the board is on screen marks it too, and the marks stay', async () => {
    const snap = structuredClone(fx.snapshot)
    show(snap)
    const who = climb(snap)
    await act(async () => useTournament.setState({ data: dataFromSnapshot(snap) }))
    expect(markOf(who)).not.toBeNull()
    expect(washOf(who)).toBe('a')
    await act(() => new Promise((r) => setTimeout(r, 700)))
    // The old arrow was gone after 600 ms; this one stays until the next look.
    expect(markOf(who)).not.toBeNull()
  })

  it('Gross is the same board read another way: no marks, and switching is no change', () => {
    const snap = structuredClone(fx.snapshot)
    show(snap).unmount()
    const who = climb(snap)
    show(snap)
    expect(markOf(who)).not.toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: t.live.gross }))
    expect(screen.getAllByRole('button').some((b) => b.querySelector(`.${s.moved}`))).toBe(false)
    fireEvent.click(screen.getByRole('radio', { name: t.live.points }))
    expect(markOf(who)).not.toBeNull()
  })

  it('a link to watch keeps its look for the visit, in memory: nothing goes on the phone', () => {
    const snap = structuredClone(fx.snapshot)
    const link = { money: false, url: 'https://golf.cardigan.mx/v/x' }
    show(snap, link).unmount()
    const who = climb(snap)
    show(snap, link)
    expect(markOf(who)).not.toBeNull()
    expect(Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).some((k) => k?.startsWith('cardi-golf:board-seen:'))).toBe(false)
  })
})
