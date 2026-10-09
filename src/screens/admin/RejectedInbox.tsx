/**
 * «Pendientes de revisar» (REL-08): the holes the server kept for the
 * Comité instead of taking them (save_hole, 0026). Each row says whose hole,
 * what the phone sent and from whose phone, why the server did not take it,
 * what the card holds now and what applying it would leave. «Aplicar» and
 * «Descartar» both ask for a reason (resolve_rejected_write, 0028). A row the
 * card already matches (a phone that sent its value again, the Comité that
 * typed it in) only needs dismissing, and those go together in one tap.
 *
 * Online only, like every Comité correction. Read when the screen opens and
 * after each answer; another Comité phone's answers show on the next read.
 */
import { useEffect, useState } from 'react'
import { t } from '../../i18n/es-MX'
import { toast } from '../../components/ui'
import { ReasonSheet } from '../../components/ReasonSheet'
import { resolveRejectedWrite } from '../../data/api'
import { appliedValue, loadRejectedInbox, resolveInboxItem, sameValue, sentValue, useRejectedInbox, type HoleValue, type InboxItem } from '../../data/rejectedInbox'
import { useTournament } from '../../data/tournamentStore'
import { humanError, UserError } from '../../lib/humanError'
import { useTournamentCtx } from '../tournament/TournamentGate'
import a from './Admin.module.css'

const SI = t.admin.serverInbox
const IB = t.admin.inbox

type Ask = { kind: 'apply' | 'dismiss'; item: InboxItem } | { kind: 'matching'; items: InboxItem[] } | null

