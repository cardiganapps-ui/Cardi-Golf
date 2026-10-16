// @vitest-environment happy-dom
/**
 * MOT-09: a sheet left the screen in zero frames, and its grabber could not
 * be dragged. Closing now plays the entry backwards while everything else
 * about closing (the page back from inert, the system back's entry, focus to
 * the opener) happens at once, as before; the grabber and the header drag it.
 *
 * happy-dom applies no stylesheet, so an element here has no animation and a
 * sheet goes at once (as under reduced motion). The tests that watch the exit
 * give the dialog the exit's computed animation, as a browser would.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '../i18n/es-MX'
import { anySheetOpen } from './sheetHistory'
import { _modalFocusTest } from './modalFocus'
import { Sheet, Toaster, toast } from './ui'

function Page({ onExited, dirty = false }: { onExited?: () => void; dirty?: boolean }) {
  // The content goes with the open state, as `open={!!edit}` does on the Comité's screens.
  const [edit, setEdit] = useState<string | null>(null)
  const [closes, setCloses] = useState(0)
  return (
    <>
      <nav aria-label="Secciones">
        <a href="/t/x">En vivo</a>
      </nav>
      <main>
        <button type="button" onClick={() => setEdit('Ana')}>
          Abrir jugador
        </button>
        <output data-testid="closes">{closes}</output>
        <Sheet
          open={edit !== null}
          onClose={() => {
            setCloses((n) => n + 1)
            setEdit(null)
          }}
          onExited={onExited}
          title={edit ? `Jugador ${edit}` : ''}
          dirty={dirty}
        >
          {edit && <p>Tarjeta de {edit}</p>}
          <div data-testid="body" style={{ overflowY: 'auto' }}>
            <p>Hoyo 1</p>
          </div>
        </Sheet>
      </main>
    </>
  )
}

const settle = () => act(() => new Promise((r) => setTimeout(r, 50)))
/** The dialog in the DOM, accessible or not. */
const frame = () => document.querySelector<HTMLElement>('[role="dialog"]')
const backdrop = () => frame()?.parentElement ?? null

/** A browser's computed style for a sheet that has its exit (or its entry) to play: 150 ms. */
function sheetsAnimate() {
  const real = window.getComputedStyle.bind(window)
  return vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element, pseudo?: string | null) => {
    const s = real(el, pseudo)
    if (!(el as HTMLElement).matches?.('[role="dialog"]')) return s
    return new Proxy(s, {
      get(target, key) {
        if (key === 'animationName') return 'sheetOut'
        if (key === 'animationDuration') return '0.15s'
        if (key === 'animationDelay') return '0s'
        const v = Reflect.get(target, key)
        return typeof v === 'function' ? v.bind(target) : v
      },
    })
  })
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
  _modalFocusTest.reset()
})

