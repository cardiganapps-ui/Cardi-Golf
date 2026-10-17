// @vitest-environment happy-dom
/**
 * The race chart (PERF-04, VIS-21, A11Y-20, MOT-21, MOT-15): a named image a
 * keyboard never stops on, a few lines in colour and the rest grey, a pick
 * kept per race, a bar to read any hole, the whole race as a table, and a
 * replay that slides one cover without rendering the chart again per frame,
 * none under reduced motion.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MotionConfig } from 'motion/react'
import { Profiler } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RaceChart, type RaceChartProps } from './RaceChart'
import type { RaceEntrant } from './raceModel'

const days = [
  { number: 1, holes: 18 },
  { number: 2, holes: 18 },
]
/** `n` players over 36 holes, two points a hole, each a point behind the one before him. */
function field(n: number, holes = 36): RaceEntrant[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    label: `Jugador ${i + 1}`,
    values: Array.from({ length: holes }, (_, h) => (h + 1) * 2 - i),
  }))
}
function chart(props: Partial<RaceChartProps> = {}, reduce = false) {
  const entrants = props.entrants ?? field(4)
  const all: RaceChartProps = {
    title: 'Carrera de puntos',
    entrants,
    stable: entrants.map((e) => e.id),
    days,
    strokes: false,
    format: String,
    pairs: false,
    me: null,
    honoree: null,
    honoreeLabel: 'El novio',
    pickKey: 'cardi-golf:race-pick:t1:players',
    hint: 'Puntos acumulados hoyo por hoyo.',
    ...props,
  }
  return render(
    <MotionConfig reducedMotion={reduce ? 'always' : 'never'}>
      <RaceChart {...all} />
    </MotionConfig>,
  )
}
const svg = () => screen.getByRole('img')
/** Where the cover over the race not reached yet stands, in px from its window's left edge. */
const revealAt = () =>
  Number(/translateX\(([-\d.]+)px\)/.exec((document.querySelector('[data-reveal]') as HTMLElement).style.transform)![1])
const labels = () =>
  Array.from(svg().querySelectorAll('text'))
    .map((x) => x.textContent)
    .filter((x) => /Jugador/.test(x ?? ''))

