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
import { tournamentBase, useShowMoney } from './tournamentView'
import { useSavedWhen } from './boardsAge'
import { useConnection } from './connection'
import { useOwnConnectionStatus } from '../../components/OfflineBanner'
import { FeedTicker } from './FeedTicker'
import { useActiveRound } from './useMyGroup'
import styles from './TvScreen.module.css'
import { IconRings, IconSnake } from '../../components/icons'
import { nearestAccent } from '../../design/accents'
import { DRAW_STEP, DUR_BOARD, HAT_STEP, easeBoard, easeFast, still, timer } from '../../design/motion'
import { CountUp } from '../../components/CountUp'
import { dayFigureText } from '../../lib/figureText'
import { Plate } from '../../components/primitives'
import { TournamentLogo } from '../../components/TournamentLogo'
import { drawOrder } from '../../lib/pairing'

type Board = 'individual' | 'pairs' | 'snake' | 'auction' | 'feed' | `game:${string}`
/** Each board's time on screen. */
const ROTATE_MS = 12_000
/** A leaderboard that re-sorts this close to its turn's end stays this long more, so the room sees the lead change (MOT-08). */
const HOLD_MS = 2_000

export function TvScreen() {
  const data = useTournament((s) => s.data)!
  const ctx = useTournamentCtx()
  const base = tournamentBase(ctx)
  // On a link to watch «Sin dinero» (STRAT-05) the snake shows no pot, and Calcutta night says what it needs.
  const showMoney = useShowMoney()
  const round = useActiveRound()
  const { snapshot, state, settings } = data
  const byId = new Map(snapshot.players.map((p) => [p.id, p]))
  const name = (id: string) => byId.get(id)?.displayName ?? '?'
  const isAuctionNight = snapshot.tournament.status === 'auction'
  /** Calcutta night on a link without money: the auction is all prices, so the board says the link it needs. */
  const auctionNeedsMoney = isAuctionNight && !showMoney
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
  /**
   * The room can stop the rotation to read a board (A11Y-21, WCAG 2.2.2):
   * «Pausar», Space on a keyboard or a clicker, and ← → to step the boards.
   * Unattended, the TV goes on rotating; going on gives the board its time again.
   */
  const [paused, setPaused] = useState(false)
  /** When the board on screen leaves: ROTATE_MS after it came, later when the leaderboard re-sorts just before (MOT-08). */
  const [stay, setStay] = useState<{ from: number; until: number } | null>(null)
  useEffect(() => {
    if (isAuctionNight) return
    const now = Date.now()
    setStay({ from: now, until: now + ROTATE_MS })
  }, [idx, isAuctionNight])
  useEffect(() => {
    if (isAuctionNight || !stay || paused) return
    const timer = setTimeout(() => setIdx((i) => i + 1), Math.max(0, stay.until - Date.now()))
    return () => clearTimeout(timer)
  }, [stay, isAuctionNight, paused])
  /** Going on gives the board its time again in the same update: a timer never sees the deadline the pause outlived. */
  const togglePause = () => {
    if (paused) {
      const now = Date.now()
      setStay({ from: now, until: now + ROTATE_MS })
    }
    setPaused(!paused)
  }
  const toggleRef = useRef(togglePause)
  toggleRef.current = togglePause
  useEffect(() => {
    if (isAuctionNight) return
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      // A focused control keeps its own keys: Space on «Pausar» presses it once, not twice.
      if ((e.key === ' ' || e.key === 'Enter') && e.target instanceof Element && e.target.closest('button, a, input, select, textarea')) return
      if (e.key === ' ') toggleRef.current()
      else if (e.key === 'ArrowRight' || e.key === 'PageDown') setIdx((i) => i + 1)
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') setIdx((i) => Math.max(0, i - 1))
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isAuctionNight])
  const board = boards[idx % boards.length] ?? 'individual'
  const next = boards.length > 1 ? boards[(idx + 1) % boards.length] : undefined
  // A board longer than the screen shows its next page on each pass of the rotation.
  const turn = Math.floor(idx / boards.length)
  const indivRows = state.modules.individual?.rows ?? []
  // A lead change the room should see: the rows slide, and the board stays at least HOLD_MS after it.
  const order = indivRows.map((r) => r.playerId).join(',')
  const lastOrder = useRef(order)
  useEffect(() => {
    if (order === lastOrder.current) return
    lastOrder.current = order
    if (board !== 'individual' || isAuctionNight) return
    setStay((st) => (st && st.until - Date.now() < HOLD_MS ? { ...st, until: Date.now() + HOLD_MS } : st))
  }, [order, board, isAuctionNight])
  const reduce = useReducedMotion()
  // From the couch a re-sort has to be seen moving (MOT-11): the board's time, not the phone's.
  const rowMotion = reduce ? {} : { layout: 'position' as const, transition: easeBoard }
  const boardLabel = (b: Board): string =>
    b === 'individual' ? settings.modules.individual.label
    : b === 'pairs' ? settings.modules.pairs.label
    : b === 'snake' ? settings.modules.snake.label
    : b === 'auction' ? settings.modules.auction.label
    : b === 'feed' ? t.feed.title
    : (state.games[b.slice(5)]?.config.label ?? '')
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
  // The connection, said once, in the room's own type (REL-21): the app's banner, a phone's strip («se guarda en
  // el teléfono»), stays away from the TV.
  const connection = useConnection()
  useOwnConnectionStatus()
  const updatedWhen = useSavedWhen(useTournament((s) => s.updatedAt))

  return (
    <div className={styles.tv} style={{ '--event-accent': nearestAccent(accent).hex } as React.CSSProperties}>
      <header className={styles.header}>
        {snapshot.tournament.logoUrl && <TournamentLogo url={snapshot.tournament.logoUrl} className={styles.logo} />}
        <div className="grow">
          <h1 className={styles.title}>{snapshot.tournament.name}</h1>
          <span className={styles.sub}>
            {isAuctionNight ? settings.modules.auction.label : round ? `${t.round.day(round.number)}, ${t.roundStatus[round.status].toLowerCase()}` : t.status[snapshot.tournament.status]}
            {/* The room can't see a phone's header: with no signal the TV says so, and while the boards may be behind, how old they are (REL-10). */}
            {connection?.kind === 'offline' && `. ${t.sync.offlineShort}`}
            {connection?.mayBeOld && updatedWhen && `. ${t.sync.boardsAge(updatedWhen)}`}
          </span>
        </div>
        <Link to={base} className={styles.exit}>
          {t.tv.exit}
        </Link>
      </header>

      {/* The next board comes in while the last one leaves: the screen is never blank between boards (MOT-01). */}
      <AnimatePresence mode="popLayout" initial={false}>
        {auctionNeedsMoney ? (
          <motion.section key="auction-no-money" className={styles.board} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={easeBoard}>
            {/* The pairs draw carries no money: once it is made, the room sees it here too. */}
            {settings.modules.pairs.enabled && snapshot.pairs.length > 0 ? <DrawBoard revealKey={null} /> : <NeedsMoneyBoard />}
          </motion.section>
        ) : isAuctionNight && state.modules.auction ? (
          <motion.section key="auction-live" className={styles.board} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={easeBoard}>
            <AuctionBoard />
          </motion.section>
        ) : (
          <motion.section key={board} className={styles.board} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={easeBoard}>
            {board === 'individual' && state.modules.individual && (
              <PagedRows
                title={settings.modules.individual.label}
                turn={turn}
                items={indivRows}
                columns={{ className: styles.rowIndiv, labels: [round ? t.tv.thru : '', round ? t.tv.today : '', t.tv.total] }}
                render={(r) => {
                    // A team's row is the team; the figures are the format's own (STRAT-03): today's and the total, never Stableford points under strokes.
                    const team = r.entrant.isTeam
                    const members = r.entrant.playerIds
                    const thru = round ? Math.min(...members.map((id) => state.core.rounds[round.id]?.[id]?.thru ?? 0)) : 0
                    const roundIdx = round ? state.core.roundIds.indexOf(round.id) : -1
                    const today = roundIdx >= 0 ? r.perRound[roundIdx] : undefined
                    const label = team ? r.entrant.name : name(r.playerId)
                    // What the room reads from the couch, each under its label (VIS-05): who, where on the course, the day
                    // in the format's own figure («ganó 4&3» under match play, STRAT-03), the total. The tier is the phone's.
                    return (
                      <motion.div key={r.playerId} className={`${styles.row} ${styles.rowIndiv} ${r.position === 1 ? styles.leader : ''}`} data-player={r.playerId} {...rowMotion}>
                        <span className={styles.pos}>{r.label}</span>
                        <Avatar name={label} url={team ? undefined : byId.get(r.playerId)?.avatarUrl} honoree={members.some((id) => byId.get(id)?.isHonoree)} />
                        <span className={styles.name}>
                          <span>{label}</span>
                        </span>
                        <span className={styles.mid} aria-label={round && thru > 0 ? `${t.live.thru} ${t.round.thru(thru, round.holes)}` : undefined}>
                          {round && thru > 0 ? t.round.thru(thru, round.holes) : ''}
                        </span>
                        <span className={`${styles.mid} ${styles.day}`}>{round && thru > 0 && today && !today.empty ? dayFigureText(today) : ''}</span>
                        {/* The total on the board's plate, the leader's in yellow: the one figure per row the room looks for. */}
                        <span className={styles.big}>
                          <Plate value={r.figure.text} leader={r.position === 1} />
                        </span>
                      </motion.div>
                    )
                }}
              />
            )}
            {board === 'pairs' && state.modules.pairs && (
              <PagedRows
                title={settings.modules.pairs.label}
                turn={turn}
                items={state.modules.pairs.rows}
                columns={{ className: styles.rowPair, labels: [t.tv.days, t.tv.total] }}
                render={(r) => (
                  // Its own grid: position, the pair with both partners in full, days, total (VIS-04).
                  <motion.div key={r.pairId} className={`${styles.row} ${styles.rowPair} ${r.position === 1 ? styles.leader : ''}`} {...rowMotion}>
                    <span className={styles.pos}>{r.label}</span>
                    <span className={styles.name}>
                      <span>{r.name}</span>
                      <span className={`${styles.small} ${styles.sub}`}>{t.common.andList([name(r.playerIds[0]), name(r.playerIds[1])])}</span>
                    </span>
                    <span className={`${styles.small} ${styles.figure}`}>{t.common.plusList(r.perRound)}</span>
                    <span className={styles.big}>
                      <Plate value={String(r.total)} leader={r.position === 1} />
                    </span>
                  </motion.div>
                )}
              />
            )}
            {board === 'snake' && state.modules.snake && (
              <PagedRows
                title={settings.modules.snake.label}
                turn={turn}
                items={state.modules.snake.groups.filter((g) => !round || g.roundId === round.id)}
                render={(g) => (
                  // One row per group, read from the couch: the four names, the one carrying the snake on the board-yellow plate, the pot (VIS-05).
                  <div key={g.groupId} className={`${styles.row} ${styles.rowSnake}`}>
                    <span className={styles.snakeGroupNum}>
                      {t.card.group} {g.groupNumber}
                    </span>
                    <span className={styles.snakePlayers}>
                      {g.playerIds.map((pid) => (
                        <span key={pid} className={`${styles.snakePlayer} ${g.holderId === pid ? styles.holder : ''}`}>
                          {name(pid)}
                          {g.holderId === pid && (
                            <span className={styles.snakeIcon} role="img" aria-label={t.games.holder}>
                              <IconSnake />
                            </span>
                          )}
                        </span>
                      ))}
                    </span>
                    <span className={styles.big}>{showMoney ? formatMoney(g.pot) : ''}</span>
                  </div>
                )}
              />
            )}
            {board === 'feed' && (
              <>
                <h2 className={styles.boardTitle}>{t.feed.title}</h2>
                {/* Seven at the room's size fill the board (VIS-05). */}
                <FeedTicker limit={7} big />
              </>
            )}
            {board === 'auction' && state.modules.auction && (
              <PagedRows
                title={`${settings.modules.auction.label}, ${formatMoney(state.modules.auction.pot)}`}
                turn={turn}
                items={state.modules.auction.portfolios}
                columns={{ className: styles.rowOwner, labels: [t.tv.invested, t.tv.worth] }}
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
                      <span className={styles.small}>{showMoney && r.money ? formatMoney(r.money) : ''}</span>
                      <span className={styles.big}>{r.figure ? <Plate value={r.figure} leader={r.pos === '1'} /> : null}</span>
                    </div>
                )}
              />
            )}
          </motion.section>
        )}
      </AnimatePresence>
      {/* How long this board stays and which comes next: the room knows a change is a rotation, not a glitch (MOT-08). */}
      {!isAuctionNight && next && stay && (
        <footer className={styles.rotation}>
          {paused ? (
            <span className={styles.rotationPaused}>{t.tv.paused}</span>
          ) : (
            <span className={styles.rotationRule} aria-hidden="true">
              <motion.span
                key={`${idx}:${stay.until}`}
                className={styles.rotationFill}
                initial={{ scaleX: reduce ? 1 : Math.min(1, (Date.now() - stay.from) / (stay.until - stay.from)) }}
                animate={{ scaleX: 1 }}
                transition={reduce ? still : timer((stay.until - Date.now()) / 1000)}
              />
            </span>
          )}
          <span className={styles.rotationNext}>{t.tv.next(boardLabel(next))}</span>
          <button type="button" className={styles.rotationButton} onClick={togglePause}>
            {paused ? t.tv.resume : t.tv.pause}
          </button>
        </footer>
      )}
    </div>
  )
}