describe('closing plays out (MOT-09)', () => {
  it('stays on screen while its exit plays, with its last content, a picture only; everything else closes at once', async () => {
    sheetsAnimate()
    const onExited = vi.fn()
    const user = userEvent.setup()
    render(<Page onExited={onExited} />)
    const opener = screen.getByRole('button', { name: 'Abrir jugador' })
    await user.click(opener)
    await settle()
    expect(screen.getByRole('dialog', { name: 'Jugador Ana' })).toBeTruthy()

    await user.keyboard('{Escape}')
    // Still drawn, with what it showed (its title and content went with the open state)…
    expect(frame()).toBeTruthy()
    expect(within(frame()!).getByText('Tarjeta de Ana')).toBeTruthy()
    expect(within(frame()!).getByRole('heading', { hidden: true }).textContent).toBe('Jugador Ana')
    // …but no longer a dialog to anyone: hidden, inert, no target.
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(backdrop()!.getAttribute('aria-hidden')).toBe('true')
    expect(backdrop()!.hasAttribute('inert')).toBe(true)
    // The rest of closing did not wait for it.
    expect(document.querySelector('nav')!.hasAttribute('inert')).toBe(false)
    expect(opener.hasAttribute('inert')).toBe(false)
    expect(document.activeElement).toBe(opener)
    expect(anySheetOpen()).toBe(false)
    expect(document.body.style.overflow).toBe('')
    expect(onExited).not.toHaveBeenCalled()

    // Another element's animation ending inside it is not its own.
    act(() => void within(frame()!).getByText('Hoyo 1').dispatchEvent(new Event('animationend', { bubbles: true })))
    expect(frame()).toBeTruthy()
    act(() => void frame()!.dispatchEvent(new Event('animationend', { bubbles: true })))
    expect(frame()).toBeNull()
    expect(onExited).toHaveBeenCalledTimes(1)
  })

  it('goes once its time is up even if the animation never reports its end (a page in the background)', async () => {
    sheetsAnimate()
    const onExited = vi.fn()
    render(<Page onExited={onExited} />)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir jugador' }))
    vi.useFakeTimers()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: t.common.close }))
    expect(frame()).toBeTruthy()
    act(() => vi.advanceTimersByTime(100))
    expect(frame()).toBeTruthy()
    act(() => vi.advanceTimersByTime(200))
    expect(frame()).toBeNull()
    expect(onExited).toHaveBeenCalledTimes(1)
  })

  it('reopened while it leaves, it is a sheet again: modal, in the history, and it closes again', async () => {
    sheetsAnimate()
    const user = userEvent.setup()
    render(<Page />)
    const opener = screen.getByRole('button', { name: 'Abrir jugador' })
    await user.click(opener)
    await settle()
    await user.keyboard('{Escape}')
    const leaving = frame()
    expect(screen.queryByRole('dialog')).toBeNull()
    await user.click(opener)
    await settle()
    // The same sheet, taken back from its exit.
    expect(screen.getByRole('dialog', { name: 'Jugador Ana' })).toBe(leaving)
    expect(backdrop()!.hasAttribute('inert')).toBe(false)
    expect(document.querySelector('nav')!.hasAttribute('inert')).toBe(true)
    expect(anySheetOpen()).toBe(true)
    // Its exit's end, arriving late, does not take it away.
    act(() => void frame()!.dispatchEvent(new Event('animationend', { bubbles: true })))
    expect(screen.getByRole('dialog', { name: 'Jugador Ana' })).toBeTruthy()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByTestId('closes').textContent).toBe('2')
  })

  it('with nothing to play (reduced motion, no styles) it goes at once', async () => {
    const onExited = vi.fn()
    const user = userEvent.setup()
    render(<Page onExited={onExited} />)
    await user.click(screen.getByRole('button', { name: 'Abrir jugador' }))
    await user.keyboard('{Escape}')
    expect(frame()).toBeNull()
    expect(onExited).toHaveBeenCalledTimes(1)
  })
})

/** A pointer at `y` on `el` (or the window) at time `at`, as a finger sends it. */
function pointer(type: string, target: EventTarget, y: number, at: number) {
  const e = new PointerEvent(type, { bubbles: true, cancelable: true, clientY: y, pointerId: 7, isPrimary: true, button: 0, pointerType: 'touch' })
  Object.defineProperty(e, 'timeStamp', { value: at })
  act(() => void target.dispatchEvent(e))
}
/** A drag from `y0` down by `dy` over `ms`, in steps, released at the end. */
function drag(target: Element, dy: number, ms: number, y0 = 100) {
  pointer('pointerdown', target, y0, 1000)
  const steps = 10
  for (let i = 1; i <= steps; i++) pointer('pointermove', window, y0 + (dy * i) / steps, 1000 + (ms * i) / steps)
  pointer('pointerup', window, y0 + dy, 1000 + ms)
}

async function openTall(props: { dirty?: boolean } = {}) {
  const user = userEvent.setup()
  render(<Page {...props} />)
  await user.click(screen.getByRole('button', { name: 'Abrir jugador' }))
  await settle()
  const dialog = screen.getByRole('dialog')
  vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue({ height: 400, width: 393, top: 400, bottom: 800, left: 0, right: 393, x: 0, y: 400, toJSON: () => ({}) } as DOMRect)
  return dialog
}
const grabber = (dialog: HTMLElement) => dialog.querySelector('[data-sheet-grab]')!
const closes = () => Number(screen.getByTestId('closes').textContent)

