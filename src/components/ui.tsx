/**
 * Shared behavioural components: avatar, toggle, sheet, loading, errors,
 * toasts, copy/share. Design primitives (buttons, fields, figures, board,
 * grid, marks) live in ./primitives and are re-exported here so existing
 * imports keep working.
 */
import { AnimatePresence, motion, usePresence, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { t } from '../i18n/es-MX'
import { humanError } from '../lib/humanError'
import styles from './ui.module.css'
import { anySheetOpen, isTopSheet, sheetClosed, sheetOpened } from './sheetHistory'
import { modalClosed, modalOpened, wrapTab } from './modalFocus'
import { ease } from '../design/motion'

export { Field, Segmented } from './primitives'

export function Avatar({ name, url, size, honoree }: { name: string; url?: string | null; size?: 'sm' | 'lg'; honoree?: boolean }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
  return (
    <span className={`avatar ${size === 'lg' ? 'avatar--lg' : size === 'sm' ? 'avatar--sm' : ''}`} aria-hidden="true">
      {url ? <img src={url} alt="" loading="lazy" /> : initials}
      {honoree && <span className={styles.honoreeMark} />}
    </span>
  )
}

/**
 * A switch with its words. The whole row is its label, so a tap anywhere on it flips it; it is named by its words
 * alone and the hint describes it (A11Y-24): inside the label, the hint was part of its name.
 */
export function Toggle({ label, checked, onChange, hint, ariaLabel }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string; ariaLabel?: string }) {
  const id = useId()
  return (
    <label className="toggle">
      <span>
        <span id={`${id}-label`}>{label}</span>
        {hint && (
          <span className="help" id={`${id}-hint`}>
            {hint}
          </span>
        )}
      </span>
      <input
        type="checkbox"
        checked={checked}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabel ? undefined : `${id}-label`}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  )
}

/**
 * The sheet's frame without the backdrop; the design page renders it inline.
 * `onGrab`: a press on the grabber or the header (never on its «Cerrar») that
 * may become a drag down (MOT-09); the body has none, so a drag there scrolls.
 */
