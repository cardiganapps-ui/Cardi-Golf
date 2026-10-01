/**
 * `/p/:handle`: a player's profile. The photo and the name, the Polo index
 * as the hero figure (and how it came out), a stat strip, who they are,
 * their tournaments with the finish, their rounds, and, for the owner only,
 * their money. Strangers with an account see the card; people who shared a
 * tournament see the rest.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { t } from '../../i18n/es-MX'
import { Wordmark } from '../../components/Wordmark'
import { Avatar, CopyButton, ShareButton, Sheet, Spinner, toast } from '../../components/ui'
import { EmptyState, Money, ScorecardGrid } from '../../components/primitives'
import { ConfirmSheet } from '../../components/ConfirmSheet'
import { friendBlock, friendRemove, friendRequest, friendRespond, friendshipWith, type Friendship } from '../../data/social'
import { IconChevronRight, IconSettings } from '../../components/icons'
import { ensureSession, useAuth } from '../../data/auth'
import {
  formatIndex,
  indexBreakdown,
  myMoney,
  profileCard,
  profileRounds,
  profileTournaments,
  type MoneyLine,
  type ProfileCard,
  type ProfileTournament,
  type RoundResult,
} from '../../data/profiles'
import { PROFILE_FIXTURES } from '../../dev/profileFixtures'
import { BadgesSection, RecapButton, RecordsSection } from './Achievements'
import styles from './Profile.module.css'
import { humanError } from '../../lib/humanError'

const P = t.profile
const monthYear = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' })
const dayMonth = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const HISTORY_SHOWN = 8

/** A tournament's logo, or its initial in a ruled square when it has none. */
export function EventMark({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  return logoUrl ? (
    <img className={styles.logo} src={logoUrl} alt="" />
  ) : (
    <span className={styles.mono} aria-hidden="true">
      {name.trim().charAt(0).toUpperCase()}
    </span>
  )
}

const tenths = (v: number) => (v < 0 ? `−${Math.abs(v).toFixed(1)}` : v.toFixed(1))
const when = (r: RoundResult) => (r.playedOn ? dayMonth.format(new Date(`${r.playedOn}T12:00:00Z`)) : null)

export type FriendAction = 'add' | 'accept' | 'remove' | 'block'

/** What a visitor with an account can do: befriend, answer, unfriend, block. */
function FriendBar({ name, friendship, busy, onAction }: { name: string; friendship: Friendship; busy: boolean; onAction: (a: FriendAction) => void }) {
  const [confirm, setConfirm] = useState<'remove' | 'block' | null>(null)
  const S = t.social
  return (
    <>
      <div className={styles.actions}>
        {friendship === 'none' && (
          <button className="btn btn--primary" type="button" disabled={busy} onClick={() => onAction('add')}>
            {S.addFriend}
          </button>
        )}
        {friendship === 'incoming' && (
          <button className="btn btn--primary" type="button" disabled={busy} onClick={() => onAction('accept')}>
            {S.acceptFriend}
          </button>
        )}
        {friendship === 'outgoing' && (
          <>
            <button className="btn btn--secondary" type="button" disabled>
              {S.requested}
            </button>
            <button className="btn btn--ghost" type="button" disabled={busy} onClick={() => onAction('remove')}>
              {S.cancel}
            </button>
          </>
        )}
        {friendship === 'friends' && <span className={styles.friendTag}>{S.areFriends}</span>}
        {friendship === 'blocked' && (
          <button className="btn btn--secondary" type="button" disabled={busy} onClick={() => onAction('remove')}>
            {S.unblock}
          </button>
        )}
      </div>
      {friendship !== 'blocked' && (
        <div className={styles.quiet}>
          {friendship === 'friends' && (
            <button className="btn btn--ghost btn--sm" type="button" disabled={busy} onClick={() => setConfirm('remove')}>
              {S.removeFriend}
            </button>
          )}
          <button className="btn btn--ghost btn--sm" type="button" disabled={busy} onClick={() => setConfirm('block')}>
            {S.block}
          </button>
        </div>
      )}
      <ConfirmSheet
        open={!!confirm}
        title={confirm === 'block' ? S.block : S.removeFriend}
        body={confirm === 'block' ? S.blockConfirm(name) : S.removeConfirm(name)}
        danger
        busy={busy}
        confirmLabel={confirm === 'block' ? S.block : S.removeFriend}
        onConfirm={() => {
          if (confirm) onAction(confirm)
          setConfirm(null)
        }}
        onClose={() => setConfirm(null)}
      />
    </>
  )
}

export function ProfileView({
  card,
  tournaments,
  rounds,
  money,
  friendship,
  friendBusy = false,
  onFriend,
}: {
  card: ProfileCard
  tournaments?: ProfileTournament[]
  rounds?: RoundResult[]
  money?: MoneyLine[]
  /** Set when the visitor has an account and this is someone else. */
  friendship?: Friendship
  friendBusy?: boolean
  onFriend?: (a: FriendAction) => void
}) {
  const where = [card.homeClub, card.city].filter(Boolean).join(', ')
  const url = `${window.location.origin}/p/${card.handle}`
  const hasIndex = card.index != null
  const [howOpen, setHowOpen] = useState(false)
  const [round, setRound] = useState<RoundResult | null>(null)
  const [allRounds, setAllRounds] = useState(false)
  const breakdown = useMemo(() => (rounds ? indexBreakdown(rounds) : null), [rounds])
  const strip = useMemo(() => {
    if (!rounds?.length) return null
    const grosses = rounds.filter((r) => r.complete && r.holes === 18 && r.gross != null).map((r) => r.gross!)
    return { rounds: rounds.length, bestGross: grosses.length ? Math.min(...grosses) : null, birdies: rounds.reduce((s, r) => s + r.birdies + r.eagles, 0) }
  }, [rounds])
  const totals = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of money ?? []) m.set(l.currency, (m.get(l.currency) ?? 0) + l.net)
    return [...m.entries()]
  }, [money])

  return (
    <div className={styles.screen}>
      <div className={styles.topBar}>
        <Link to="/" className={styles.brand} aria-label={t.app.name}>
          <Wordmark />
        </Link>
        {card.isMe && (
          <Link to="/perfil/editar" className={styles.iconBtn} aria-label={P.edit}>
            <IconSettings />
          </Link>
        )}
      </div>

      <div className={styles.hero}>
        <Avatar name={card.displayName} url={card.avatarUrl} size="lg" />
        <div className={styles.heroText}>
          <h1 className={styles.name}>{card.displayName}</h1>
          <span className={styles.handle}>@{card.handle}</span>
          {where && <span className={styles.where}>{where}</span>}
        </div>
      </div>

      <div className={styles.stat}>
        <div className={styles.statText}>
          <span className="label">{card.indexSource === 'manual' ? P.indexManual : P.index}</span>
          <span className={styles.help}>{card.indexSource === 'manual' ? P.manualNote : hasIndex ? P.rounds(card.indexRounds) : P.noIndex}</span>
          {card.indexSource === 'polo' && breakdown && (
            <button type="button" className={`btn btn--ghost btn--sm ${styles.how}`} onClick={() => setHowOpen(true)}>
              {t.money.howCalculated}
            </button>
          )}
        </div>
        {hasIndex && <span className={styles.statFigure}>{formatIndex(card.index)}</span>}
      </div>
      {!hasIndex && card.indexSource === 'polo' && card.isMe && !breakdown?.considered.length && <p className={styles.help}>{P.noIndexHint}</p>}

      {strip && (
        <div className={styles.strip}>
          <span className={styles.stripItem}>
            <span className={styles.stripFig}>{strip.rounds}</span>
            <span className={styles.stripLabel}>{P.stats.rounds}</span>
          </span>
          <span className={styles.stripItem}>
            <span className={styles.stripFig}>{strip.bestGross ?? '—'}</span>
            <span className={styles.stripLabel}>{P.stats.bestGross}</span>
          </span>
          <span className={styles.stripItem}>
            <span className={styles.stripFig}>{strip.birdies}</span>
            <span className={styles.stripLabel}>{P.stats.birdies}</span>
          </span>
        </div>
      )}

      {card.bio && <p className={styles.bio}>{card.bio}</p>}

      {!card.isMe && friendship && onFriend && <FriendBar name={card.displayName} friendship={friendship} busy={friendBusy} onAction={onFriend} />}
      {!card.isMe && card.related && friendship !== 'blocked' && (
        <Link to={`/p/${card.handle}/vs`} className={`${styles.row} ${styles.rowLink}`}>
          <span className={styles.rowText}>
            <span className={styles.rowTitle}>{t.social.versus}</span>
            <span className={styles.rowSub}>{t.social.versusTitle(card.displayName.split(/\s+/)[0] ?? card.displayName)}</span>
          </span>
          <span className={styles.rowEnd}>
            <IconChevronRight size={20} />
          </span>
        </Link>
      )}

      {tournaments && (
        <section className={styles.section}>
          <span className="label">{P.tournaments}</span>
          {tournaments.length === 0 ? (
            <p className={styles.help}>{P.noTournaments}</p>
          ) : (
            <div className={styles.rows}>
              {tournaments.map((x) => (
                <Link key={x.playerId} to={`/t/${x.slug}`} className={styles.row}>
                  <EventMark name={x.name} logoUrl={x.logoUrl} />
                  <span className={styles.rowText}>
                    <span className={styles.rowTitle}>{x.name}</span>
                    <span className={styles.rowSub}>
                      {x.rankLabel ? P.finish(x.rankLabel, x.field) : t.status[x.status]}
                      {x.awards.length > 0 ? `, ${t.common.andList(x.awards.map(awardName))}` : ''}
                      {x.practice ? `, ${P.practice.toLowerCase()}` : ''}
                    </span>
                  </span>
                  <span className={styles.rowEnd}>
                    {x.points != null && <span className={styles.rowFig}>{x.points}</span>}
                    <IconChevronRight size={20} />
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {rounds && (
        <section className={styles.section}>
          <span className="label">{P.history}</span>
          {rounds.length === 0 ? (
            <p className={styles.help}>{P.noHistory}</p>
          ) : (
            <div className={styles.rows}>
              {(allRounds ? rounds : rounds.slice(0, HISTORY_SHOWN)).map((r) => (
                <button key={r.roundId} type="button" className={styles.row} onClick={() => setRound(r)}>
                  <span className={styles.rowText}>
                    <span className={styles.rowTitle}>{r.course ?? r.tournament}</span>
                    <span className={styles.rowSub}>
                      {[when(r), r.complete ? P.roundLine(r.gross, r.ags) : P.incomplete, r.practice ? P.practice : null].filter(Boolean).join(', ')}
                    </span>
                  </span>
                  <span className={styles.rowEnd}>{r.differential != null && <span className={styles.rowFig}>{tenths(r.differential)}</span>}</span>
                </button>
              ))}
            </div>
          )}
          {!allRounds && rounds.length > HISTORY_SHOWN && (
            <button type="button" className={`btn btn--ghost btn--sm ${styles.start}`} onClick={() => setAllRounds(true)}>
              {P.seeAll(rounds.length)}
            </button>
          )}
        </section>
      )}

      {rounds && tournaments && (
        <>
          <BadgesSection rounds={rounds} tournaments={tournaments} />
          <RecordsSection rounds={rounds} tournaments={tournaments} onRound={(id) => setRound(rounds.find((r) => r.roundId === id) ?? null)} />
        </>
      )}

      {card.isMe && money && (
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <span className="label">{P.money}</span>
            <span className={styles.help}>{P.moneyHint}</span>
          </div>
          {money.length === 0 ? (
            <p className={styles.help}>{P.noMoney}</p>
          ) : (
            <div className={styles.rows}>
              {totals.map(([cur, net]) => (
                <div key={cur} className={`${styles.row} ${styles.rowStrong}`}>
                  <span className={styles.rowText}>
                    <span className={styles.rowTitle}>{P.moneyTotal}</span>
                  </span>
                  <span className={styles.rowFig}>
                    <Money amount={net} signed />
                  </span>
                </div>
              ))}
              {money.map((m) => (
                <Link key={m.tournamentId} to={`/t/${m.slug}/dinero`} className={styles.row}>
                  <span className={styles.rowText}>
                    <span className={styles.rowTitle}>{m.name}</span>
                  </span>
                  <span className={styles.rowFig}>
                    <Money amount={m.net} signed />
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      <div className={styles.actions}>
        {card.isMe && (
          <>
            <Link className="btn btn--secondary" to="/perfil/editar">
              {P.edit}
            </Link>
            <Link className="btn btn--secondary" to="/amigos">
              {t.social.friends}
            </Link>
          </>
        )}
        {card.isMe && rounds && tournaments && <RecapButton name={card.displayName} handle={card.handle} rounds={rounds} tournaments={tournaments} />}
        <CopyButton text={url} label={P.copyLink} />
        <ShareButton text={P.shareText(card.displayName)} url={url} title={card.displayName} />
      </div>
      <p className={styles.foot}>{P.memberSince(monthYear.format(new Date(card.memberSince)))}</p>

      <Sheet open={howOpen} onClose={() => setHowOpen(false)} title={hasIndex ? P.indexTitle(formatIndex(card.index)) : P.index}>
        {breakdown && (
          <div className="stack">
            {breakdown.index10 == null ? (
              <p className={styles.help}>{P.indexNeeds}</p>
            ) : (
              <p>
                {P.indexRule(breakdown.considered.length, breakdown.count)}
                {breakdown.adjust10 !== 0 ? ` ${P.indexAdjust(tenths(breakdown.adjust10 / 10))}` : ''}
              </p>
            )}
            <p className={styles.help}>{P.indexHow}</p>
            <div className={styles.rows}>
              {breakdown.considered.map(({ round: r, used }) => (
                <div key={r.roundId} className={`${styles.row} ${used ? styles.rowUsed : ''}`}>
                  <span className={styles.rowText}>
                    <span className={styles.rowTitle}>{r.course ?? r.tournament}</span>
                    <span className={styles.rowSub}>{[when(r), used ? P.counts : null].filter(Boolean).join(', ')}</span>
                  </span>
                  <span className={styles.rowFig}>{tenths(r.differential!)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Sheet>

      <Sheet open={!!round} onClose={() => setRound(null)} title={round ? P.roundTitle(round.tournament, round.roundNumber) : undefined}>
        {round && (
          <div className="stack">
            <p className={styles.help}>{[round.course, P.roundFacts(round.tee, round.courseHcp), when(round)].filter(Boolean).join(', ')}</p>
            <ScorecardGrid
              holes={round.detail.map(([n, par, si, strokes, putts, pickedUp]) => ({ n, par, si, gross: strokes, putts, pickedUp }))}
              playerLabel={card.displayName}
              showPutts
            />
            <div className={styles.rows}>
              <div className={styles.row}>
                <span className={styles.rowText}>
                  <span className={styles.rowTitle}>{P.roundLine(round.gross, round.ags)}</span>
                  {round.rating != null && round.slope != null && <span className={styles.rowSub}>{`Rating ${round.rating}, slope ${round.slope}`}</span>}
                </span>
                {round.differential != null && (
                  <span className={styles.rowEnd}>
                    <span className={styles.help}>{P.differential}</span>
                    <span className={styles.rowFig}>{tenths(round.differential)}</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  )
}

/** `award:<id>` → the fun award's name; `prize:<label>` → the label as the tournament named it. */
function awardName(a: string): string {
  if (a.startsWith('award:')) {
    const id = a.slice(6) as keyof typeof t.stats.award
    return t.stats.award[id]?.name ?? id
  }
  return a.replace(/^prize:/, '')
}

export function ProfileScreen() {
  const { handle = '' } = useParams()
  // A fresh page per handle: nothing of the previous profile shows while the next loads.
  return <ProfilePage key={handle} handle={handle} />
}

function ProfilePage({ handle }: { handle: string }) {
  const { ready, user, isAnonymous } = useAuth()
  const [card, setCard] = useState<ProfileCard | null | undefined>(undefined)
  const [extra, setExtra] = useState<{ tournaments?: ProfileTournament[]; rounds?: RoundResult[]; money?: MoneyLine[] }>({})
  const [friendship, setFriendship] = useState<Friendship | undefined>(undefined)
  const [friendBusy, setFriendBusy] = useState(false)
  const [version, setVersion] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const account = !!user && !isAnonymous

  useEffect(() => {
    if (!ready) return
    let live = true
    void (async () => {
      try {
        await ensureSession()
        const [c, f] = await Promise.all([profileCard(handle), account ? friendshipWith(handle) : Promise.resolve(undefined)])
        if (!live) return
        setCard(c)
        setFriendship(c && !c.isMe ? f : undefined)
        setExtra({})
        // History and finishes: only for people who may see the full profile. Money: only the owner's own.
        if (c?.related) {
          const [tournaments, rounds, money] = await Promise.all([profileTournaments(handle), profileRounds(handle), c.isMe ? myMoney() : Promise.resolve(undefined)])
          if (live) setExtra({ tournaments, rounds, money })
        }
      } catch (e) {
        if (live) setError(humanError(e))
      }
    })()
    return () => {
      live = false
    }
  }, [ready, handle, user?.id, account, version])

  async function onFriend(a: FriendAction) {
    if (!card) return
    setFriendBusy(true)
    try {
      if (a === 'add') {
        const r = await friendRequest(handle)
        toast(r === 'accepted' ? t.social.nowFriends(card.displayName) : r === 'not_found' ? t.social.notFound : t.social.sent)
      } else if (a === 'accept') {
        await friendRespond(handle, true)
        toast(t.social.nowFriends(card.displayName))
      } else if (a === 'remove') await friendRemove(handle)
      else await friendBlock(handle)
      setVersion((v) => v + 1)
    } catch (e) {
      toast(humanError(e))
    } finally {
      setFriendBusy(false)
    }
  }

  if (error) return <EmptyState title={t.common.error} body={error} />
  if (card === undefined) return <Spinner />
  if (card === null) {
    const anonymous = !user || isAnonymous
    return (
      <div className={styles.screen}>
        <Link to="/" className={styles.brand}>
          <Wordmark />
        </Link>
        <EmptyState
          title={P.notFound}
          body={anonymous ? P.signInToSee : P.notFoundHint}
          action={
            anonymous ? (
              <Link className="btn btn--primary" to={`/entrar?next=${encodeURIComponent(`/p/${handle}`)}`}>
                {t.account.enterProfile}
              </Link>
            ) : undefined
          }
        />
      </div>
    )
  }
  return <ProfileView card={card} tournaments={extra.tournaments} rounds={extra.rounds} money={extra.money} friendship={friendship} friendBusy={friendBusy} onFriend={(a) => void onFriend(a)} />
}

/** `/p/_/:name` (design routes only): the profile on fixture data. */
export function ProfileFixture() {
  const { name = 'yo' } = useParams()
  const f = PROFILE_FIXTURES[name] ?? PROFILE_FIXTURES.yo!
  return <ProfileView card={f.card} tournaments={f.tournaments} rounds={f.rounds} money={f.money} />
}
