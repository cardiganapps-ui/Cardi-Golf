/**
 * Avisos: write to everyone on Polo, or to one person. It lands in their
 * inbox and, where push is on, on the phone, looking exactly like the
 * preview. Two notices to everyone a day at most (the server holds that
 * line); every notice is logged.
 */
import { useCallback, useEffect, useState } from 'react'
import { t } from '../../i18n/es-MX'
import { ErrorBox, Spinner, toast } from '../../components/ui'
import { Field, Input, Segmented } from '../../components/primitives'
import { ConfirmSheet } from '../../components/ConfirmSheet'
import { safeNoticeUrl } from '../../lib/noticeText'
import { usePlatformApi, type Audience, type PersonRow } from '../../data/platform'
import { relTime } from '../../lib/relTime'
import { personName } from './names'
import s from './Platform.module.css'
import { humanError } from '../../lib/humanError'

const N = t.platform.notices

export function NoticesScreen() {
  const api = usePlatformApi()
  const [audience, setAudience] = useState<Audience | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'all' | 'one'>('all')
  const [to, setTo] = useState<PersonRow | null>(null)
  const [q, setQ] = useState('')
  const [found, setFound] = useState<PersonRow[]>([])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [url, setUrl] = useState('')
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      setAudience(await api.audience())
    } catch (e) {
      setError(humanError(e))
    }
  }, [api])
  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => {
    if (mode !== 'one' || to || q.trim().length < 2) return
    const id = window.setTimeout(() => {
      api.people({ q, filter: 'accounts', limit: 8 }).then((r) => setFound(r.rows), () => setFound([]))
    }, 250)
    return () => window.clearTimeout(id)
  }, [api, mode, to, q])

  if (error) return <ErrorBox error={error} onRetry={() => void load()} />
  if (!audience) return <Spinner rows={6} />

  const urlOk = !url.trim() || safeNoticeUrl(url.trim()) != null
  const limitReached = mode === 'all' && audience.sentToday >= 2
  const ready = title.trim().length >= 1 && title.trim().length <= 60 && body.trim().length >= 1 && body.trim().length <= 280 && urlOk && (mode === 'all' || !!to) && !limitReached
  const reach = mode === 'all' ? audience.profiles : 1

  async function send() {
    setBusy(true)
    try {
      const n = await api.broadcast(title.trim(), body.trim(), mode === 'one' ? to!.id : null, url.trim() || null)
      toast(N.sent(n))
      setTitle('')
      setBody('')
      setUrl('')
      setAsking(false)
      await load()
    } catch (e) {
      toast(humanError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={s.screen}>
      <h2>{t.platform.sections.notices}</h2>
      <p className={s.help}>{N.hint}</p>

      <section className={s.section}>
        <Segmented
          value={mode}
          label={N.toLabel}
          options={[
            { value: 'all', label: N.toAll },
            { value: 'one', label: N.toOne },
          ]}
          onChange={(v) => {
            setMode(v)
            setTo(null)
          }}
        />
        {mode === 'all' ? (
          <>
            <span className={s.help}>{N.audienceAll(audience.profiles, audience.push)}</span>
            <span className={limitReached ? s.problem : s.help}>{N.limit(audience.sentToday)}</span>
          </>
        ) : to ? (
          <div className={s.actions}>
            <strong>{N.picked(personName(to))}</strong>
            <button className="btn btn--ghost btn--sm" type="button" onClick={() => setTo(null)}>
              {N.change}
            </button>
          </div>
        ) : (
          <>
            <Input type="search" value={q} placeholder={t.platform.people.search} aria-label={N.pick} onChange={(e) => setQ(e.target.value)} />
            <div className={s.rows} role="listbox" aria-label={N.pick}>
              {(q.trim().length < 2 ? [] : found).map((r) => (
                <button key={r.id} type="button" role="option" aria-selected={false} className={`${s.row} ${s.rowPick}`} onClick={() => setTo(r)}>
                  <span className={s.rowText}>
                    <span className={s.rowTitle}>{personName(r)}</span>
                    <span className={s.rowSub}>{r.email}</span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      <section className={s.section}>
        <Field label={N.title} hint={N.titleHint(title.trim().length)}>
          <Input value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label={N.body} hint={N.bodyHint(body.trim().length)}>
          <textarea className="input" rows={3} value={body} maxLength={280} onChange={(e) => setBody(e.target.value)} />
        </Field>
        <Field label={N.url} hint={N.urlHint} error={urlOk ? null : N.urlBad}>
          <Input value={url} placeholder="/crews" autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={(e) => setUrl(e.target.value)} />
        </Field>
        {(title.trim() || body.trim()) && (
          <div className={s.pushPreview} aria-label={N.preview}>
            <span className="label">{N.preview}</span>
            <strong>{title.trim() || t.social.notice.platformTitle}</strong>
            <span>{body.trim()}</span>
          </div>
        )}
        <button className="btn btn--primary btn--block" type="button" disabled={!ready} onClick={() => setAsking(true)}>
          {N.send}
        </button>
      </section>

      <section className={s.section}>
        <div className={s.sectionHead}>
          <strong>{N.recent}</strong>
        </div>
        {audience.recent.length === 0 ? (
          <p className={s.help}>{N.recentEmpty}</p>
        ) : (
          <div className={s.rows}>
            {audience.recent.map((r) => (
              <div key={r.id} className={s.row}>
                <span className={s.rowText}>
                  <span className={s.rowTitle}>{r.title}</span>
                  <span className={s.rowSub}>{[N.recentTo(r.toName, r.count), r.body].join(' · ')}</span>
                </span>
                <span className={s.rowEnd}>{relTime(r.at)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <ConfirmSheet
        open={asking}
        title={N.confirmTitle}
        body={`${mode === 'one' && to ? N.picked(personName(to)) : N.audienceAll(audience.profiles, audience.push)} ${N.confirmBody}`}
        confirmLabel={mode === 'all' ? N.confirmAll(reach) : N.send}
        busy={busy}
        onClose={() => setAsking(false)}
        onConfirm={() => void send()}
      />
    </div>
  )
}
