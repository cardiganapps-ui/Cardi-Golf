/**
 * `/p/:handle/vs`: you against a friend or a tournament mate. The record on
 * net and gross over every complete round you both played, and, between
 * friends, the rivalry: strokes that slide after each shared round (the
 * loser receives one more), replayed from scratch whenever a score changes.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { t } from '../../i18n/es-MX'
import { Avatar, Segmented, Spinner, toast } from '../../components/ui'
import { EmptyState, Stepper } from '../../components/primitives'
import { ConfirmSheet } from '../../components/ConfirmSheet'
import { IconChevronLeft } from '../../components/icons'
import { profileCard, useMyProfile, type ProfileCard } from '../../data/profiles'
import { h2hRecord, headToHead, proposedStrokes, rivalryEnd, rivalryPropose, rivalryRespond, type HeadToHead, type H2HRound } from '../../data/social'
import { useRequireAccount } from './useRequireAccount'
import styles from './Profile.module.css'
import { humanError } from '../../lib/humanError'

const S = t.social
const dayMonth = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const when = (d: string | null) => (d ? dayMonth.format(new Date(`${d.slice(0, 10)}T12:00:00Z`)) : null)
function resultOf(r: H2HRound, basis: 'net' | 'gross') {
  const mine = basis === 'net' ? r.myNet : r.myGross
  const theirs = basis === 'net' ? r.theirNet : r.theirGross
  return mine == null || theirs == null ? null : mine < theirs ? 'won' : mine > theirs ? 'lost' : 'tie'
}

export interface VersusFixture {
  me: { displayName: string; avatarUrl: string | null }
  them: ProfileCard
  h2h: HeadToHead
}

export function VersusScreen({ fixture }: { fixture?: VersusFixture }) {
  const { handle = '' } = useParams()
  const ok = useRequireAccount(`/p/${handle}/vs`, !!fixture)
  const { profile, load: loadProfile } = useMyProfile()
  const [them, setThem] = useState<ProfileCard | null | undefined>(fixture?.them)
  const [h2h, setH2h] = useState<HeadToHead | null | undefined>(fixture?.h2h)
  const [basis, setBasis] = useState<'net' | 'gross'>('net')
  const [busy, setBusy] = useState(false)
  const [ending, setEnding] = useState(false)
  const [strokes, setStrokes] = useState(0)
  const [side, setSide] = useState<'receive' | 'give'>('receive')

  const load = useCallback(async () => {
    if (fixture) return
    const [c, h] = await Promise.all([profileCard(handle), headToHead(handle)])
    setThem(c)
    setH2h(h)
  }, [fixture, handle])
  useEffect(() => {
    if (!ok || fixture) return
    if (!profile) void loadProfile()
    load().catch((e) => toast(humanError(e)))
  }, [ok, fixture, profile, loadProfile, load])
  // Start the proposal from the index difference.
  useEffect(() => {
    const s = proposedStrokes(h2h?.suggestion ?? null)
    setStrokes(Math.abs(s))
    setSide(s < 0 ? 'give' : 'receive')
  }, [h2h?.suggestion])

  const me = fixture?.me ?? (profile ? { displayName: profile.displayName, avatarUrl: profile.avatarUrl } : null)
  const record = useMemo(() => (h2h ? h2hRecord(h2h.rounds, basis) : null), [h2h, basis])

  async function run(fn: () => Promise<unknown>, done?: string) {
    if (fixture) return
    setBusy(true)
    try {
      await fn()
      if (done) toast(done)
      await load()
    } catch (e) {
      toast(humanError(e))
    } finally {
      setBusy(false)
      setEnding(false)
    }
  }

  if (!ok || them === undefined || h2h === undefined) return <Spinner />
  if (!them || !h2h || them.isMe) return <EmptyState title={S.notFound} body={t.profile.notFoundHint} />

  const first = them.displayName.split(/\s+/)[0] ?? them.displayName
  const riv = h2h.rivalry
  const open = riv && riv.status !== 'ended' ? riv : null
  const signed = side === 'receive' ? strokes : -strokes

  return (
    <div className={styles.screen}>
      <div className={styles.topBar}>
        <Link to={`/p/${them.handle}`} className={styles.iconBtn} aria-label={t.common.back}>
          <IconChevronLeft />
        </Link>
        <h1 className={styles.title}>{S.versus}</h1>
        <span className={styles.iconSpacer} />
      </div>

      <div className={styles.versus}>
        <span className={styles.versusSide}>
          <Avatar name={me?.displayName ?? '?'} url={me?.avatarUrl} size="lg" />
          <span className={styles.rowTitle}>{S.you}</span>
        </span>
        <span className={styles.versusVs}>{S.versusJoin}</span>
        <Link to={`/p/${them.handle}`} className={`${styles.versusSide} ${styles.heroLink}`}>
          <Avatar name={them.displayName} url={them.avatarUrl} size="lg" />
          <span className={styles.rowTitle}>{first}</span>
        </Link>
      </div>

      {/* The rivalry: the figure is the strokes I receive now. */}
      <section className={styles.section}>
        <span className="label">{S.rivalry}</span>
        {open?.status === 'active' ? (
          <>
            <div className={styles.stat}>
              <div className={styles.statText}>
                <span className={styles.rowTitle}>{S.strokesMine(open.myStrokes, first)}</span>
                {open.startedAt && <span className={styles.help}>{S.since(when(open.startedAt) ?? '')}</span>}
              </div>
              <span className={styles.statFigure}>{S.strokesFigure(open.myStrokes)}</span>
            </div>
            {open.history.length === 0 ? (
              <p className={styles.help}>{S.noRivalryRounds}</p>
            ) : (
              <div className={styles.rows}>
                {open.history.map((r) => (
                  <div key={r.roundId} className={`${styles.row} ${r.result === 'won' ? styles.rowUsed : ''}`}>
                    <span className={styles.rowText}>
                      <span className={styles.rowTitle}>{S.result[r.result]}</span>
                      <span className={styles.rowSub}>{[when(r.playedOn), S.resultLine(r.myAgs, r.theirAgs, r.before)].filter(Boolean).join(', ')}</span>
                    </span>
                    <span className={styles.rowFig}>{S.strokesFigure(r.after)}</span>
                  </div>
                ))}
              </div>
            )}
            <button type="button" className={`btn btn--ghost btn--sm ${styles.start}`} disabled={busy} onClick={() => setEnding(true)}>
              {S.endRivalry}
            </button>
          </>
        ) : open?.status === 'pending' && open.iProposed ? (
          <div className={styles.ask}>
            <span>{S.waiting(first)}</span>
            <div className={styles.askActions}>
              <button className="btn btn--ghost btn--sm" type="button" disabled={busy} onClick={() => void run(() => rivalryEnd(open.id))}>
                {S.cancel}
              </button>
            </div>
          </div>
        ) : open?.status === 'pending' ? (
          <div className={styles.ask}>
            <span>{S.theyPropose(first, S.strokesMine(open.startStrokes, first).toLowerCase())}</span>
            <div className={styles.askActions}>
              <button className="btn btn--primary btn--sm" type="button" disabled={busy} onClick={() => void run(() => rivalryRespond(open.id, true))}>
                {S.acceptRivalry}
              </button>
              <button className="btn btn--ghost btn--sm" type="button" disabled={busy} onClick={() => void run(() => rivalryRespond(open.id, false))}>
                {S.decline}
              </button>
            </div>
          </div>
        ) : h2h.friends ? (
          <div className="stack">
            <p className={styles.help}>{S.rivalryHint}</p>
            <div className={styles.proposeRow}>
              <Segmented
                value={side}
                label={S.startStrokes}
                options={[
                  { value: 'receive', label: S.receive },
                  { value: 'give', label: S.give },
                ]}
                onChange={setSide}
              />
              <Stepper value={strokes} min={0} max={18} label={S.startStrokes} onChange={setStrokes} />
            </div>
            <p className={styles.help}>{[S.strokesMine(signed, first), S.suggest(h2h.suggestion)].join('. ')}</p>
            <button className={`btn btn--primary ${styles.start}`} type="button" disabled={busy} onClick={() => void run(() => rivalryPropose(them.handle, signed), S.proposed(first))}>
              {S.propose}
            </button>
          </div>
        ) : (
          <p className={styles.help}>{S.rivalryFriendsOnly}</p>
        )}
      </section>

      {/* The record over every shared complete round. */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <span className="label">{S.sharedRounds}</span>
          <Segmented
            value={basis}
            options={[
              { value: 'net', label: S.net },
              { value: 'gross', label: S.gross },
            ]}
            onChange={setBasis}
          />
        </div>
        {h2h.rounds.length === 0 ? (
          <p className={styles.help}>{S.noShared}</p>
        ) : (
          <>
            {record && (
              <div className={styles.strip}>
                <span className={styles.stripItem}>
                  <span className={styles.stripFig}>{record.won}</span>
                  <span className={styles.stripLabel}>{S.recordShort.won}</span>
                </span>
                <span className={styles.stripItem}>
                  <span className={styles.stripFig}>{record.lost}</span>
                  <span className={styles.stripLabel}>{S.recordShort.lost}</span>
                </span>
                <span className={styles.stripItem}>
                  <span className={styles.stripFig}>{record.tied}</span>
                  <span className={styles.stripLabel}>{S.recordShort.tied}</span>
                </span>
              </div>
            )}
            <p className={styles.help}>{S.recordHow}</p>
            <div className={styles.rows}>
              {h2h.rounds.map((r) => {
                const res = resultOf(r, basis)
                return (
                  <Link key={r.roundId} to={`/t/${r.slug}`} className={styles.row}>
                    <span className={styles.rowText}>
                      <span className={styles.rowTitle}>{r.course ?? r.tournament}</span>
                      <span className={styles.rowSub}>
                        {[when(r.playedOn), basis === 'net' ? S.roundVs('net', r.myNet, r.theirNet) : S.roundVs('gross', r.myGross, r.theirGross), r.practice ? t.profile.practice : null].filter(Boolean).join(', ')}
                      </span>
                    </span>
                    {res && <span className={styles.rowEnd}>{S.result[res]}</span>}
                  </Link>
                )
              })}
            </div>
          </>
        )}
      </section>

      <ConfirmSheet open={ending} title={S.endRivalry} body={S.endConfirm} danger busy={busy} confirmLabel={S.endRivalry} onConfirm={() => open && void run(() => rivalryEnd(open.id))} onClose={() => setEnding(false)} />
    </div>
  )
}
