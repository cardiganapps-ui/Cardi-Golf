/**
 * Pull down on a board to bring it from the server again (PWA-15). The installed app has no reload button,
 * and the browser's own pull-to-refresh is off on purpose (`overscroll-behavior-y: none` in global.css): it
 * reloaded the whole app, a hole being typed with it. This one fetches the boards and nothing else. The
 * header's chip is the same action for anyone who can't drag (a screen reader, a keyboard).
 * - Only where the shell turns it on: the boards (En vivo, Juegos, Dinero). Never on the Tarjeta, whose
 *   sideways swipes move between holes.
 * - Only from the top of the page, and only a drag that goes down; anything else is the page's. React's touch
 *   listeners are passive, so nothing here can hold a scroll back.
 * - Never while a sheet is open, nor from inside one.
 * - Letting go past the threshold refreshes; short of it, nothing does. While a refresh is under way, a pull
 *   starts nothing.
 * - It moves on the motion tokens: under reduced motion it follows the finger, and nothing else moves.
 */
import { useRef, useState, type ReactNode, type TouchEvent } from 'react'
import { IconRefresh } from '../../components/icons'
import { anySheetOpen } from '../../components/sheetHistory'
import { PULL_REST_PX, PULL_THRESHOLD_PX, pullArmed, pullIntent, pullMayStart, pullOffset, type PullIntent } from './pull'
import styles from './PullToRefresh.module.css'

type Phase = 'idle' | 'pulling' | 'armed' | 'waiting'

/** How far down the page is. */
const pageTop = () => Math.max(window.scrollY || 0, document.scrollingElement?.scrollTop || 0)

/** A box between the finger and the board that is scrolled down on its own: the drag scrolls it back first. */
function boxScrolled(from: EventTarget | null, board: HTMLElement): boolean {
  for (let el = from instanceof Element ? from : null; el && el !== board; el = el.parentElement) if (el.scrollTop > 0) return true
  return false
}

export function PullToRefresh({ enabled, refreshing, onRefresh, children }: { enabled: boolean; refreshing: boolean; onRefresh: () => Promise<void>; children: ReactNode }) {
  const board = useRef<HTMLDivElement>(null)
  const mark = useRef<HTMLDivElement>(null)
  const finger = useRef<{ x: number; y: number; intent: PullIntent; offset: number } | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')

  /** The indicator where the finger has it: written to the element, so a pull renders nothing under it. */
  function place(offset: number) {
    mark.current?.style.setProperty('--pull', `${offset}px`)
    mark.current?.style.setProperty('--turn', String(offset / PULL_THRESHOLD_PX))
  }
  function settle() {
    finger.current = null
    place(0)
    setPhase('idle')
  }

  function start(e: TouchEvent) {
    finger.current = null
    const t = e.touches[0]
    const ok =
      !!t &&
      !!board.current &&
      pullMayStart({
        enabled,
        refreshing: refreshing || phase === 'waiting',
        fingers: e.touches.length,
        pageTop: pageTop(),
        sheetOpen: anySheetOpen(),
        inDialog: e.target instanceof Element && !!e.target.closest('[role="dialog"]'),
        boxScrolled: boxScrolled(e.target, board.current),
      })
    if (ok) finger.current = { x: t.clientX, y: t.clientY, intent: null, offset: 0 }
  }

  function move(e: TouchEvent) {
    const f = finger.current
    const t = e.touches[0]
    if (!f || !t) return
    const dx = t.clientX - f.x
    const dy = t.clientY - f.y
    f.intent ??= pullIntent(dx, dy)
    if (f.intent === 'other') return void (finger.current = null)
    if (f.intent !== 'pull') return
    // The page moved under the finger (back up after the pull, then on down): it is scrolling now, not pulling.
    if (pageTop() > 0) { settle(); return; }
    f.offset = pullOffset(dy)
    place(f.offset)
    setPhase(pullArmed(f.offset) ? 'armed' : 'pulling')
  }

  function end() {
    const f = finger.current
    if (f?.intent !== 'pull') return void (finger.current = null)
    finger.current = null
    if (!pullArmed(f.offset) || refreshing) { settle(); return; }
    place(PULL_REST_PX)
    setPhase('waiting')
    void onRefresh().finally(settle)
  }

  return (
    <div ref={board} className={styles.board} onTouchStart={start} onTouchMove={move} onTouchEnd={end} onTouchCancel={() => finger.current && settle()}>
      {enabled && (
        <div ref={mark} className={`${styles.mark} ${styles[phase]}`} data-pull={phase} aria-hidden="true">
          <IconRefresh size={22} />
        </div>
      )}
      {children}
    </div>
  )
}
