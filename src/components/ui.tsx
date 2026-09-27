/**
 * Small shared building blocks. Everything is 48px+ tap targets, high
 * contrast, and Spanish copy from i18n.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { t } from '../i18n/es-MX'
import styles from './ui.module.css'

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
      {honoree && <span className={styles.crown}>👑</span>}
    </span>
  )
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      {children}
      {hint && !error && <span className="help">{hint}</span>}
      {error && <span className="error">{error}</span>}
    </label>
  )
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="toggle">
      <span>
        <span>{label}</span>
        {hint && <span className="help" style={{ display: 'block' }}>{hint}</span>}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
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
      <div className={`${styles.sheet} ${wide ? styles.sheetWide : ''}`} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className={styles.sheetHandle} />
        {title && (
          <div className="row row--between" style={{ marginBottom: 12 }}>
            <h2>{title}</h2>
            <button className="btn btn--ghost btn--sm" type="button" onClick={onClose}>
              {t.common.close}
            </button>
          </div>
        )}
        <div className={styles.sheetBody}>{children}</div>
      </div>
    </div>
  )
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className={styles.spinner} role="status">
      <span className={styles.dot} />
      <span>{label ?? t.common.loading}</span>
    </div>
  )
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

/** Tiny toast queue. */
let listeners: Array<(msg: string) => void> = []
export function toast(msg: string) {
  listeners.forEach((l) => l(msg))
}
export function Toaster() {
  const [msgs, setMsgs] = useState<Array<{ id: number; msg: string }>>([])
  useEffect(() => {
    const l = (msg: string) => {
      const id = Date.now() + Math.random()
      setMsgs((m) => [...m, { id, msg }])
      setTimeout(() => setMsgs((m) => m.filter((x) => x.id !== id)), 2800)
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
        <div key={m.id} className={styles.toast}>
          {m.msg}
        </div>
      ))}
    </div>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
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
