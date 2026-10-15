// @vitest-environment happy-dom
/**
 * The Tarjeta's parts on their own (ARCH-14, QA-13): the grid, the signing panel and its question, the
 * Comité's reason sheet, the save's questions (the snake's tiebreak with «No sabemos», untouched defaults,
 * unusual values), a player's row and the save bar. The conflicts box is `HoleConflicts`, tested in
 * src/components/HoleConflicts.test.tsx. The whole card is ScorecardScreen*.test.tsx's.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../../../data/auth'
import { useOutbox } from '../../../data/outbox'
import { dataFromSnapshot } from '../../../data/tournamentStore'
import { getFixture } from '../../../dev/fixtures'
import type { HoleResult } from '../../../engine/core/types'
import { t } from '../../../i18n/es-MX'
import { CorrectionReasonSheet } from './CorrectionReasonSheet'
import { PlayerRow } from './PlayerRow'
import { SaveBar, SESSION_RECHECK_MS } from './SaveBar'
import { DefaultsSheet, TiebreakSheet, UnusualSheet } from './SaveSheets'
import { ScoreGrid } from './ScoreGrid'
import { SignSheet, SigningPanel } from './SigningPanel'

const S = t.card
afterEach(() => {
  cleanup()
  useOutbox.setState({ pending: 0, pendingHoles: 0, rejected: [], lastError: null })
})

const named = [
  { id: 'a', name: 'Ana' },
  { id: 'b', name: 'Beto' },
]
const noop = () => undefined

describe('ScoreGrid', () => {
  const fx = getFixture('minimal4-live')!
  const data = dataFromSnapshot(structuredClone(fx.snapshot))
  const round = fx.snapshot.rounds.find((r) => r.status === 'live')!
  const group = fx.snapshot.groups.find((g) => g.roundId === round.id && g.playerIds.includes(fx.me.playerId!))!
  const roundState = data.state.core.rounds[round.id]!
  const players = group.playerIds.map((id) => ({ id, name: fx.snapshot.players.find((p) => p.id === id)!.displayName }))
  const order = Array.from({ length: 18 }, (_, i) => ((group.startHole - 1 + i) % 18) + 1)
  const mount = (o: Partial<Parameters<typeof ScoreGrid>[0]> = {}) => render(<ScoreGrid named={players} roundState={roundState} order={order} hole={10} pointsCount net onOpen={noop} savedNote={null} onUndo={noop} {...o} />)

  it('a row per hole, each nine and the day summed, a column per player', () => {
    mount()
    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([t.player.hole, t.player.par, t.player.si, ...players.map((p) => p.name)])
    expect(within(table).getAllByRole('row')).toHaveLength(1 + 18 + 3)
    // Each player's day in points is the engine's.
    const total = within(table).getAllByRole('row').at(-1)!
    for (const p of players) expect(total.textContent).toContain(String(roundState[p.id]!.points))
  })

  it('the holes still missing are marked, and said under the grid', () => {
    mount()
    expect(document.querySelectorAll('[class*="missing"]').length).toBeGreaterThan(0)
    expect(screen.getByText(S.missingHoles)).toBeTruthy()
  })

  it('a hole’s number opens it', () => {
    const onOpen = vi.fn()
    mount({ onOpen })
    fireEvent.click(screen.getByRole('button', { name: `${t.player.hole} 3` }))
    expect(onOpen).toHaveBeenCalledWith(3)
  })

  it('the line under it is the save’s note with its way back, else the sync state', () => {
    const onUndo = vi.fn()
    const { unmount } = mount({ savedNote: { hole: 9, idx: 8, canUndo: true }, onUndo })
    expect(screen.getByText(S.savedHole(9))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: t.common.undo }))
    expect(onUndo).toHaveBeenCalledOnce()
    unmount()
    mount()
    expect(screen.getByText(t.sync.synced)).toBeTruthy()
  })

  it('a group with nobody left on the boards still draws (an empty group must not throw)', () => {
    mount({ named: [] })
    expect(screen.getByRole('table')).toBeTruthy()
  })
})

describe('SigningPanel and SignSheet', () => {
  const pairs = [
    { id: 'p1', name: null, player1Id: 'a', player2Id: 'b', kind: null, pickedByHonoree: false, drawnAt: null },
    { id: 'p2', name: 'Los del 10', player1Id: 'c', player2Id: 'd', kind: null, pickedByHonoree: false, drawnAt: null },
    { id: 'p3', name: 'Otro grupo', player1Id: 'e', player2Id: 'f', kind: null, pickedByHonoree: false, drawnAt: null },
  ]
  const players = ['a', 'b', 'c', 'd'].map((id) => ({ id, displayName: id.toUpperCase(), fullName: id }) as never)
  const panel = (o: { myPairId?: string | null; isAdmin?: boolean; signed?: string[]; onSign?: (id: string) => void } = {}) =>
    render(
      <SigningPanel
        roundId="r1"
        groupPlayerIds={['a', 'b', 'c', 'd']}
        pairs={pairs}
        signatures={(o.signed ?? []).map((pairId) => ({ roundId: 'r1', pairId, signedBy: 'x', signedAt: '' }))}
        players={players}
        myPairId={o.myPairId ?? 'p1'}
        isAdmin={o.isAdmin ?? false}
        onSign={o.onSign ?? noop}
      />,
    )

  it('each pair of the group, and «Firmar» only on the other pair’s card (tarjeta cruzada)', () => {
    const onSign = vi.fn()
    panel({ onSign })
    expect(screen.getByText(t.common.andList(['A', 'B']))).toBeTruthy()
    expect(screen.getByText('Los del 10')).toBeTruthy()
    expect(screen.queryByText('Otro grupo')).toBeNull()
    const buttons = screen.getAllByRole('button', { name: S.sign })
    expect(buttons).toHaveLength(1)
    fireEvent.click(buttons[0]!)
    expect(onSign).toHaveBeenCalledWith('p2')
  })

  it('the Comité may sign either; a signed card says so, with its stamp, and offers nothing', () => {
    panel({ isAdmin: true, signed: ['p2'] })
    expect(screen.getAllByRole('button', { name: S.sign })).toHaveLength(1)
    expect(screen.getByText(S.cardSigned)).toBeTruthy()
    expect(screen.getByText(S.stamp)).toBeTruthy()
  })

  it('the question names the card, and «Firmar» there signs it', () => {
    const onSign = vi.fn()
    const onClose = vi.fn()
    render(<SignSheet open title={S.signTitle('Los del 10')} onClose={onClose} onSign={onSign} />)
    const dialog = screen.getByRole('dialog', { name: S.signTitle('Los del 10') })
    fireEvent.click(within(dialog).getByRole('button', { name: S.sign }))
    expect(onSign).toHaveBeenCalledOnce()
    fireEvent.click(within(dialog).getByRole('button', { name: t.common.cancel }))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('CorrectionReasonSheet', () => {
  it('«Guardar» waits for a reason of three characters, trimmed', () => {
    const onSave = vi.fn()
    const onReason = vi.fn()
    const { rerender } = render(<CorrectionReasonSheet open reason="  ab " onReason={onReason} busy={false} onClose={noop} onSave={onSave} />)
    const save = () => screen.getByRole('button', { name: S.save })
    expect(save()).toHaveProperty('disabled', true)
    fireEvent.change(screen.getByRole('textbox', { name: t.admin.scores.reason }), { target: { value: 'tarjeta mal' } })
    expect(onReason).toHaveBeenCalledWith('tarjeta mal')
    rerender(<CorrectionReasonSheet open reason="abc" onReason={onReason} busy={false} onClose={noop} onSave={onSave} />)
    fireEvent.click(save())
    expect(onSave).toHaveBeenCalledOnce()
  })

  it('while the correction is on its way it says «Guardando…» and takes no second tap', () => {
    render(<CorrectionReasonSheet open reason="abc" onReason={noop} busy onClose={noop} onSave={noop} />)
    expect(screen.getByRole('button', { name: t.common.saving })).toHaveProperty('disabled', true)
  })

  it('closed, it shows nothing', () => {
    render(<CorrectionReasonSheet open={false} reason="" onReason={noop} busy={false} onClose={noop} onSave={noop} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('the save’s questions', () => {
  it('«¿Quién embocó al último?» offers each candidate and «No sabemos», which answers nobody (UX-08)', () => {
    const onAnswer = vi.fn()
    render(<TiebreakSheet candidates={['b', 'a', 'gone']} named={named} threshold={3} busy={false} onAnswer={onAnswer} onClose={noop} />)
    const dialog = screen.getByRole('dialog', { name: S.whoHoledLast })
    expect(within(dialog).getByText(S.whoHoledLastHint(3))).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Beto' }))
    expect(onAnswer).toHaveBeenLastCalledWith('b')
    fireEvent.click(within(dialog).getByRole('button', { name: S.whoHoledLastUnknown }))
    expect(onAnswer).toHaveBeenLastCalledWith(undefined)
    // A candidate no longer in the group is no button.
    expect(within(dialog).getAllByRole('button').map((b) => b.textContent)).toEqual([t.common.close, 'Beto', 'Ana', S.whoHoledLastUnknown])
  })

  it('while a save is on its way the answers wait', () => {
    render(<TiebreakSheet candidates={['a', 'b']} named={named} threshold={3} busy onAnswer={noop} onClose={noop} />)
    expect(screen.getByRole('button', { name: 'Ana' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: S.whoHoledLastUnknown })).toHaveProperty('disabled', true)
  })

  it('untouched defaults: back, or «Sí, todos par»', () => {
    const onBack = vi.fn()
    const onConfirm = vi.fn()
    render(<DefaultsSheet open hole={7} onBack={onBack} onConfirm={onConfirm} />)
    expect(screen.getByRole('dialog', { name: S.allDefaultsTitle(7) })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: S.allDefaultsConfirm }))
    fireEvent.click(screen.getByRole('button', { name: S.allDefaultsBack }))
    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('unusual values: each line, then fix or save anyway', () => {
    const onFix = vi.fn()
    const onConfirm = vi.fn()
    render(<UnusualSheet lines={['Ana: 11 golpes', 'Beto: 6 putts']} onFix={onFix} onConfirm={onConfirm} />)
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Ana: 11 golpes', 'Beto: 6 putts'])
    fireEvent.click(screen.getByRole('button', { name: S.weirdConfirm }))
    fireEvent.click(screen.getByRole('button', { name: S.weirdFix }))
    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onFix).toHaveBeenCalledOnce()
  })

  it('none of them shows while closed', () => {
    render(
      <>
        <TiebreakSheet candidates={null} named={named} threshold={3} busy={false} onAnswer={noop} onClose={noop} />
        <DefaultsSheet open={false} hole={7} onBack={noop} onConfirm={noop} />
        <UnusualSheet lines={null} onFix={noop} onConfirm={noop} />
      </>,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('PlayerRow', () => {
  const h = (o: Partial<HoleResult> = {}): HoleResult => ({ hole: 7, par: 4, strokeIndex: 3, yards: null, strokesReceived: 2, gross: null, net: null, points: 0, putts: null, pickedUp: false, played: false, disputed: false, why: { title: '', steps: [] }, ...o })
  const row = (o: Partial<Parameters<typeof PlayerRow>[0]> = {}) =>
    render(<PlayerRow id="a" name="Ana" labelId="l-a" draft={{ strokes: 4, putts: 2, pickedUp: false }} hole={h()} parOnScreen={4} locked={false} untouched={false} ptsLine="4 pts" good holdsSnake={false} snakeLayoutId="s" onDraft={noop} {...o} />)

  it('his controls carry his name; a tap changes his draft only, putts never over the strokes', () => {
    const onDraft = vi.fn()
    row({ onDraft, draft: { strokes: 2, putts: 2, pickedUp: false } })
    expect(screen.getByRole('group', { name: 'Ana' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: `${S.strokesOf('Ana')}: ${t.common.stepDown}` }))
    expect(onDraft).toHaveBeenLastCalledWith('a', { strokes: 1, putts: 1 })
    fireEvent.click(screen.getByRole('button', { name: S.pickedUpOf('Ana') }))
    expect(onDraft).toHaveBeenLastCalledWith('a', { pickedUp: true })
  })

  it('the strokes he receives as dots, and a par his tee plays otherwise', () => {
    row({ hole: h({ par: 5 }) })
    expect(screen.getByLabelText(t.admin.players.strokesOn(2)).textContent).toBe('••')
    expect(screen.getByText(`4 pts, ${S.parHere(5)}`)).toBeTruthy()
  })

  it('a signed card locks his row and says so', () => {
    row({ locked: true })
    expect(screen.getByLabelText(S.cardSigned)).toBeTruthy()
    expect(screen.getByRole('button', { name: S.pickedUpOf('Ana') })).toHaveProperty('disabled', true)
  })

  it('the snake’s holder carries its mark', () => {
    row({ holdsSnake: true })
    expect(screen.getByRole('img', { name: S.snakeHolder })).toBeTruthy()
  })
})

describe('SaveBar', () => {
  const bar = (o: Partial<Parameters<typeof SaveBar>[0]> = {}) => render(<SaveBar label={S.save} busy={false} disabled={false} justSaved={false} onSave={noop} locked={null} savedNote={null} onUndo={noop} {...o} />)

  it('«Guardar hoyo» saves, with nothing passed: a tap is never an answer to a question', () => {
    const onSave = vi.fn()
    bar({ onSave })
    fireEvent.click(screen.getByRole('button', { name: S.save }))
    expect(onSave).toHaveBeenCalledWith()
  })

  it('«Guardado» rests on it a moment after a save, its name staying the button’s (MOT-02)', () => {
    bar({ justSaved: true })
    expect(screen.getByRole('button', { name: new RegExp(`^${S.save}`) }).textContent).toContain(S.savedCheck)
  })

  it('the sync line counts holes (REL-17), and a card that can’t be edited says why instead', () => {
    useOutbox.setState({ pending: 3, pendingHoles: 2 })
    const { unmount } = bar()
    expect(screen.getByText(t.sync.pendingHoles(2))).toBeTruthy()
    unmount()
    bar({ locked: S.lockedSigned })
    expect(screen.getByText(S.lockedSigned)).toBeTruthy()
    expect(screen.queryByText(t.sync.pendingHoles(2))).toBeNull()
  })

  it('a session that auth-js gives up on while the card is open turns the line into «espera tu PIN» (the split verifier’s V7)', () => {
    vi.useFakeTimers()
    try {
      localStorage.setItem('cardi-golf-auth', '{}')
      useAuth.setState({ user: null })
      useOutbox.setState({ pending: 4, pendingHoles: 1, held: 4, heldHoles: 1 })
      bar()
      expect(screen.getByText(t.sync.pendingHoles(1))).toBeTruthy()
      localStorage.removeItem('cardi-golf-auth')
      act(() => void vi.advanceTimersByTime(SESSION_RECHECK_MS))
      expect(screen.getByText(t.sync.heldForPinShort(1))).toBeTruthy()
    } finally {
      vi.useRealTimers()
      localStorage.removeItem('cardi-golf-auth')
    }
  })

  it('after a correction the note says where the card went back to, with «Corregir» on a new hole (UX-19)', () => {
    bar({ savedNote: { hole: 7, idx: 6, canUndo: false, corrected: 10 } })
    expect(screen.getByText(S.correctedHole(7, 10))).toBeTruthy()
    expect(screen.getByRole('button', { name: S.correct })).toBeTruthy()
  })
})
