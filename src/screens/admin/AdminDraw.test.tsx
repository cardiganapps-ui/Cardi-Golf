// @vitest-environment happy-dom
/**
 * UX-17: the Matrimonios draw ran in local state on the Comité's phone and was
 * saved only at the end, which also moved the tournament live, so the TV never
 * showed it and the pairs learned it from a toast. Now «Sortear el resto»
 * saves the draw at once, nameless and still on Calcutta night, and this phone
 * reveals it a pair at a time as the TV does; the pairs name themselves after,
 * a redraw asks first, and «Empezar el torneo» closes the night.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot, useTournament } from '../../data/tournamentStore'
import { DRAW_STEP } from '../../design/motion'
import type { Snapshot } from '../../engine/types'
import { t } from '../../i18n/es-MX'

type DrawInput = { name: string | null; player1_id: string; player2_id: string; kind: string; picked_by_honoree: boolean }
const api = vi.hoisted(() => ({
  saveDraw: vi.fn(async (_tid: string, _pairs: DrawInput[], _groups: unknown, _goLive: boolean) => ({ pairs: 0, groups: [] as Array<{ number: number; id: string }> })),
  renamePair: vi.fn(async (_id: string, _name: string) => undefined),
  updateTournament: vi.fn(async (_tid: string, _patch: Record<string, unknown>) => undefined),
}))
vi.mock('../../data/api', () => api)
vi.mock('../tournament/tournamentContext', () => ({ useTournamentCtx: () => ({ tournamentId: 'fx-auction', slug: 'fixture-auction12' }) }))
vi.mock('../../components/toast', async (orig) => ({ ...(await orig<typeof import('../../components/toast')>()), toast: vi.fn() }))

// happy-dom rejects a running animation's `finished` when the test unmounts it; nothing here waits on it.
const cancelAnimation = Animation.prototype.cancel
Animation.prototype.cancel = function (this: Animation) {
  this.finished.catch(() => undefined)
  return cancelAnimation.call(this)
}

const { AdminDraw } = await import('./AdminDraw')
const D = t.draw
let snap: Snapshot
const calls: string[] = []

/** The store as the server leaves it: a saved draw comes back as rows with ids when the screen reloads. */
function mount(fixture: string) {
  snap = structuredClone(getFixture(fixture)!.snapshot)
  const load = () => useTournament.setState({ tournamentId: 'fx-auction', data: dataFromSnapshot(structuredClone(snap)), reload } as never)
  const reload = async () => load()
  api.saveDraw.mockImplementation(async (_tid, pairs) => {
    calls.push('saveDraw')
    snap.pairs = pairs.map((p, i) => ({ id: `new${i}`, name: p.name, player1Id: p.player1_id, player2Id: p.player2_id, kind: p.kind, pickedByHonoree: p.picked_by_honoree, drawnAt: '2027-04-08T22:00:00.000Z' }))
    return { pairs: pairs.length, groups: [] }
  })
  api.renamePair.mockImplementation(async (id, name) => {
    calls.push(`rename ${id}`)
    snap.pairs = snap.pairs.map((p) => (p.id === id ? { ...p, name } : p))
  })
  api.updateTournament.mockImplementation(async (_tid, patch) => {
    calls.push(`status ${String(patch.status)}`)
  })
  load()
  render(
    <MemoryRouter>
      <AdminDraw />
    </MemoryRouter>,
  )
}
const nameFields = () => screen.queryAllByRole('textbox')
const button = (name: string) => screen.getByRole('button', { name })

