// @vitest-environment happy-dom
/**
 * A11Y-14: status changes that were never said. The toasts' region and the
 * offline line were inserted together with their first message, a pattern
 * VoiceOver and NVDA often skip; a toast's «Deshacer» went after 6 s even
 * while it was being read; the Tarjeta's sync line was a plain span, so a
 * hole the server refused, or holes waiting for the PIN, were never heard.
 * Each region is now always mounted and says only what changed, once.
 */
import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../data/auth'
import { useOutbox, type RejectedItem } from '../data/outbox'
import { t } from '../i18n/es-MX'
import { SaveStatus } from '../screens/tournament/scorecard/SaveBar'
import { OfflineBanner } from './OfflineBanner'
import { Toaster } from './ui'
import { toast } from './toast'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  useOutbox.setState({ pending: 0, pendingHoles: 0, held: 0, heldHoles: 0, rejected: [], lastError: null })
})

describe('the toasts (A11Y-14)', () => {
  it('their region is there before the first toast, empty, and holds each toast once', () => {
    render(<Toaster />)
    const region = document.querySelector('[aria-live="polite"]')!
    expect(region).toBeTruthy()
    expect(region.textContent).toBe('')
    act(() => toast('Hoyo 7 guardado'))
    expect(region.textContent).toBe('Hoyo 7 guardado')
    // One region: the toast inside it is no region of its own, so it is not said twice.
    expect(region.querySelectorAll('[role="status"], [aria-live]')).toHaveLength(0)
  })

  it('a toast’s time stops while focus is on it, and runs again when focus leaves', () => {
    vi.useFakeTimers()
    render(
      <>
        <Toaster />
        <button type="button">fuera</button>
      </>,
    )
    const undo = vi.fn()
    act(() => toast('Hoyo 7 guardado', { label: t.common.undo, onClick: undo }))
    const action = screen.getByRole('button', { name: t.common.undo })
    act(() => vi.advanceTimersByTime(5000))
    fireEvent.focus(action)
    // Long past its 6 s: still there while it is being read.
    act(() => vi.advanceTimersByTime(20_000))
    expect(screen.queryByRole('button', { name: t.common.undo })).toBeTruthy()
    fireEvent.blur(action, { relatedTarget: screen.getByRole('button', { name: 'fuera' }) })
    // The second it had left.
    act(() => vi.advanceTimersByTime(900))
    expect(screen.queryByRole('button', { name: t.common.undo })).toBeTruthy()
    act(() => vi.advanceTimersByTime(200))
    expect(screen.queryByRole('button', { name: t.common.undo })).toBeNull()
  })
})

describe('the offline line (A11Y-14)', () => {
  it('its status region is mounted with signal, empty, and gets the words when the signal goes', () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    render(<OfflineBanner />)
    const region = screen.getByRole('status')
    expect(region.textContent).toBe('')
    online.mockReturnValue(false)
    act(() => void window.dispatchEvent(new Event('offline')))
    expect(screen.getByRole('status')).toBe(region)
    expect(region.textContent).toBe(t.sync.offline)
  })
})

describe('the Tarjeta’s sync line (A11Y-14)', () => {
  const region = () => document.querySelector('[role="status"]')!
  const refused = (n: number) => Array.from({ length: n }, (_, i) => ({ key: `k${i}`, tournamentId: 't', at: i }) as unknown as RejectedItem)

  it('says a write the server refused, as it happens, and not the holes on their way after every save', () => {
    render(<SaveStatus savedNote={null} onUndo={() => undefined} />)
    expect(region().textContent).toBe('')
    act(() => useOutbox.setState({ pending: 1, pendingHoles: 1 }))
    expect(screen.getByText(t.sync.pendingHoles(1))).toBeTruthy()
    expect(region().textContent).toBe('')
    act(() => useOutbox.setState({ pending: 0, pendingHoles: 0, rejected: refused(1) }))
    expect(region().textContent).toBe(t.sync.rejectedSaid(1))
  })

  it('says holes waiting for the PIN once the session is gone', () => {
    useAuth.setState({ user: null })
    render(<SaveStatus savedNote={null} onUndo={() => undefined} />)
    expect(region().textContent).toBe('')
    act(() => useOutbox.setState({ pending: 2, pendingHoles: 1, held: 2, heldHoles: 1 }))
    expect(region().textContent).toBe(t.sync.heldForPin(1))
  })

  it('keeps the same region when the saved note comes and goes, so what it says next is heard', () => {
    const { rerender } = render(<SaveStatus savedNote={null} onUndo={() => undefined} />)
    const before = region()
    expect(before).toBeTruthy()
    rerender(<SaveStatus savedNote={{ hole: 7, idx: 6, canUndo: true }} onUndo={() => undefined} />)
    expect(region()).toBe(before)
    rerender(<SaveStatus savedNote={null} onUndo={() => undefined} />)
    expect(region()).toBe(before)
  })
})