describe('the grabber drags the sheet (MOT-09)', () => {
  it('follows the finger down, and lightens the backdrop as it goes', async () => {
    const dialog = await openTall()
    pointer('pointerdown', grabber(dialog), 100, 1000)
    pointer('pointermove', window, 200, 1300)
    expect(dialog.style.transform).toBe('translateY(100px)')
    // Up from where it started, it stays down: a sheet on the bottom edge never lifts off it.
    pointer('pointermove', window, 40, 1600)
    expect(dialog.style.transform).toBe('')
    pointer('pointerup', window, 40, 1700)
    expect(closes()).toBe(0)
  })

  it('a slow drag past a quarter of its height closes it, as the backdrop would', async () => {
    const dialog = await openTall()
    drag(grabber(dialog), 200, 2000)
    expect(closes()).toBe(1)
    // It leaves from where the finger let go, down the rest of the way.
    expect(dialog.style.getPropertyValue('--sheet-y')).toBe('200px')
    expect(dialog.style.getPropertyValue('--sheet-travel')).toBe('200px')
  })

  it('a short drag springs back and keeps it open', async () => {
    const dialog = await openTall()
    drag(grabber(dialog), 40, 800)
    await settle()
    expect(closes()).toBe(0)
    expect(screen.getByRole('dialog')).toBe(dialog)
    expect(dialog.style.transform).toBe('')
    expect(dialog.style.transition).toContain('transform')
  })

  it('a short flick down faster than 0.5 px/ms closes it', async () => {
    const dialog = await openTall()
    drag(grabber(dialog), 60, 80)
    expect(closes()).toBe(1)
  })

  it('the header drags it too, but its «Cerrar» keeps its tap', async () => {
    const dialog = await openTall()
    const head = dialog.querySelectorAll('[data-sheet-grab]')[1]!
    drag(within(head as HTMLElement).getByRole('heading'), 200, 2000)
    expect(closes()).toBe(1)
  })

  it('a press on «Cerrar» is no drag', async () => {
    const dialog = await openTall()
    const close = within(dialog).getByRole('button', { name: t.common.close })
    pointer('pointerdown', close, 100, 1000)
    pointer('pointermove', window, 300, 2000)
    expect(dialog.style.transform).toBe('')
    pointer('pointerup', window, 300, 2100)
    expect(closes()).toBe(0)
  })

  it('a drag in the body never moves the sheet: the body scrolls', async () => {
    const dialog = await openTall()
    drag(within(dialog).getByTestId('body'), 200, 400)
    expect(dialog.style.transform).toBe('')
    expect(closes()).toBe(0)
  })

  it('a cancelled drag (the system took the touch) springs back', async () => {
    const dialog = await openTall()
    pointer('pointerdown', grabber(dialog), 100, 1000)
    pointer('pointermove', window, 350, 2000)
    pointer('pointercancel', window, 350, 2100)
    expect(closes()).toBe(0)
    expect(dialog.style.transform).toBe('')
  })

  it('with work in it, a drag that would close it asks first and the sheet settles back', async () => {
    const dialog = await openTall({ dirty: true })
    drag(grabber(dialog), 300, 2000)
    await settle()
    expect(closes()).toBe(0)
    expect(screen.getByRole('dialog', { name: t.common.discardTitle })).toBeTruthy()
    expect(dialog.style.transform).toBe('')
    expect(dialog.style.getPropertyValue('--sheet-y')).toBe('')
  })
})

describe('the toasts go the way they came (MOT-09)', () => {
  /** A browser's computed style for a toast's place while it goes: 150 ms. */
  function toastsAnimate() {
    const real = window.getComputedStyle.bind(window)
    return vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element, pseudo?: string | null) => {
      const s = real(el, pseudo)
      if (!(el.parentElement?.matches('[aria-live]') && el.getAttribute('aria-hidden') === 'true')) return s
      return new Proxy(s, {
        get(target, key) {
          if (key === 'animationName') return 'toastOut'
          if (key === 'animationDuration') return '150ms'
          if (key === 'animationDelay') return '0s'
          const v = Reflect.get(target, key)
          return typeof v === 'function' ? v.bind(target) : v
        },
      })
    })
  }

  it('a toast whose time is up stays while it fades, out of the region’s words and with no second «Deshacer», then goes', async () => {
    toastsAnimate()
    vi.useFakeTimers()
    const undo = vi.fn()
    render(<Toaster />)
    act(() => toast('Hoyo 7 guardado', { label: t.common.undo, onClick: undo }))
    act(() => vi.advanceTimersByTime(6000))
    const region = document.querySelector('[aria-live="polite"]')!
    const going = region.firstElementChild as HTMLElement
    expect(going).toBeTruthy()
    expect(going.textContent).toContain('Hoyo 7 guardado')
    expect(going.getAttribute('aria-hidden')).toBe('true')
    expect(going.hasAttribute('inert')).toBe(true)
    expect(screen.queryByRole('button', { name: t.common.undo })).toBeNull()
    act(() => void going.dispatchEvent(new Event('animationend', { bubbles: true })))
    // Motion takes it out on its next frame.
    vi.useRealTimers()
    await waitFor(() => expect(region.textContent).toBe(''))
  })

  it('with nothing to play, it goes on the next frame', async () => {
    vi.useFakeTimers()
    render(<Toaster />)
    act(() => toast('Hoyo 7 guardado'))
    act(() => vi.advanceTimersByTime(2800))
    expect(document.querySelector('[aria-live="polite"] [aria-hidden="true"]')).toBeTruthy()
    vi.useRealTimers()
    await waitFor(() => expect(document.querySelector('[aria-live="polite"]')!.textContent).toBe(''))
  })
})