beforeEach(() => {
  calls.length = 0
  Object.values(api).forEach((f) => f.mockClear())
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('the Matrimonios draw is saved as it is drawn (UX-17)', () => {
  it('«Sortear el resto» saves it at once: nameless, the honoree\'s pick kept, the Day 1 groups with it, and the night not closed', async () => {
    mount('auction12')
    // The groom (p4, tier B) picks from tier C.
    fireEvent.click(screen.getByRole('radio', { name: snap.players.find((p) => p.id === 'p7')!.displayName }))
    await act(async () => fireEvent.click(button(D.draw)))
    expect(api.saveDraw).toHaveBeenCalledTimes(1)
    const [tid, pairs, groups, goLive] = api.saveDraw.mock.calls[0]!
    expect(tid).toBe('fx-auction')
    expect(pairs).toHaveLength(6)
    expect(pairs.every((p) => p.name === null)).toBe(true)
    expect(pairs.filter((p) => p.picked_by_honoree)).toEqual([expect.objectContaining({ player1_id: 'p4', player2_id: 'p7' })])
    // Every player once, A with D and B with C.
    expect(new Set(pairs.flatMap((p) => [p.player1_id, p.player2_id])).size).toBe(12)
    expect(new Set(pairs.map((p) => p.kind))).toEqual(new Set(['AD', 'BC']))
    expect(groups).toHaveLength(3)
    expect(goLive).toBe(false)
  })

  it('this phone reveals the saved draw a pair at a time, as the TV does; «Mostrar todas» shows the rest', async () => {
    mount('auction12')
    fireEvent.click(screen.getByRole('radio', { name: snap.players.find((p) => p.id === 'p8')!.displayName }))
    await act(async () => fireEvent.click(button(D.draw)))
    expect(nameFields()).toHaveLength(1)
    act(() => void vi.advanceTimersByTime(DRAW_STEP * 1000))
    expect(nameFields()).toHaveLength(2)
    act(() => void vi.advanceTimersByTime(DRAW_STEP * 1000))
    expect(nameFields()).toHaveLength(3)
    fireEvent.click(button(D.showAll))
    expect(nameFields()).toHaveLength(6)
    // The first out is the groom's pick, as on the TV.
    expect(nameFields()[0]!.getAttribute('aria-label')).toBe(D.nameOf(t.common.andList([snap.players[3]!.displayName, snap.players[7]!.displayName])))
  })

  it('the pairs name themselves after: «Guardar nombres» saves only the names typed', async () => {
    mount('draw12')
    expect(button(D.saveNames)).toHaveProperty('disabled', true)
    const field = screen.getByRole('textbox', { name: D.nameOf(t.common.andList([snap.players[1]!.displayName, snap.players[10]!.displayName])) })
    fireEvent.change(field, { target: { value: 'Los Bogey' } })
    await act(async () => fireEvent.click(button(D.saveNames)))
    expect(api.renamePair.mock.calls).toEqual([['dp2', 'Los Bogey']])
    expect(api.saveDraw).not.toHaveBeenCalled()
  })

  it('a redraw asks first, since the room has seen the draw; «Cancelar» keeps it', async () => {
    mount('draw12')
    fireEvent.click(button(D.redraw))
    const ask = screen.getByRole('dialog', { name: D.redraw })
    expect(within(ask).getByText(D.redrawConfirm)).toBeTruthy()
    expect(api.saveDraw).not.toHaveBeenCalled()
    fireEvent.click(within(ask).getByRole('button', { name: t.common.cancel }))
    expect(api.saveDraw).not.toHaveBeenCalled()
    fireEvent.click(button(D.redraw))
    await act(async () => fireEvent.click(within(screen.getByRole('dialog', { name: D.redraw })).getByRole('button', { name: D.redraw })))
    expect(api.saveDraw).toHaveBeenCalledTimes(1)
    // The groom's pick stays his: Mateo (p7) again.
    expect(api.saveDraw.mock.calls[0]![1].filter((p) => p.picked_by_honoree)).toEqual([expect.objectContaining({ player1_id: 'p4', player2_id: 'p7' })])
  })

  it('«Empezar el torneo» closes Calcutta night, saving the names typed first', async () => {
    mount('draw12')
    fireEvent.change(screen.getAllByRole('textbox')[1]!, { target: { value: 'Los de Atrás' } })
    await act(async () => fireEvent.click(button(D.start)))
    // The second out is dp1 (the groom's pair comes first).
    expect(calls).toEqual(['rename dp1', 'status live'])
    expect(api.updateTournament).toHaveBeenCalledWith('fx-auction', { status: 'live' })
  })

  it('a draw the server refuses leaves the saved one on screen, whole', async () => {
    mount('draw12')
    api.saveDraw.mockImplementationOnce(async () => {
      throw Object.assign(new Error('Ya hay tarjetas firmadas; el sorteo no se puede rehacer'), { code: '22023' })
    })
    fireEvent.click(button(D.redraw))
    await act(async () => fireEvent.click(within(screen.getByRole('dialog', { name: D.redraw })).getByRole('button', { name: D.redraw })))
    expect(nameFields()).toHaveLength(6)
  })

  it('away from Calcutta night there is nothing to close', () => {
    mount('full12-live')
    expect(screen.queryByRole('button', { name: D.start })).toBeNull()
  })
})