/**
 * A board's rows, as many as the screen holds, paged across rotations (VIS-03).
 * Rows are sized for the room (vh), so how many fit depends on the screen, the
 * header and long names: it is measured, never assumed. A board longer than the
 * screen says which rows it shows, «1–9 de 12», and the next pass shows the rest.
 *
 * `columns` labels the last columns of the rows' grid (VIS-05). The title takes
 * the columns before them on the same line, as a printed table does, so the
 * labels cost the rows no line of their own. `follow` shows the last page: a
 * reveal adding rows one at a time keeps its newest row on screen.
 */
function PagedRows<T>({ title, turn, items, render, columns, follow }: { title: string; turn: number; items: T[]; render: (item: T, i: number) => ReactNode; columns?: { className: string | undefined; labels: string[] }; follow?: boolean }) {
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
    // A new size is the board's, which the screen gives it, never the rows' own box: that one shrinks when the title
    // takes its range («1–9 de 12») and wraps, as it does on a phone held upright, so measuring again for it put the
    // range back and took it away on every render, until React stopped the page.
    const frame = el.parentElement ?? el
    const key = `${frame.clientWidth}x${frame.clientHeight}:${items.length}`
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
      // For one size the fit only tightens, as the tallest row only grows: more rows would drop the range, and the
      // room it frees would ask for fewer again.
      if (fit === null || n < fit) setFit(n)
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
  const page = follow ? pages - 1 : turn % pages
  const shown = items.slice(page * per, page * per + per)
  const heading = (
    <h2 className={styles.boardTitle} style={columns ? { gridColumnStart: 1, gridColumnEnd: -(columns.labels.length + 1) } : undefined}>
      {title}
      {pages > 1 && <span className={styles.range}> {t.tv.range(page * per + 1, page * per + shown.length, items.length)}</span>}
    </h2>
  )
  return (
    <>
      {columns ? (
        <div className={`${styles.colHead} ${columns.className}`}>
          {heading}
          {columns.labels.map((label, i) => (
            <span key={i} aria-hidden="true">
              {label}
            </span>
          ))}
        </div>
      ) : (
        heading
      )}
      <div ref={box} className={styles.rows}>
        {shown.map((item, i) => render(item, page * per + i))}
      </div>
    </>
  )
}

