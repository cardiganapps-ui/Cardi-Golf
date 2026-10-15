/**
 * Shared behavioural components: avatar, toggle, sheet, loading, errors,
 * toasts, copy/share. Design primitives (buttons, fields, figures, board,
 * grid, marks) live in ./primitives and are re-exported here so existing
 * imports keep working.
 */
import { Suspense, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { t } from '../i18n/es-MX'
import { humanError } from '../lib/humanError'
import styles from './ui.module.css'
import { anySheetOpen, isTopSheet, sheetClosed, sheetOpened } from './sheetHistory'
import { modalClosed, modalOpened, wrapTab } from './modalFocus'

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

/** The sheet's frame without the backdrop; the design page renders it inline. */
export function SheetFrame({ title, onClose, children, wide, className = '', frameRef }: { title?: string; onClose?: () => void; children: ReactNode; wide?: boolean; className?: string; frameRef?: React.Ref<HTMLDivElement> }) {
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
      <div className={styles.sheetHandle} />
      {(title || onClose) && (
        <div className={styles.sheetHead}>
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


/**
 * Bottom sheet / modal. Focus moves in on open and back to the opener on close;
 * while it is open the page behind it is inert and Tab goes round inside it
 * (A11Y-03, ./modalFocus). Escape closes the top sheet only.
 * `dirty`: the sheet holds work typed into it (a scorecard, a player); the
 * backdrop, Escape, «Cerrar» and the system back then ask before discarding
 * it, in a sheet of their own, so a back on that question keeps editing (UX-15).
 */
export function Sheet({ open, onClose, title, children, wide, dirty }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; wide?: boolean; dirty?: boolean }) {
  const id = useId()
  const backdrop = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLDivElement>(null)
  const opener = useRef<HTMLElement | null>(null)
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
    modalOpened(el)
    return () => modalClosed(el)
  }, [open])
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
  if (!open) return null
  return (
    <div ref={backdrop} className={styles.backdrop} onClick={tryClose} role="presentation">
      <SheetFrame title={title} onClose={tryClose} wide={wide} frameRef={frame}>
        {children}
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
/** Suspense boundary for lazy-loaded screens. */
export function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<Spinner />}>{children}</Suspense>
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
      {msgs.map((m) => (
        <ToastItem
          key={m.id}
          text={m.msg}
          action={m.action}
          onAction={() => {
            m.onAction?.()
            resume()
            setMsgs((cur) => cur.filter((x) => x.id !== m.id))
          }}
        />
      ))}
    </div>
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
