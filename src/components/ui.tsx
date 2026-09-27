/**
 * Shared behavioural components: avatar, toggle, sheet, loading, errors,
 * toasts, copy/share. Design primitives (buttons, fields, figures, board,
 * grid, marks) live in ./primitives and are re-exported here so existing
 * imports keep working.
 */
import { Suspense, useEffect, useState, type ReactNode } from 'react'
import { t } from '../i18n/es-MX'
import styles from './ui.module.css'

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

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="toggle">
      <span>
        <span>{label}</span>
        {hint && <span className="help">{hint}</span>}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

/** The sheet's frame without the backdrop; the design page renders it inline. */
export function SheetFrame({ title, onClose, children, wide, className = '' }: { title?: string; onClose?: () => void; children: ReactNode; wide?: boolean; className?: string }) {
  return (
    <div className={`${styles.sheet} ${wide ? styles.sheetWide : ''} ${className}`} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
      <div className={styles.sheetHandle} />
      {title && (
        <div className={styles.sheetHead}>
          <h2>{title}</h2>
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

/** Bottom sheet / modal. */
export function Sheet({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className={styles.backdrop} onClick={onClose} role="presentation">
      <SheetFrame title={title} onClose={onClose} wide={wide}>
        {children}
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

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className={`card ${styles.errorBox}`} role="alert">
      <strong>{t.common.error}</strong>
      <p className="small">{message}</p>
      {onRetry && (
        <button className="btn btn--secondary btn--sm" type="button" onClick={onRetry}>
          {t.common.retry}
        </button>
      )}
    </div>
  )
}

/** One toast. Exported so the design page can show it at rest. */
export function ToastItem({ text, action, onAction }: { text: string; action?: string; onAction?: () => void }) {
  return (
    <div className={styles.toast} role="status">
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
type ToastMsg = { id: number; msg: string; action?: string; onAction?: () => void }
let listeners: Array<(m: Omit<ToastMsg, 'id'>) => void> = []
export function toast(msg: string, action?: { label: string; onClick: () => void }) {
  listeners.forEach((l) => l({ msg, action: action?.label, onAction: action?.onClick }))
}
export function Toaster() {
  const [msgs, setMsgs] = useState<ToastMsg[]>([])
  useEffect(() => {
    const l = (m: Omit<ToastMsg, 'id'>) => {
      const id = Date.now() + Math.random()
      setMsgs((cur) => [...cur, { id, ...m }])
      setTimeout(() => setMsgs((cur) => cur.filter((x) => x.id !== id)), m.action ? 6000 : 2800)
    }
    listeners.push(l)
    return () => {
      listeners = listeners.filter((x) => x !== l)
    }
  }, [])
  if (!msgs.length) return null
  return (
    <div className={styles.toaster} aria-live="polite">
      {msgs.map((m) => (
        <ToastItem
          key={m.id}
          text={m.msg}
          action={m.action}
          onAction={() => {
            m.onAction?.()
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
