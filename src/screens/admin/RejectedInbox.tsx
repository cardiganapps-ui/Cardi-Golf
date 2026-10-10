/**
 * «Pendientes de revisar» (REL-08): the holes the server refused and kept
 * for the Comité (save_hole, 0026) that a person typed, or that only the
 * Tarjeta's untouched par was sent for (rejected_inbox, 0028: never a
 * conflict, which the phone asks about, nor a default over a score that
 * stands). Each row says whose hole, what the phone sent and from whose
 * phone, why the server did not take it, what the card holds on the server
 * now and what applying it would leave. «Aplicar» and «Descartar» both ask
 * for a reason (resolve_rejected_write, 0028); «Aplicar» sends the hole as
 * the row showed it, and a hole that changed since is refused and read
 * again. A row the card already matches (the phone sent it again once the
 * day reopened, the Comité typed it in) only needs dismissing, and those go
 * together in one tap: the ones that match when the reason is confirmed,
 * each with the hole it matched, so the server refuses one whose hole
 * changed since (and the boards are read again).
 *
 * Online only, like every Comité correction. Read when the screen opens and
 * after each answer; another Comité phone's answers show on the next read.
 */
import { useEffect, useState } from 'react'
import { t } from '../../i18n/es-MX'
import { toast } from '../../components/ui'
import { ReasonSheet } from '../../components/ReasonSheet'
import { appliedValue, dismissInboxItems, isStaleHole, loadRejectedInbox, resolveInboxItem, sameValue, seenHole, sentValue, useRejectedInbox, type HoleValue, type InboxItem } from '../../data/rejectedInbox'
import { useTournament } from '../../data/tournamentStore'
import { humanError, UserError } from '../../lib/humanError'
import { useTournamentCtx } from '../tournament/TournamentGate'
import a from './Admin.module.css'

const SI = t.admin.serverInbox
const IB = t.admin.inbox

type Ask = { kind: 'apply' | 'dismiss'; item: InboxItem } | { kind: 'matching' } | null

export function RejectedInbox() {
  const { tournamentId } = useTournamentCtx()
  const data = useTournament((s) => s.data)!
  const reload = useTournament((s) => s.reload)
  const inbox = useRejectedInbox()
  const [ask, setAsk] = useState<Ask>(null)
  // The players and days as the screens show them; the hole as the server holds it (`base`, without this phone's own
  // pending writes), which is what an apply is checked against.
  const { snapshot, base } = data

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
    const s = base.scores.find((x) => x.roundId === it.roundId && x.playerId === it.playerId && x.hole === it.hole)
    const current: HoleValue | null = s ? { strokes: s.strokes, putts: s.putts, pickedUp: s.pickedUp } : null
    const applied = appliedValue(it.fields, current)
    return { it, current, applied, sent: sentValue(it, current), matches: sameValue(applied, current) }
  })
  const matching = rows.filter((r) => r.matches)

  /**
   * One row. Applied, the boards read the hole again; a hole that changed
   * since the row showed it is refused, and the boards are read again too, so
   * the row shows what stands now before anyone applies it.
   */
  async function resolve(item: InboxItem, action: 'apply' | 'dismiss', reason: string, current: HoleValue | null) {
    try {
      await resolveInboxItem(tournamentId, item.id, action, reason, action === 'apply' ? seenHole(current) : undefined)
    } catch (e) {
      if (isStaleHole(e)) await reload()
      throw e
    }
    if (action === 'apply') await reload()
    toast(action === 'apply' ? SI.applied : SI.dismissed)
  }
  /**
   * The rows that match the card when the reason is confirmed, each dismissed with it and the hole it matched; one
   * another phone resolved is done; one whose hole changed since is refused, and the boards are read again.
   */
  async function dismissAll(list: typeof matching, reason: string) {
    const { done, failed } = await dismissInboxItems(
      tournamentId,
      list.map((x) => ({ id: x.it.id, seen: seenHole(x.current) })),
      reason,
    )
    if (failed && isStaleHole(failed)) await reload()
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
        <button className="btn btn--secondary btn--sm" type="button" onClick={() => setAsk({ kind: 'matching' })}>
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
                  {sent ? SI.sent(value(sent), name(it.writerPlayerId)) : SI.sentUnreadable} {SI.why[it.reason] ?? SI.why.invalid}
                  {it.auto ? ` ${SI.untouched}` : ''}
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
            ? SI.dismissMatchingBody(matching.length)
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
          // The rows as they are now: one another phone resolved since the sheet opened is not sent again.
          if (ask.kind === 'matching') await dismissAll(matching, reason)
          else await resolve(ask.item, ask.kind, reason, askRow?.current ?? null)
        }}
        onClose={() => setAsk(null)}
      />
    </section>
  )
}