export function RejectedInbox() {
  const { tournamentId } = useTournamentCtx()
  const data = useTournament((s) => s.data)!
  const reload = useTournament((s) => s.reload)
  const inbox = useRejectedInbox()
  const [ask, setAsk] = useState<Ask>(null)
  const { snapshot } = data

  useEffect(() => {
    void loadRejectedInbox(tournamentId)
  }, [tournamentId])

  const items = inbox.tournamentId === tournamentId ? inbox.items : []
  /** The short name, or the full one when another player shares it. */
  const name = (id: string | null) => {
    const p = snapshot.players.find((x) => x.id === id)
    if (!p) return null
    return snapshot.players.some((o) => o.id !== p.id && o.displayName === p.displayName) ? p.fullName : p.displayName
  }
  const where = (it: InboxItem) => SI.where(name(it.playerId) ?? '?', IB.dayHole(snapshot.rounds.find((r) => r.id === it.roundId)?.number ?? null, it.hole))
  const value = (v: HoleValue) => IB.scoreValue(v.strokes, v.putts, v.pickedUp)
  // A few rows against the day's scores: read on each render, like the engine's own flags.
  const rows = items.map((it) => {
    const s = snapshot.scores.find((x) => x.roundId === it.roundId && x.playerId === it.playerId && x.hole === it.hole)
    const current: HoleValue | null = s ? { strokes: s.strokes, putts: s.putts, pickedUp: s.pickedUp } : null
    const applied = appliedValue(it.fields, current)
    return { it, current, applied, sent: sentValue(it, current), matches: sameValue(applied, current) }
  })
  const matching = rows.filter((r) => r.matches).map((r) => r.it)

  /** One row: applied, the boards read the hole again. */
  async function resolve(item: InboxItem, action: 'apply' | 'dismiss', reason: string) {
    await resolveInboxItem(tournamentId, item.id, action, reason)
    if (action === 'apply') await reload()
    toast(action === 'apply' ? SI.applied : SI.dismissed)
  }
  /** Each matching row dismissed with one reason; the list is read once at the end. */
  async function dismissAll(list: InboxItem[], reason: string) {
    let done = 0
    let failed: unknown = null
    try {
      for (const it of list) {
        try {
          await resolveRejectedWrite(it.id, 'dismiss', reason)
          done++
        } catch (e) {
          failed ??= e
        }
      }
    } finally {
      await loadRejectedInbox(tournamentId)
    }
    if (failed) throw done ? new UserError(SI.partly(done, list.length)) : failed
    toast(SI.dismissed)
  }

  const askRow = ask && ask.kind !== 'matching' ? rows.find((r) => r.it.id === ask.item.id) : undefined
  return (
    <section className={a.section} aria-labelledby="server-inbox-title">
      <div className={a.sectionTitle}>
        <strong id="server-inbox-title">{SI.title}</strong>
        <span className={a.count}>{items.length}</span>
      </div>
      <span className={a.help}>{SI.hint}</span>
      {inbox.status === 'unavailable' && <span className={a.help}>{SI.unavailable}</span>}
      {inbox.status === 'error' && (
        <span className={a.warn} role="alert">
          {humanError(inbox.error)}{' '}
          <button className="btn btn--ghost btn--sm" type="button" onClick={() => void loadRejectedInbox(tournamentId)}>
            {SI.retry}
          </button>
        </span>
      )}
      {inbox.status === 'ready' && items.length === 0 && <span className={a.help}>{SI.none}</span>}
      {matching.length > 1 && (
        <button className="btn btn--secondary btn--sm" type="button" onClick={() => setAsk({ kind: 'matching', items: matching })}>
          {SI.dismissMatching(matching.length)}
        </button>
      )}
      {rows.length > 0 && (
        <div className={a.inbox} data-server-inbox>
          {rows.map(({ it, current, applied, sent, matches }) => (
            <div key={it.id} className={a.inboxRow}>
              <span className={a.inboxText}>
                <span className={a.inboxTitle}>
                  <span className={`${a.inboxMark} ${matches ? '' : a.inboxMarkHot}`} aria-hidden="true" />
                  {where(it)}
                </span>
                <span className={a.inboxSub}>
                  {sent ? SI.sent(value(sent), name(it.writerPlayerId)) : SI.sentUnreadable}{' '}
                  {it.reason === 'conflict' && it.server ? SI.conflictWith(IB.scoreValue((it.server.strokes as number | null) ?? null, (it.server.putts as number | null) ?? null, it.server.picked_up === true)) : (SI.why[it.reason] ?? SI.why.invalid)}
                </span>
                <span className={a.inboxSub}>
                  {current ? SI.now(value(current)) : SI.nowEmpty} {matches ? SI.matches : applied ? SI.wouldBe(value(applied)) : SI.cannotApply}
                </span>
              </span>
              <span className={a.inboxActions}>
                {applied && !matches && (
                  <button className="btn btn--secondary btn--sm" type="button" onClick={() => setAsk({ kind: 'apply', item: it })} aria-label={`${SI.apply}: ${where(it)}`}>
                    {SI.apply}
                  </button>
                )}
                <button className="btn btn--ghost btn--sm" type="button" onClick={() => setAsk({ kind: 'dismiss', item: it })} aria-label={`${SI.dismiss}: ${where(it)}`}>
                  {SI.dismiss}
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
      <ReasonSheet
        open={!!ask}
        title={ask?.kind === 'apply' ? SI.applyTitle : ask?.kind === 'dismiss' ? SI.dismissTitle : SI.dismissMatchingTitle}
        body={
          ask?.kind === 'matching'
            ? SI.dismissMatchingBody(ask.items.length)
            : ask && askRow
              ? ask.kind === 'apply' && askRow.applied
                ? SI.applyBody(where(ask.item), value(askRow.applied))
                : SI.dismissBody(where(ask.item))
              : undefined
        }
        confirmLabel={ask?.kind === 'apply' ? SI.apply : SI.dismiss}
        initialReason={ask?.kind === 'matching' || (askRow?.matches && ask?.kind === 'dismiss') ? SI.matchingReason : ''}
        onConfirm={async (reason) => {
          if (!ask) return
          if (ask.kind === 'matching') await dismissAll(ask.items, reason)
          else await resolve(ask.item, ask.kind, reason)
        }}
        onClose={() => setAsk(null)}
      />
    </section>
  )
}