/**
 * Calcutta night on a link to watch «Sin dinero» (STRAT-05): the auction is
 * prices and bids, which that link never carries, so the room reads what the
 * TV needs instead of a board that shows nothing.
 */
function NeedsMoneyBoard() {
  const label = useTournament((s) => s.data?.settings.modules.auction.label ?? '')
  return (
    <div className={styles.hat}>
      <h2 className={styles.boardTitle}>{label || t.tv.auction}</h2>
      <p className={styles.needsMoney}>{t.spectator.tvNeedsMoney}</p>
      <p className={styles.sub}>{t.spectator.tvNeedsMoneyHint}</p>
    </div>
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
  /*
   * The night's other two moments, on the TV for the room (MOT-05, UX-17): the
   * order out of the hat until the first lot opens, and the pairs draw once the
   * last sale has had its stamp. A draw or an order made while the TV is on is
   * revealed; one that was there when it opened shows at once.
   */
  const lotKey = auction.lots.map((l) => l.lotId).join(',')
  const pairKey = snapshot.pairs.map((p) => p.id).join(',')
  const openedWith = useRef({ lots: lotKey, pairs: pairKey })
  if (auction.lots.length > 0 && auction.lots.every((l) => l.status === 'pending')) {
    return <HatBoard revealKey={lotKey !== openedWith.current.lots ? lotKey : null} />
  }
  if (!lot && settings.modules.pairs.enabled && snapshot.pairs.length > 0) {
    return <DrawBoard revealKey={pairKey !== openedWith.current.pairs ? pairKey : null} />
  }

  return (
    <div className={styles.auction}>
      <div className={styles.lot}>
        {player ? (
          <>
            <Avatar name={player.displayName} url={player.avatarUrl} size="lg" honoree={player.isHonoree} />
            <span className={styles.lotNum}>{lot ? t.auction.lot(lot.lotNumber) : ''}</span>
            <h2 className={styles.lotName}>{player.fullName}</h2>
            <span className={styles.lotMeta}>
              {player.tier && <span className={styles.lotTier}>{t.tv.tier(player.tier)}</span>}
              {(() => {
                const hcp = ph != null ? `${t.live.playingHcp} ${ph}` : `${t.live.hcp} ${handicapText(player.baseHcp)}`
                // After the tier the line goes on in lower case: «Categoría C, hándicap de juego 10».
                return player.tier ? `, ${hcp.charAt(0).toLowerCase()}${hcp.slice(1)}` : hcp
              })()}
              {pair ? `, ${t.auction.pair.toLowerCase()}: ${pair.name ?? name(pair.player1Id === player.id ? pair.player2Id : pair.player1Id)}` : ''}
            </span>
            {player.formGuide && !sold && <p className={styles.form}>{player.formGuide}</p>}
            {open && (
              // Each bid pulses for the board's time: a 150 ms pulse was over before the room looked up (MOT-05).
              <motion.div key={`${bid}-${bidder}`} className={styles.bid} initial={{ scale: 0.85, opacity: 0.4 }} animate={{ scale: 1, opacity: 1 }} transition={easeBoard}>
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
          {/* Each sale counts the pot up to its new figure (MOT-05); it opens on the figure, never from $0. */}
          <span className={styles.pot}>
            <CountUp value={auction.pot} format={formatMoney} seconds={DUR_BOARD} from={auction.pot} />
          </span>
        </div>
        <div className={styles.stake}>
          <span className={styles.small}>{t.auction.atStake}</span>
          {/* The engine's pesos, adding up to the pot: never pot × share worked out here (MONEY-16). */}
          {auction.stakes.map(({ slot: s, pesos }, i) => (
            <span key={i} className={styles.stakeRow}>
              <span>{t.rules.slotName(s.slot, 'place' in s ? s.place : undefined, 'tier' in s ? s.tier : undefined, settings.labels.lastPlace)}</span>
              <span className="num">{formatMoney(pesos)}</span>
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

/**
 * The lot order out of the hat (MOT-05), before the first lot opens: the room
 * sees who comes up when. Drawn while the TV is on, the lots come out one at a
 * time; the console's «Abrir lote» takes the board to the first lot.
 */
function HatBoard({ revealKey }: { revealKey: string | null }) {
  const data = useTournament((s) => s.data)!
  const { snapshot, state, settings } = data
  const byId = new Map(snapshot.players.map((p) => [p.id, p]))
  const lots = [...state.modules.auction!.lots].sort((a, b) => a.lotNumber - b.lotNumber)
  const reduce = useReducedMotion()
  const reveal = !!revealKey && !reduce
  // Each lot drops in from a little above, in the screen's own units.
  const drop = Math.round(window.innerHeight * 0.03)
  // Down the columns, in order: one up to seven lots, two up to fourteen, three after.
  const cols = Math.min(3, Math.max(1, Math.ceil(lots.length / 7)))
  return (
    <div className={styles.hat}>
      <h2 className={styles.boardTitle}>
        {settings.modules.auction.label}, {t.tv.hatTitle}
      </h2>
      <ol className={styles.hatList} key={revealKey ?? 'shown'} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${Math.ceil(Math.min(lots.length, HAT_MAX) / cols)}, auto)` }}>
        {lots.slice(0, HAT_MAX).map((l, i) => (
          <motion.li key={l.lotId} className={styles.hatItem} initial={reveal ? { opacity: 0, y: -drop } : false} animate={{ opacity: 1, y: 0 }} transition={{ ...easeBoard, delay: reveal ? i * HAT_STEP : 0 }}>
            <span className={styles.hatNum}>{l.lotNumber}</span>
            <span className={styles.hatName}>{byId.get(l.playerId)?.displayName ?? '?'}</span>
          </motion.li>
        ))}
      </ol>
      {lots.length > HAT_MAX && <p className={styles.sub}>{t.tv.hatMore(lots.length - HAT_MAX)}</p>}
    </div>
  )
}
/** Three columns of seven: as many as the board holds at the name's size. */
const HAT_MAX = 21

/**
 * The pairs draw (UX-17, MOT-05): the dinner's second moment, for the room, not
 * only the phone of whoever runs it. The phone saves the draw as it is drawn;
 * the TV reveals it a pair at a time, the two faces sliding together under the
 * rings, and the names the pairs give themselves land as they are typed.
 */
function DrawBoard({ revealKey }: { revealKey: string | null }) {
  const data = useTournament((s) => s.data)!
  const { snapshot, settings } = data
  const byId = new Map(snapshot.players.map((p) => [p.id, p]))
  const name = (id: string) => byId.get(id)?.displayName ?? '?'
  const honoree = snapshot.players.find((p) => p.isHonoree)
  const pairs = drawOrder(snapshot.pairs, settings.modules.pairs.pairing)
  const reduce = useReducedMotion()
  const reveal = !!revealKey && !reduce
  // The two faces start apart by a share of the screen's width and meet.
  const slide = Math.round(window.innerWidth * 0.04)
  const [shown, setShown] = useState(() => (reveal ? 1 : Infinity))
  // A new draw comes out a pair every DRAW_STEP; the names typed afterwards change nothing here.
  useEffect(() => {
    if (!reveal) {
      setShown(Infinity)
      return
    }
    // The first pair at once, then one every DRAW_STEP.
    setShown(1)
    const timers = pairs.slice(1).map((_, i) => setTimeout(() => setShown(i + 2), DRAW_STEP * 1000 * (i + 1)))
    return () => timers.forEach(clearTimeout)
  }, [revealKey, reveal]) // eslint-disable-line react-hooks/exhaustive-deps -- a new draw restarts the reveal, a name doesn't
  // Once every pair is out, a draw longer than the screen shows its pages in turn.
  const [turn, setTurn] = useState(0)
  const done = shown >= pairs.length
  useEffect(() => {
    if (!done) return
    const id = setInterval(() => setTurn((n) => n + 1), ROTATE_MS)
    return () => clearInterval(id)
  }, [done])
  const kindText = (kind: string | null) => {
    const rule = settings.modules.pairs.pairing.find(([a, b]) => kind === `${a}${b}`)
    return rule ? t.tv.drawKind(rule[0], rule[1]) : null
  }
  return (
    <PagedRows
      title={t.tv.drawTitle(settings.modules.pairs.label)}
      turn={turn}
      follow={!done}
      items={pairs.slice(0, shown)}
      render={(p) => {
        const both = t.common.andList([name(p.player1Id), name(p.player2Id)])
        // Named, the pair's second line is who they are; unnamed, their categories. The honoree's pick says so on either.
        const sub = [p.name ? both : kindText(p.kind), p.pickedByHonoree && honoree ? t.tv.drawPicked(honoree.displayName) : null].filter(Boolean).join(', ')
        return (
          <div key={p.id} className={`${styles.row} ${styles.rowDraw}`} data-pair={p.id}>
            <motion.span initial={reveal ? { x: -slide, opacity: 0 } : false} animate={{ x: 0, opacity: 1 }} transition={easeBoard}>
              <Avatar name={name(p.player1Id)} url={byId.get(p.player1Id)?.avatarUrl} honoree={byId.get(p.player1Id)?.isHonoree} />
            </motion.span>
            <motion.span className={styles.drawRings} aria-hidden="true" initial={reveal ? { scale: 0.3, rotate: -45, opacity: 0 } : false} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ ...easeBoard, delay: reveal ? DUR_BOARD * 0.6 : 0 }}>
              <IconRings />
            </motion.span>
            <motion.span initial={reveal ? { x: slide, opacity: 0 } : false} animate={{ x: 0, opacity: 1 }} transition={easeBoard}>
              <Avatar name={name(p.player2Id)} url={byId.get(p.player2Id)?.avatarUrl} honoree={byId.get(p.player2Id)?.isHonoree} />
            </motion.span>
            <motion.span className={styles.name} initial={reveal ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ ...easeBoard, delay: reveal ? DUR_BOARD * 0.8 : 0 }}>
              <span>{p.name ?? both}</span>
              {sub && <span className={`${styles.small} ${styles.sub}`}>{sub}</span>}
            </motion.span>
          </div>
        )
      }}
    />
  )
}
