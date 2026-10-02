/**
 * Modo TV (§9.9, §10): full-screen deep-teal boards, huge type. On Calcutta
 * night (status `auction`) it shows the auction board; otherwise it rotates
 * Individual → pairs → snake holders → Calcutta values every ~12 s.
 */
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { handicapText, t } from '../../i18n/es-MX'
import { Avatar } from '../../components/ui'
import { useTournament } from '../../data/tournamentStore'
import { formatMoney } from '../../lib/money'
import { useTournamentCtx } from './TournamentGate'
import { FeedTicker } from './FeedTicker'
import { useActiveRound } from './useMyGroup'
import styles from './TvScreen.module.css'
import { IconSnake } from '../../components/icons'
import { nearestAccent } from '../../design/accents'
import { easeFast, easeSlow } from '../../design/motion'

type Board = 'individual' | 'pairs' | 'snake' | 'auction' | 'feed' | `game:${string}`

export function TvScreen() {
  const data = useTournament((s) => s.data)!
  const { slug } = useTournamentCtx()
  const round = useActiveRound()
  const { snapshot, state, settings } = data
  const byId = new Map(snapshot.players.map((p) => [p.id, p]))
  const name = (id: string) => byId.get(id)?.displayName ?? '?'
  const isAuctionNight = snapshot.tournament.status === 'auction'
  const boards = useMemo(() => {
    const b: Board[] = ['individual']
    if (state.modules.pairs) b.push('pairs')
    if (state.modules.snake) b.push('snake')
    if (state.modules.auction && state.modules.auction.soldCount > 0) b.push('auction')
    for (const [id, g] of Object.entries(state.games)) if (g.board.sections[0]?.rows.length) b.push(`game:${id}`)
    if (state.feed.length > 0) b.push('feed')
    return b
  }, [state.modules, state.games, state.feed.length])
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    if (isAuctionNight) return
    const timer = setInterval(() => setIdx((i) => i + 1), 12000)
    return () => clearInterval(timer)
  }, [isAuctionNight])
  const board = boards[idx % boards.length] ?? 'individual'
  // A board longer than the screen shows its next page on each pass of the rotation.
  const turn = Math.floor(idx / boards.length)
  const indivRows = state.modules.individual?.rows ?? []
  // Keep the screen awake while the board is up (re-request after a tab switch).
  useEffect(() => {
    let lock: { release(): Promise<void> } | null = null
    const request = async () => {
      try {
        lock = (await (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock?.request('screen')) ?? null
      } catch {
        lock = null
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void request()
    }
    void request()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release()
    }
  }, [])
  const accent = snapshot.tournament.accentColor ?? undefined

  return (
    <div className={styles.tv} style={{ '--event-accent': nearestAccent(accent).hex } as React.CSSProperties}>
      <header className={styles.header}>
        {snapshot.tournament.logoUrl && <img src={snapshot.tournament.logoUrl} alt="" className={styles.logo} />}
        <div className="grow">
          <h1 className={styles.title}>{snapshot.tournament.name}</h1>
          <span className={styles.sub}>{isAuctionNight ? settings.modules.auction.label : round ? `${t.round.day(round.number)}, ${t.roundStatus[round.status].toLowerCase()}` : t.status[snapshot.tournament.status]}</span>
        </div>
        <Link to={`/t/${slug}`} className={styles.exit}>
          {t.tv.exit}
        </Link>
      </header>

      <AnimatePresence mode="wait">
        {isAuctionNight && state.modules.auction ? (
          <motion.section key="auction-live" className={styles.board} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <AuctionBoard />
          </motion.section>
        ) : (
          <motion.section key={board} className={styles.board} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={easeSlow}>
            {board === 'individual' && state.modules.individual && (
              <PagedRows
                title={settings.modules.individual.label}
                turn={turn}
                items={indivRows}
                render={(r) => {
                    // A team's row is the team; the figures are the format's own (STRAT-03): today's and the total, never Stableford points under strokes.
                    const team = r.entrant.isTeam
                    const members = r.entrant.playerIds
                    const thru = round ? Math.min(...members.map((id) => state.core.rounds[round.id]?.[id]?.thru ?? 0)) : 0
                    const roundIdx = round ? state.core.roundIds.indexOf(round.id) : -1
                    const today = roundIdx >= 0 ? r.perRound[roundIdx] : undefined
                    const label = team ? r.entrant.name : name(r.playerId)
                    return (
                      <div key={r.playerId} className={`${styles.row} ${r.position === 1 ? styles.leader : ''}`} data-player={r.playerId}>
                        <span className={styles.pos}>{r.label}</span>
                        <Avatar name={label} url={team ? undefined : byId.get(r.playerId)?.avatarUrl} honoree={members.some((id) => byId.get(id)?.isHonoree)} />
                        <span className={styles.name}>
                          <span>
                            {label}
                            {!team && byId.get(r.playerId)?.tier && <span className="tierBadge">{byId.get(r.playerId)!.tier}</span>}
                          </span>
                        </span>
                        <span className={styles.small}>{round && thru > 0 ? [`${t.live.thru} ${t.round.thru(thru, round.holes)}`, today && !today.empty ? today.text : null].filter(Boolean).join(', ') : ''}</span>
                        <span className={styles.big}>{r.figure.text}</span>
                      </div>
                    )
                }}
              />
            )}
            {board === 'pairs' && state.modules.pairs && (
              <PagedRows
                title={settings.modules.pairs.label}
                turn={turn}
                items={state.modules.pairs.rows}
                render={(r) => (
                  // Its own grid: position, the pair with both partners in full, days, total (VIS-04).
                  <div key={r.pairId} className={`${styles.row} ${styles.rowPair} ${r.position === 1 ? styles.leader : ''}`}>
                    <span className={styles.pos}>{r.label}</span>
                    <span className={styles.name}>
                      <span>{r.name}</span>
                      <span className={`${styles.small} ${styles.sub}`}>{t.common.andList([name(r.playerIds[0]), name(r.playerIds[1])])}</span>
                    </span>
                    <span className={styles.small}>{t.common.plusList(r.perRound)}</span>
                    <span className={styles.big}>{r.total}</span>
                  </div>
                )}
              />
            )}
            {board === 'snake' && state.modules.snake && (
              <>
                <h2 className={styles.boardTitle}>{settings.modules.snake.label}</h2>
                <div className={styles.snakeGrid}>
                  {state.modules.snake.groups
                    .filter((g) => !round || g.roundId === round.id)
                    .map((g) => (
                      <div key={g.groupId} className={styles.snakeGroup}>
                        <span className={styles.small}>
                          {t.card.group} {g.groupNumber}, {formatMoney(g.pot)}
                        </span>
                        <div className={styles.snakePlayers}>
                          {g.playerIds.map((pid) => (
                            <span key={pid} className={`${styles.snakePlayer} ${g.holderId === pid ? styles.holder : ''}`}>
                              <Avatar name={name(pid)} url={byId.get(pid)?.avatarUrl} size="lg" />
                              <span>{name(pid)}</span>
                              {g.holderId === pid && (
                                <span className={styles.snakeIcon}>
                                  <IconSnake />
                                </span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              </>
            )}
            {board === 'feed' && (
              <>
                <h2 className={styles.boardTitle}>{t.feed.title}</h2>
                <FeedTicker limit={9} big />
              </>
            )}
            {board === 'auction' && state.modules.auction && (
              <PagedRows
                title={`${settings.modules.auction.label}, ${formatMoney(state.modules.auction.pot)}`}
                turn={turn}
                items={state.modules.auction.portfolios}
                head={
                  <div className={`${styles.colHead} ${styles.rowOwner}`} aria-hidden="true">
                    <span />
                    <span />
                    <span>{t.tv.invested}</span>
                    <span>{t.tv.worth}</span>
                  </div>
                }
                render={(pf) => (
                  // Its own grid: owner, holdings in full, what he put in, what it is worth now (VIS-04).
                  <div key={pf.ownerId} className={`${styles.row} ${styles.rowOwner}`}>
                    <Avatar name={name(pf.ownerId)} url={byId.get(pf.ownerId)?.avatarUrl} />
                    <span className={styles.name}>
                      <span>{name(pf.ownerId)}</span>
                      <span className={`${styles.small} ${styles.sub}`}>{t.common.andList(pf.holdings.map((h) => name(h.playerId)))}</span>
                    </span>
                    <span className={`${styles.small} ${styles.figure}`} aria-label={`${t.tv.invested} ${formatMoney(pf.invested)}`}>
                      {formatMoney(pf.invested)}
                    </span>
                    <span className={styles.big} aria-label={`${t.tv.worth} ${formatMoney(pf.value)}`}>
                      {formatMoney(pf.value)}
                    </span>
                  </div>
                )}
              />
            )}
            {board.startsWith('game:') && state.games[board.slice(5)] && (
              <PagedRows
                title={state.games[board.slice(5)]!.config.label}
                turn={turn}
                items={state.games[board.slice(5)]!.board.sections[0]!.rows}
                render={(r, i) => (
                    <div key={i} className={`${styles.row} ${r.pos === '1' ? styles.leader : ''}`}>
                      <span className={styles.pos}>{r.pos ?? ''}</span>
                      {r.playerIds.length === 1 ? <Avatar name={name(r.playerIds[0]!)} url={byId.get(r.playerIds[0]!)?.avatarUrl} /> : <span />}
                      <span className={styles.name}>
                        <span>{r.title ?? t.common.andList(r.playerIds.map(name))}</span>
                        {(r.label || r.sub || r.title) && <span className={`${styles.small} ${styles.sub}`}>{[r.title ? t.common.andList(r.playerIds.map(name)) : null, r.label, r.sub].filter(Boolean).join(', ')}</span>}
                      </span>
                      <span className={styles.small}>{r.money ? formatMoney(r.money) : ''}</span>
                      <span className={styles.big}>{r.figure}</span>
                    </div>
                )}
              />
            )}
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * A board's rows, as many as the screen holds, paged across rotations (VIS-03).
 * Rows are sized for the room (vh), so how many fit depends on the screen, the
 * header and long names: it is measured, never assumed. A board longer than the
 * screen says which rows it shows, «1–9 de 12», and the next pass shows the rest.
 */
function PagedRows<T>({ title, turn, items, render, head }: { title: string; turn: number; items: T[]; render: (item: T, i: number) => ReactNode; head?: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  // Until measured, everything is laid out once (before paint) so the tallest row can be measured.
  const [fit, setFit] = useState<number | null>(null)
  /** The tallest row seen so far: a taller one on a later page (a long name that wraps) tightens the fit. */
  const tallest = useRef(0)
  /** What the last measure was for: a new screen size or a different field measures again from scratch. */
  const measuredFor = useRef('')
  const [resized, remeasure] = useState(0)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const key = `${el.clientWidth}x${el.clientHeight}:${items.length}`
    if (key !== measuredFor.current) {
      measuredFor.current = key
      tallest.current = 0
      if (fit !== null) {
        setFit(null)
        return
      }
    }
    const rows = Array.from(el.children) as HTMLElement[]
    tallest.current = Math.max(tallest.current, ...rows.map((r) => r.getBoundingClientRect().height))
    if (tallest.current > 0) {
      const n = Math.max(1, Math.floor(el.clientHeight / tallest.current))
      if (n !== fit) setFit(n)
    }
    // On every page shown (turn), every fit, and every resize.
  }, [items, turn, fit, resized])
  // A resize renders again, and the measure above sees the new size.
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => remeasure((n) => n + 1))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const per = Math.max(1, Math.min(fit ?? items.length, items.length))
  const pages = Math.max(1, Math.ceil(items.length / per))
  const page = turn % pages
  const shown = items.slice(page * per, page * per + per)
  return (
    <>
      <h2 className={styles.boardTitle}>
        {title}
        {pages > 1 && <span className={styles.range}> {t.tv.range(page * per + 1, page * per + shown.length, items.length)}</span>}
      </h2>
      {head}
      <div ref={box} className={styles.rows}>
        {shown.map((item, i) => render(item, page * per + i))}
      </div>
    </>
  )
}

/** How long a sale stays on the lot card before the next player comes up, unless the auctioneer opens a lot first. */
const SOLD_HOLD_MS = 4000

function AuctionBoard() {
  const data = useTournament((s) => s.data)!
  const { snapshot, state, settings } = data
  const auction = state.modules.auction!
  const byId = new Map(snapshot.players.map((p) => [p.id, p]))
  const name = (id: string) => byId.get(id)?.displayName ?? '?'
  const open = auction.lots.find((l) => l.status === 'open')
  const next = auction.lots.find((l) => l.status === 'pending')
  const reduceMotion = useReducedMotion()
  /*
   * The hammer (MOT-04): the lot that was open is now sold. It stays on the card
   * with «Vendido a …» for a few seconds, instead of the next player replacing it
   * in the same frame. Opening the next lot ends it at once.
   */
  const [justSold, setJustSold] = useState<string | null>(null)
  const lastOpen = useRef<string | null>(null)
  const soldKey = auction.lots
    .filter((l) => l.status === 'sold')
    .map((l) => l.lotId)
    .join(',')
  useEffect(() => {
    const was = lastOpen.current
    lastOpen.current = open?.lotId ?? null
    if (was && was !== open?.lotId && auction.lots.find((l) => l.lotId === was)?.status === 'sold') {
      // Several updates in one reload (a dropped connection): the stamp is for the latest sale, not the first one seen.
      const latest = auction.lots.filter((l) => l.status === 'sold').sort((a, b) => (soldAt.get(b.lotId) ?? '').localeCompare(soldAt.get(a.lotId) ?? '') || b.lotNumber - a.lotNumber)[0]
      setJustSold(latest?.lotId ?? was)
    }
    if (open) setJustSold(null)
  }, [open?.lotId, soldKey]) // eslint-disable-line react-hooks/exhaustive-deps -- runs on a lot opening or selling, not on every bid
  useEffect(() => {
    if (!justSold) return
    const timer = setTimeout(() => setJustSold(null), SOLD_HOLD_MS)
    return () => clearTimeout(timer)
  }, [justSold])
  const sold = open ? undefined : auction.lots.find((l) => l.lotId === justSold && l.status === 'sold')
  const lot = open ?? sold ?? next
  const player = lot ? byId.get(lot.playerId) : undefined
  const bid = open?.currentBid?.amount ?? settings.auction.openingBid
  const bidder = open?.currentBid?.bidderId ?? open?.playerId
  const ph = lot ? state.core.rounds[state.core.roundIds[0] ?? '']?.[lot.playerId]?.playingHcp : undefined
  const pair = lot ? snapshot.pairs.find((p) => p.player1Id === lot.playerId || p.player2Id === lot.playerId) : undefined
  const soldAt = new Map(snapshot.calcuttaLots.map((l) => [l.id, l.soldAt ?? '']))

  return (
    <div className={styles.auction}>
      <div className={styles.lot}>
        {player ? (
          <>
            <Avatar name={player.displayName} url={player.avatarUrl} size="lg" honoree={player.isHonoree} />
            <span className={styles.lotNum}>{lot ? t.auction.lot(lot.lotNumber) : ''}</span>
            <h2 className={styles.lotName}>{player.fullName}</h2>
            <span className={styles.lotMeta}>
              {player.tier && <span className="tierBadge">{player.tier}</span>} {ph != null ? `${t.live.playingHcp} ${ph}` : `${t.live.hcp} ${handicapText(player.baseHcp)}`}
              {pair ? `, ${t.auction.pair.toLowerCase()}: ${pair.name ?? name(pair.player1Id === player.id ? pair.player2Id : pair.player1Id)}` : ''}
            </span>
            {player.formGuide && !sold && <p className={styles.form}>{player.formGuide}</p>}
            {open && (
              <motion.div key={`${bid}-${bidder}`} className={styles.bid} initial={{ scale: 0.85, opacity: 0.4 }} animate={{ scale: 1, opacity: 1 }} transition={easeFast}>
                <span className={styles.bidAmount}>{formatMoney(bid)}</span>
                <span className={styles.bidder}>{bidder === open.playerId ? t.auction.self : name(bidder ?? '')}</span>
              </motion.div>
            )}
            {sold && (
              // One stamp, like the Tarjeta's «Firmada»: the gavel's moment.
              <motion.div
                key={`sold-${sold.lotId}`}
                className={styles.soldStamp}
                role="status"
                initial={reduceMotion ? { opacity: 0 } : { scale: 1.6, rotate: -8, opacity: 0 }}
                animate={{ scale: 1, rotate: -3, opacity: 1 }}
                transition={easeFast}
              >
                <span className={styles.bidAmount}>{formatMoney(sold.price)}</span>
                <span className={styles.bidder}>{sold.ownerId === sold.playerId ? t.auction.stampSelf : t.auction.stampTo(name(sold.ownerId ?? ''))}</span>
              </motion.div>
            )}
          </>
        ) : (
          <h2 className={styles.lotName}>{t.auction.allSold}</h2>
        )}
      </div>
      <div className={styles.side}>
        <div className={styles.potBox}>
          <span className={styles.small}>{t.auction.pot}</span>
          <motion.span key={auction.pot} className={styles.pot} initial={{ scale: 1.15 }} animate={{ scale: 1 }}>
            {formatMoney(auction.pot)}
          </motion.span>
        </div>
        <div className={styles.stake}>
          <span className={styles.small}>{t.auction.atStake}</span>
          {settings.auction.payout.map((s, i) => (
            <span key={i} className={styles.stakeRow}>
              <span>{t.rules.slotName(s.slot, 'place' in s ? s.place : undefined, 'tier' in s ? s.tier : undefined, settings.labels.lastPlace)}</span>
              <span className="num">{formatMoney(Math.floor(auction.pot * s.share))}</span>
            </span>
          ))}
        </div>
        <div className={styles.sold}>
          <span className={styles.small}>{t.auction.soldList}</span>
          {/* Newest first: the sale just made is the one the room looks for; the oldest fall off the bottom (MOT-04). */}
          {auction.lots
            .filter((l) => l.status === 'sold')
            .sort((a, b) => (soldAt.get(b.lotId) ?? '').localeCompare(soldAt.get(a.lotId) ?? '') || b.lotNumber - a.lotNumber)
            .map((l) => (
              <span key={l.lotId} className={styles.soldRow} data-sold-at={soldAt.get(l.lotId) ?? ''}>
                <span>
                  {name(l.playerId)} <span className={styles.small}>{l.ownerId === l.playerId ? t.auction.self : name(l.ownerId ?? '')}</span>
                </span>
                <span className="num">{formatMoney(l.price)}</span>
              </span>
            ))}
        </div>
      </div>
    </div>
  )
}
