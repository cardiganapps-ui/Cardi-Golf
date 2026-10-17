/**
 * Which hole the Tarjeta shows, and how it gets there (§9.3): the hole the group is on (or the one a link
 * asked for), the arrows, a swipe, the grid, the queue the phone had not read yet (NEW-11) and a notice
 * tapped while the card is open (PWA-10, PWA-12). The new hole comes in from the side the card moved (MOT-02).
 */
import { animate, useMotionValue } from 'motion/react'
import { useEffect, useLayoutEffect, useRef, useState, type RefObject, type TouchEvent } from 'react'
import { useLocation } from 'react-router'
import { easeFast, still } from '../../../design/motion'
import { useOutbox } from '../../../data/outbox'
import { dragOffset, swipeEnd, swipeIntent, type Intent } from '../swipe'
import { SLIDE_PX } from './timing'

export function useHoleNav(order: readonly number[], firstOpen: number) {
  // Start on the first hole the group has not completed — or on the one the
  // En vivo shortcut asked for, so that tap lands where it said it would.
  const asked = Number(new URLSearchParams(window.location.search).get('hoyo'))
  const [hole, setHole] = useState<number>(order.includes(asked) ? asked : firstOpen)
  /** The player chose a hole (a swipe, the grid, a save): the card stops following the first open one. */
  const chose = useRef(false)
  // The notice that a card is ready to sign opens the whole card (`?vista=tarjeta`), where «Firmar» is (PWA-10).
  const [view, setView] = useState<'hole' | 'grid'>(() => (new URLSearchParams(window.location.search).get('vista') === 'tarjeta' ? 'grid' : 'hole'))
  /** Which way the last hole change went (+1 next, -1 back, 0 neither): the hole comes in from that side (MOT-02). */
  const slide = useRef(0)
  const idx = order.indexOf(hole)
  const goto = (i: number) => {
    const next = order[i]
    if (next === undefined) return
    chose.current = true
    slide.current = Math.sign(i - idx)
    setHole(next)
  }
  /** A hole tapped on the grid: the hole view, on it, with no slide. */
  const openFromGrid = (h: number) => {
    chose.current = true
    slide.current = 0
    setHole(h)
    setView('hole')
  }
  return { asked, hole, setHole, view, setView, idx, goto, openFromGrid, chose, slide }
}
export type HoleNav = ReturnType<typeof useHoleNav>

/**
 * The new hole comes in from the side the card moved, as a page turns (MOT-02); under reduced motion it fades
 * in. The rows stay mounted, so a stepper keeps its focus and the snake's mark can slide between them.
 */
export function useHoleSlide(hole: number, reduce: boolean | null, slide: RefObject<number>, els: ReadonlyArray<RefObject<HTMLElement | null>>) {
  const shownFor = useRef(hole)
  useLayoutEffect(() => {
    if (shownFor.current === hole) return
    shownFor.current = hole
    const dir = slide.current
    slide.current = 0
    const from = reduce || !dir ? { opacity: [0.4, 1] } : { opacity: [0, 1], x: [dir * SLIDE_PX, 0] }
    for (const el of els) if (el.current) void animate(el.current, from, easeFast)
  }, [hole, reduce]) // eslint-disable-line react-hooks/exhaustive-deps -- when the hole changes; the refs are the card's own
}

/**
 * Where the card goes by itself. Opened before the phone had read its queued holes (the copy shows first), the
 * card sat on a hole this phone had already played offline, as unplayed (NEW-11). Once the queue is read it
 * moves to the first open hole, once, unless the player chose a hole or touched a player. A card opened after
 * that never moves on its own: another phone's save lands on the hole on screen, where this one sees it.
 *
 * A notice tapped while the card is open (PWA-10, PWA-12) changes the address through the router, and the
 * card read the address when it opened: go where it says, as a tap on the grid would (the hole of the
 * snake's question, or the whole card, where «Firmar» is). What was typed here stays on the phone, as when
 * the card moves on (PWA-05). Never under an open question or a save on its way: its answer is this hole's.
 */
export function useFollowHole(o: { nav: HoleNav; order: readonly number[]; firstOpen: number; queueRead: boolean; touched: RefObject<Set<string>>; sheetOpen: boolean; busy: boolean }) {
  const { nav, order, firstOpen, queueRead, touched, sheetOpen, busy } = o
  const followQueue = useRef(!useOutbox.getState().queueRead)
  useEffect(() => {
    if (!followQueue.current || !queueRead) return
    followQueue.current = false
    if (nav.chose.current || order.includes(nav.asked) || touched.current.size > 0 || sheetOpen || busy || nav.hole === firstOpen) return
    nav.slide.current = 0
    nav.setHole(firstOpen)
  }, [queueRead]) // eslint-disable-line react-hooks/exhaustive-deps -- once, when the queue has been read
  const { search } = useLocation()
  const searchSeen = useRef(search)
  useEffect(() => {
    if (searchSeen.current === search) return
    searchSeen.current = search
    if (sheetOpen || busy) return
    const q = new URLSearchParams(search)
    const h = Number(q.get('hoyo'))
    if (order.includes(h)) {
      nav.chose.current = true
      nav.slide.current = Math.sign(order.indexOf(h) - nav.idx)
      nav.setHole(h)
      nav.setView('hole')
    } else if (q.get('vista') === 'tarjeta') nav.setView('grid')
  }, [search]) // eslint-disable-line react-hooks/exhaustive-deps -- when the address changes, with the card as it is then
}

/**
 * The hole follows a sideways finger and springs back if the swipe doesn't go (MOT-02); a vertical one is the
 * page scrolling. Only the hole view takes it, and never under a sheet: a drag inside one must never change the
 * hole under it.
 */
export function useHoleSwipe(o: { active: boolean; idx: number; count: number; goto: (i: number) => void; reduce: boolean | null }) {
  const dragX = useMotionValue(0)
  const swipe = useRef<{ x: number; y: number; at: number; intent: Intent } | null>(null)
  const back = () => {
    if (dragX.get() !== 0) void animate(dragX, 0, o.reduce ? still : easeFast)
  }
  const handlers = {
    onTouchStart: (e: TouchEvent) => {
      const t0 = e.touches[0]
      swipe.current = t0 ? { x: t0.clientX, y: t0.clientY, at: performance.now(), intent: null } : null
    },
    onTouchMove: (e: TouchEvent) => {
      const sw = swipe.current
      const t0 = e.touches[0]
      if (!sw || !t0 || !o.active) return
      const dx = t0.clientX - sw.x
      sw.intent ??= swipeIntent(dx, t0.clientY - sw.y)
      if (sw.intent === 'swipe') dragX.set(dragOffset(dx, o.idx > 0, o.idx < o.count - 1))
    },
    onTouchEnd: (e: TouchEvent) => {
      const sw = swipe.current
      swipe.current = null
      const t0 = e.changedTouches[0]
      const to = sw && t0 && o.active && sw.intent !== 'scroll' ? swipeEnd(t0.clientX - sw.x, t0.clientY - sw.y, performance.now() - sw.at, o.idx > 0, o.idx < o.count - 1) : 0
      if (to) {
        dragX.set(0)
        o.goto(o.idx + to)
      } else back()
    },
    onTouchCancel: () => {
      swipe.current = null
      back()
    },
  }
  return { dragX, handlers }
}