beforeEach(() => sessionStorage.clear())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('what a screen reader and a keyboard meet (A11Y-20)', () => {
  it('one image, named by what the race says, never a tab stop or an application', () => {
    chart({ me: 'p2' })
    const img = svg()
    expect(img.getAttribute('aria-label')).toBe(
      'Carrera de puntos: 4 jugadores, 36 hoyos. Va al frente Jugador 1 con 72 puntos; va al frente desde el primer hoyo.',
    )
    expect(img.hasAttribute('tabindex')).toBe(false)
    expect(document.querySelector('[role="application"]')).toBeNull()
  })

  it('«Ver como tabla» is the whole race: a row per entrant, a column per hole played, the engine’s figures', () => {
    chart({ entrants: field(3, 20) })
    const toggle = screen.getByRole('button', { name: 'Ver como tabla' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(toggle)
    expect(screen.getByRole('button', { name: 'Ocultar la tabla' }).getAttribute('aria-expanded')).toBe('true')
    const table = screen.getByRole('table', { name: 'Carrera de puntos, hoyo por hoyo' })
    const rows = within(table).getAllByRole('row')
    // Two header rows (the days, then the holes), then one per player.
    expect(rows).toHaveLength(5)
    const first = within(rows[2]!)
      .getAllByRole('cell')
      .map((c) => c.textContent)
    expect(first).toHaveLength(20)
    expect(first.slice(0, 3)).toEqual(['2', '4', '6'])
    // The 19th column is the first hole of day 2, said as such.
    expect(within(rows[1]!).getAllByRole('columnheader')[19]!.textContent).toContain('Hoyo 1 del día 2')
    // A scrolling box a keyboard can reach (axe: scrollable-region-focusable).
    expect(table.parentElement!.getAttribute('tabindex')).toBe('0')
  })

  it('the bar says its hole, and the readout lists the coloured lines there', () => {
    chart()
    const bar = screen.getByRole('slider', { name: 'Hoyo de la carrera' })
    expect(bar.getAttribute('aria-valuetext')).toBe('Hoyo 18 del día 2')
    fireEvent.change(bar, { target: { value: '5' } })
    expect(bar.getAttribute('aria-valuetext')).toBe('Hoyo 5 del día 1')
    const rows = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(rows[0]).toBe('1.ºJugador 110')
    // The cover hides the race past there.
    expect(revealAt()).toBeLessThan(200)
  })
})

describe('reading it with a finger', () => {
  it('a tap reads the hole under it; a touch that moves down (a scroll) reads nothing', () => {
    chart()
    const img = svg()
    img.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 343,
      height: 280,
      right: 343,
      bottom: 280,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
    const bar = screen.getByRole('slider')
    // A scroll: down the page, the bar stays at the end.
    fireEvent.pointerDown(img, { clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(img, { clientX: 102, clientY: 160, pointerId: 1 })
    fireEvent.pointerCancel(img, { pointerId: 1 })
    expect(bar.getAttribute('aria-valuetext')).toBe('Hoyo 18 del día 2')
    // A tap at the plot's left edge is the first tee.
    fireEvent.pointerDown(img, { clientX: 30, clientY: 100, pointerId: 2 })
    fireEvent.pointerUp(img, { clientX: 30, clientY: 100, pointerId: 2 })
    expect(bar.getAttribute('aria-valuetext')).toBe('En la salida')
    // A sideways drag follows the finger.
    fireEvent.pointerDown(img, { clientX: 30, clientY: 100, pointerId: 3 })
    fireEvent.pointerMove(img, { clientX: 60, clientY: 102, pointerId: 3 })
    expect(Number((bar as HTMLInputElement).value)).toBeGreaterThan(0)
    fireEvent.pointerUp(img, { clientX: 60, clientY: 102, pointerId: 3 })
  })
})

describe('legible from 4 to 60 (VIS-21)', () => {
  it('a small field: every line in colour and named beside it, no grey, no pick', () => {
    chart()
    expect(labels()).toEqual(['Jugador 1', 'Jugador 2', 'Jugador 3', 'Jugador 4'])
    expect(svg().querySelectorAll('path[class*="context"]')).toHaveLength(0)
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('60 players: six lines in colour (the first three, this phone, the honoree, the one picked), 54 grey', () => {
    chart({ entrants: field(60), me: 'p30', honoree: 'p45' })
    expect(svg().querySelectorAll('path[class*="context"]')).toHaveLength(55)
    expect(labels().sort()).toEqual(['Jugador 1', 'Jugador 2', 'Jugador 3', 'Jugador 30', 'Jugador 45'].sort())
    expect(screen.getByText('Los demás (55)')).toBeTruthy()
    fireEvent.change(screen.getByRole('combobox', { name: 'Comparar con' }), { target: { value: 'p50' } })
    expect(labels()).toContain('Jugador 50')
    expect(svg().querySelectorAll('path[class*="context"]')).toHaveLength(54)
    // This phone's own and the honoree say so in the readout.
    expect(screen.getByText('Tú')).toBeTruthy()
    expect(screen.getByText('El novio')).toBeTruthy()
    expect(screen.getByText('Comparado')).toBeTruthy()
  })

  it('the pick is kept per race: the same race finds it again, the other race has its own', () => {
    const one = chart({ entrants: field(12) })
    fireEvent.change(screen.getByRole('combobox', { name: 'Comparar con' }), { target: { value: 'p9' } })
    one.unmount()
    chart({ entrants: field(12) })
    expect((screen.getByRole('combobox', { name: 'Comparar con' }) as HTMLSelectElement).value).toBe('p9')
    cleanup()
    chart({ entrants: field(12), pickKey: 'cardi-golf:race-pick:t1:pairs' })
    expect((screen.getByRole('combobox', { name: 'Comparar con' }) as HTMLSelectElement).value).toBe('')
  })
})

describe('the replay (MOT-21, MOT-15)', () => {
  it('slides the cover on each frame and renders the chart only once a hole', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
    let commits = 0
    const entrants = field(60)
    render(
      <MotionConfig reducedMotion="never">
        <Profiler id="race" onRender={() => commits++}>
          <RaceChart
            title="Carrera de puntos"
            entrants={entrants}
            stable={entrants.map((e) => e.id)}
            days={days}
            strokes={false}
            format={String}
            pairs={false}
            honoreeLabel="El novio"
            pickKey="k"
            hint=""
          />
        </Profiler>
      </MotionConfig>,
    )
    const full = revealAt()
    const paths = Array.from(svg().querySelectorAll('path')).map((p) => p.getAttribute('d'))
    fireEvent.click(screen.getByRole('button', { name: /Revivir/ }))
    expect(screen.getByRole('button', { name: /Pausar/ })).toBeTruthy()
    commits = 0
    const widths: number[] = []
    // About a second of frames: 60 of them, some 6 holes at 170 ms a hole.
    for (let i = 0; i < 60; i++) {
      act(() => {
        vi.advanceTimersByTime(16)
      })
      widths.push(revealAt())
    }
    // The reveal moves on every frame, never back.
    expect(new Set(widths).size).toBeGreaterThan(50)
    expect(widths.every((w, i) => i === 0 || w >= widths[i - 1]!)).toBe(true)
    expect(widths.at(-1)!).toBeLessThan(full)
    // React commits once a hole (the readout), never once a frame.
    expect(commits).toBeLessThanOrEqual(8)
    // Every path is the one drawn at the start.
    expect(Array.from(svg().querySelectorAll('path')).map((p) => p.getAttribute('d'))).toEqual(paths)

    fireEvent.click(screen.getByRole('button', { name: /Pausar/ }))
    expect(screen.getByRole('button', { name: /Seguir/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ver el final' }))
    expect(revealAt()).toBe(full)
    expect(screen.getByRole('button', { name: /Revivir/ })).toBeTruthy()
  })

  it('plays to the end and stops there', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
    chart()
    const full = revealAt()
    fireEvent.click(screen.getByRole('button', { name: /Revivir/ }))
    act(() => {
      vi.advanceTimersByTime(9000)
    })
    expect(revealAt()).toBe(full)
    expect(screen.getByRole('button', { name: /Revivir/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Ver el final' })).toBeNull()
  })

  it('under reduced motion there is no replay: the race shows whole, and the bar jumps', () => {
    chart({}, true)
    expect(screen.queryByRole('button', { name: /Revivir/ })).toBeNull()
    expect(screen.getByText(/Mueve la barra para leerla hoyo por hoyo/)).toBeTruthy()
    const full = revealAt()
    expect(labels()).toHaveLength(4)
    fireEvent.change(screen.getByRole('slider'), { target: { value: '9' } })
    expect(revealAt()).toBeLessThan(full)
  })
})