export function SheetFrame({ title, onClose, children, wide, className = '', frameRef, onGrab }: { title?: string; onClose?: () => void; children: ReactNode; wide?: boolean; className?: string; frameRef?: React.Ref<HTMLDivElement>; onGrab?: (e: React.PointerEvent<HTMLElement>) => void }) {
  const titleId = useId()
  // The dialog is named by its visible heading. A sheet you can close always
  // shows «Cerrar»: a phone has no Escape key, and the strip of backdrop above
  // a tall sheet is all but unreachable (A11Y-02).
  return (
    <div
      ref={frameRef}
      tabIndex={-1}
      className={`${styles.sheet} ${wide ? styles.sheetWide : ''} ${className}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : t.common.dialog}
      onClick={(e) => e.stopPropagation()}
    >
      {/* The grabber's strip, the sheet's width: a 4 px bar is no target for a thumb. */}
      <div className={styles.sheetGrab} data-sheet-grab="" onPointerDown={onGrab}>
        <div className={styles.sheetHandle} />
      </div>
      {(title || onClose) && (
        <div className={styles.sheetHead} data-sheet-grab="" onPointerDown={onGrab}>
          {title ? <h2 id={titleId}>{title}</h2> : <span />}
          {onClose && (
            <button className="btn btn--ghost btn--sm" type="button" onClick={onClose}>
              {t.common.close}
            </button>
          )}
        </div>
      )}
      <div className={styles.sheetBody}>{children}</div>
    </div>
  )
}


/** A drag down past this share of the sheet's height closes it (MOT-09). */
export const SHEET_DISMISS_SHARE = 0.25
/** …and so does a flick down faster than this, in px/ms, over the last SHEET_FLICK_MS of the drag. */
export const SHEET_DISMISS_SPEED = 0.5
const SHEET_FLICK_MS = 100

/** How long an element's CSS animation runs, delay included, in ms; 0 when it has none (no styles, reduced motion). */
function animationMs(el: Element): number {
  const s = getComputedStyle(el)
  if (!s.animationName || s.animationName === 'none') return 0
  const ms = (v: string) => v.split(',').map((x) => (x.trim().endsWith('ms') ? parseFloat(x) : parseFloat(x) * 1000) || 0)
  const durations = ms(s.animationDuration ?? '')
  const delays = ms(s.animationDelay ?? '')
  return Math.max(0, ...durations.map((d, i) => d + (delays[i] ?? delays[0] ?? 0)))
}

/** A drag's marks off the sheet and its backdrop. */
function clearDrag(el: HTMLElement, bd: HTMLElement) {
  for (const p of ['transform', 'transition', '--sheet-y', '--sheet-travel']) el.style.removeProperty(p)
  for (const p of ['transition', '--sheet-tint']) bd.style.removeProperty(p)
}

/** A drag let go short of closing: the sheet settles back over --dur, the backdrop darkens again. */
function springBack(el: HTMLElement, bd: HTMLElement) {
  el.style.transition = 'transform var(--dur) var(--ease)'
  el.style.transform = ''
  el.style.removeProperty('--sheet-y')
  el.style.removeProperty('--sheet-travel')
  bd.style.transition = 'background-color var(--dur) var(--ease)'
  bd.style.removeProperty('--sheet-tint')
}

/**
 * Bottom sheet / modal. Focus moves in on open and back to the opener on close;
 * while it is open the page behind it is inert and Tab goes round inside it
 * (A11Y-03, ./modalFocus). Escape closes the top sheet only.
 * `dirty`: the sheet holds work typed into it (a scorecard, a player); the
 * backdrop, Escape, «Cerrar» and the system back then ask before discarding
 * it, in a sheet of their own, so a back on that question keeps editing (UX-15).
 *
 * Closing plays the entry backwards (MOT-09): the sheet drops and fades, the
 * backdrop fades, over --dur-fast. Everything else about closing happens at
 * once, as before: the page comes back from inert, the system back's entry
 * goes, focus returns to the opener. The leaving sheet is only a picture of
 * what was there (its last content, inert, hidden from a screen reader, no
 * target for a tap), gone when its animation ends; reopened before that, it
 * opens again from where it is. Under reduced motion it goes at once.
 * `onExited`: it has left the screen (a caller that unmounts its content
 * when closed waits for this, as the player sheet does).
 *
 * The grabber and the header drag it down: it follows the finger, and a
 * release past a quarter of its height, or a flick down, closes it as the
 * backdrop would; anything less springs back.
 */
export function Sheet({ open, onClose, title, children, wide, dirty, onExited }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; wide?: boolean; dirty?: boolean; onExited?: () => void }) {
  const id = useId()
  const backdrop = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLDivElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  /* Leaving: closed, still on screen while its exit plays. Set in render, so the frame that closes it already shows it leaving. */
  const [leaving, setLeaving] = useState(false)
  const [wasOpen, setWasOpen] = useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    setLeaving(!open)
  }
  /* What it showed last while open: a caller's content often goes with the open state (`open={!!edit}`, `{edit && …}`). */
  const shown = useRef({ title, children, wide })
  if (open) shown.current = { title, children, wide }
  const isOpen = useRef(open)
  const exited = useRef(onExited)
  useLayoutEffect(() => {
    isOpen.current = open
    exited.current = onExited
  })
  /*
   * Callers pass `onClose` inline, so it is a new function on every render. The
   * open/close effect below must not depend on it: when it did, every keystroke
   * re-rendered the parent, re-ran the effect and its cleanup sent focus back to
   * the opener, so only the first character reached the field (UX-01).
   */
  const close = useRef(onClose)
  const isDirty = useRef(!!dirty)
  useEffect(() => {
    close.current = onClose
    isDirty.current = !!dirty
  }, [onClose, dirty])
  const [asking, setAsking] = useState(false)
  /** Every way out but the sheet's own actions: straight out, or the question first when there is work in it. */
  const tryClose = useCallback(() => {
    if (isDirty.current) setAsking(true)
    else close.current()
  }, [])
  /*
   * The page goes inert in the same commit the sheet appears in, and comes back
   * in the one it leaves in, before focus returns to the opener (a passive
   * effect, below). The opener is read first: inside an inert branch it would
   * already have lost focus.
   */
  useLayoutEffect(() => {
    if (!open) return
    opener.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null
    const el = backdrop.current
    if (!el) return
    // Reopened while leaving, or after a drag: from where it rests.
    if (frame.current) clearDrag(frame.current, el)
    modalOpened(el)
    return () => modalClosed(el)
  }, [open])
  /* The exit's end. Nothing to wait for (reduced motion, no styles) is the end now. */
  useLayoutEffect(() => {
    if (!leaving) return
    const el = frame.current
    let done = false
    const end = () => {
      if (done) return
      done = true
      setLeaving(false)
      exited.current?.()
    }
    const ms = el ? animationMs(el) : 0
    if (!el || ms <= 0) {
      end()
      return
    }
    const onEnd = (e: AnimationEvent) => {
      if (e.target === el) end()
    }
    el.addEventListener('animationend', onEnd)
    // A page in the background may never paint the last frame.
    const timer = setTimeout(end, ms + 100)
    return () => {
      el.removeEventListener('animationend', onEnd)
      clearTimeout(timer)
    }
  }, [leaving])
  /*
   * A drag down from the grabber or the header. Pointer events, so a finger, a
   * pen and a mouse all drag; the strips take no browser gesture of their own
   * (`touch-action: none`), so the drag never turns into a scroll halfway.
   */
  const grab = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0 || !e.isPrimary) return
      // «Cerrar» and anything else that takes a tap keeps its tap.
      if ((e.target as Element).closest('button, a, input, select, textarea, label, [role="button"]')) return
      const el = frame.current
      const bd = backdrop.current
      if (!el || !bd) return
      const pointer = e.pointerId
      const top = e.clientY
      const height = el.getBoundingClientRect().height || 1
      const tint = parseFloat(getComputedStyle(bd).getPropertyValue('--sheet-tint')) || 0
      let y = 0
      let samples = [{ y: 0, at: e.timeStamp }]
      el.style.transition = 'none'
      bd.style.transition = 'none'
      try {
        e.currentTarget.setPointerCapture(pointer)
      } catch {
        // Not every pointer can be captured (a synthetic one): the window still hears it.
      }
      const move = (ev: PointerEvent) => {
        if (ev.pointerId !== pointer) return
        // Down only: lifted, a sheet anchored to the bottom would show the page under its foot.
        y = Math.max(0, ev.clientY - top)
        el.style.transform = y ? `translateY(${y}px)` : ''
        if (tint) bd.style.setProperty('--sheet-tint', `${(tint * (1 - Math.min(1, y / height))).toFixed(2)}%`)
        samples = [...samples.filter((s) => ev.timeStamp - s.at <= SHEET_FLICK_MS), { y, at: ev.timeStamp }]
      }
      const up = (ev: PointerEvent) => {
        if (ev.pointerId !== pointer) return
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', up)
        if (ev.type === 'pointerup') move(ev)
        const from = samples[0]!
        const speed = (y - from.y) / Math.max(1, ev.timeStamp - from.at)
        if (ev.type !== 'pointerup' || y <= 0 || (y < height * SHEET_DISMISS_SHARE && speed <= SHEET_DISMISS_SPEED)) {
          springBack(el, bd)
          return
        }
        // The exit carries on from where the finger let go, down off the screen.
        el.style.setProperty('--sheet-y', `${y}px`)
        el.style.setProperty('--sheet-travel', `${Math.max(16, height - y)}px`)
        tryClose()
        // Still open a moment later (work in it asks first, a caller that keeps it): back up.
        setTimeout(() => {
          if (isOpen.current) springBack(el, bd)
        }, 0)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', up)
    },
    [tryClose],
  )
  useEffect(() => {
    if (!open) return
    sheetOpened(id, tryClose)
    document.body.style.overflow = 'hidden'
    /*
     * Focus the frame, not the first field. Grabbing the first `input` raised
     * the keyboard on every sheet, including the ones you open just to read:
     * tapping a hole in Comité › Tarjetas opened the numeric pad over the score
     * you wanted to check. A sheet that really should start in a field says so
     * with `data-autofocus` (the search sheets do).
     */
    const timer = setTimeout(() => {
      const el = frame.current
      if (!el) return
      // A field that asked for focus itself (autoFocus) already has it: leave it.
      if (el.contains(document.activeElement)) return
      const wanted = el.querySelector<HTMLElement>('[data-autofocus]:not([disabled])')
      ;(wanted ?? el).focus()
    }, 30)
    const onKey = (e: KeyboardEvent) => {
      if (!isTopSheet(id)) return
      if (e.key === 'Tab') {
        if (frame.current) wrapTab(frame.current, e)
        return
      }
      if (e.key !== 'Escape') return
      e.stopPropagation()
      tryClose()
    }
    window.addEventListener('keydown', onKey)
    // Runs only when the sheet closes or unmounts, never on a re-render.
    return () => {
      clearTimeout(timer)
      window.removeEventListener('keydown', onKey)
      sheetClosed(id)
      if (!anySheetOpen()) document.body.style.overflow = ''
      opener.current?.focus?.()
      setAsking(false)
    }
  }, [open, id, tryClose])
  if (!open && !leaving) return null
  const view = open ? { title, children, wide } : shown.current
  return (
    <div
      ref={backdrop}
      className={`${styles.backdrop} ${leaving ? styles.leaving : ''}`}
      onClick={leaving ? undefined : tryClose}
      role="presentation"
      aria-hidden={leaving || undefined}
      inert={leaving || undefined}
    >
      <SheetFrame title={view.title} onClose={tryClose} wide={view.wide} frameRef={frame} onGrab={leaving ? undefined : grab}>
        {view.children}
        <Sheet open={asking} onClose={() => setAsking(false)} title={t.common.discardTitle}>
          <div className="stack">
            <p className="help">{t.common.discardBody}</p>
            <div className="row">
              <button className="btn btn--secondary" type="button" onClick={() => setAsking(false)}>
                {t.common.keepEditing}
              </button>
              <button
                className="btn btn--danger grow"
                type="button"
                onClick={() => {
                  setAsking(false)
                  close.current()
                }}
              >
                {t.common.discard}
              </button>
            </div>
          </div>
        </Sheet>
      </SheetFrame>
    </div>
  )
}

/** A loading placeholder shaped like the content it replaces. */
export function Skeleton({ w = '100%', h = 16 }: { w?: string | number; h?: number }) {
  return <span className={styles.skeleton} style={{ width: w, height: h }} aria-hidden="true" />
}
/** Loading state for a screen: a few rows, no spinner, no layout jump. */
export function Spinner({ label, rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className={styles.loading} role="status" aria-label={label ?? t.common.loading}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} h={i === 0 ? 24 : 16} w={i === 0 ? '55%' : i % 2 ? '85%' : '70%'} />
      ))}
    </div>
  )
}

/** `error`: the caught error, or copy already made from one; it shows as humanError (COPY-04). */
export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className={`card ${styles.errorBox}`} role="alert">
      <strong>{t.common.error}</strong>
      <p className="small">{humanError(error)}</p>
      {onRetry && (
        <button className="btn btn--secondary btn--sm" type="button" onClick={onRetry}>
          {t.common.retry}
        </button>
      )}
    </div>
  )
}

/** One toast. Exported so the design page can show it at rest. The Toaster's region says it; the toast itself is no region of its own, so it is heard once. */
export function ToastItem({ text, action, onAction }: { text: string; action?: string; onAction?: () => void }) {
  return (
    <div className={styles.toast}>
      <span>{text}</span>
      {action && (
        <button type="button" className={styles.toastAction} onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  )
}

/** Tiny toast queue. `toast(msg)` from anywhere; an optional action stays 6 s instead of 2.8 s. */
type ToastMsg = { id: number; msg: string; action?: string; onAction?: () => void; until: number }
let listeners: Array<(m: Omit<ToastMsg, 'id' | 'until'>) => void> = []
export function toast(msg: string, action?: { label: string; onClick: () => void }) {
  listeners.forEach((l) => l({ msg, action: action?.label, onAction: action?.onClick }))
}
/**
 * The toasts' region is always there, empty between toasts (A11Y-14): a live
 * region inserted together with its first message is one VoiceOver and NVDA
 * often skip. A toast's time stops while the pointer or focus is on it, so its
 * action («Deshacer») can be read and reached before it goes (WCAG 2.2.1).
 */
export function Toaster() {
  const [msgs, setMsgs] = useState<ToastMsg[]>([])
  /** When the pointer or focus came onto a toast; null while time runs. */
  const [pausedAt, setPausedAt] = useState<number | null>(null)
  const queued = useRef(0)
  useEffect(() => {
    const l = (m: Omit<ToastMsg, 'id' | 'until'>) => {
      const id = Date.now() + Math.random()
      // Into an empty queue nothing is held: a toast removed under the pointer or the focus sends no leave or blur.
      if (queued.current === 0) setPausedAt(null)
      setMsgs((cur) => [...cur, { id, ...m, until: Date.now() + (m.action ? 6000 : 2800) }])
    }
    listeners.push(l)
    return () => {
      listeners = listeners.filter((x) => x !== l)
    }
  }, [])
  useEffect(() => {
    queued.current = msgs.length
    if (pausedAt != null || !msgs.length) return
    const now = Date.now()
    const timers = msgs.map((m) => setTimeout(() => setMsgs((cur) => cur.filter((x) => x.id !== m.id)), Math.max(0, m.until - now)))
    return () => timers.forEach(clearTimeout)
  }, [msgs, pausedAt])
  const pause = () => setPausedAt((at) => at ?? Date.now())
  const resume = () => {
    if (pausedAt == null) return
    // The time spent paused is given back to every toast still showing.
    const held = Date.now() - pausedAt
    setMsgs((cur) => cur.map((m) => ({ ...m, until: m.until + held })))
    setPausedAt(null)
  }
  return (
    <div
      className={styles.toaster}
      role="status"
      aria-live="polite"
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) resume()
      }}
    >
      {/* A toast that goes leaves the stack at once and fades where it was; the rest glide to their places (MOT-09). */}
      <AnimatePresence initial={false} mode="popLayout">
        {msgs.map((m) => (
          <ToastSlot key={m.id}>
            <ToastItem
              text={m.msg}
              action={m.action}
              onAction={() => {
                m.onAction?.()
                resume()
                setMsgs((cur) => cur.filter((x) => x.id !== m.id))
              }}
            />
          </ToastSlot>
        ))}
      </AnimatePresence>
    </div>
  )
}

/**
 * One toast's place in the stack. It rises in (the toast's own CSS, over --dur) and goes the way it came over
 * --dur-fast (MOT-09); with `popLayout` a toast going leaves the stack at once, and the others glide to their
 * places instead of jumping. Going, it is a picture only: no second «Deshacer», nothing more to hear. Reduced
 * motion: it goes at once and nothing glides. The exit is CSS, as the sheet's, and Motion only moves the stack.
 */
function ToastSlot({ children, ref }: { children: ReactNode; ref?: React.Ref<HTMLDivElement> }) {
  const [present, safeToRemove] = usePresence()
  const reduce = useReducedMotion()
  const el = useRef<HTMLDivElement>(null)
  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      el.current = node
      if (typeof ref === 'function') ref(node)
      else if (ref) ref.current = node
    },
    [ref],
  )
  useLayoutEffect(() => {
    if (present) return
    const node = el.current
    const ms = node ? animationMs(node) : 0
    if (!node || ms <= 0) {
      safeToRemove?.()
      return
    }
    let done = false
    const end = () => {
      if (done) return
      done = true
      safeToRemove?.()
    }
    const onEnd = (e: AnimationEvent) => {
      if (e.target === node) end()
    }
    node.addEventListener('animationend', onEnd)
    const timer = setTimeout(end, ms + 100)
    return () => {
      node.removeEventListener('animationend', onEnd)
      clearTimeout(timer)
    }
  }, [present, safeToRemove])
  return (
    <motion.div
      ref={setRef}
      className={`${styles.toastSlot} ${present ? '' : styles.toastLeaving}`}
      layout={reduce ? false : 'position'}
      transition={ease}
      aria-hidden={present ? undefined : true}
      inert={!present || undefined}
    >
      {children}
    </motion.div>
  )
}

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      className="btn btn--secondary btn--sm"
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        } catch {
          toast(text)
        }
      }}
    >
      {done ? t.common.copied : (label ?? t.common.copy)}
    </button>
  )
}

export function ShareButton({ text, url, title }: { text: string; url?: string; title?: string }) {
  if (typeof navigator === 'undefined' || !navigator.share) return null
  return (
    <button className="btn btn--primary btn--sm" type="button" onClick={() => navigator.share({ text, url, title }).catch(() => undefined)}>
      {t.common.share}
    </button>
  )
}
