/**
 * Modo TV (§9.9, §10): full-screen deep-teal boards, huge type. On Calcutta
 * night (status `auction`) it shows the auction board; otherwise it rotates
 * Individual → pairs → snake holders → Calcutta values every ~12 s.
 */
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { t } from '../../i18n/es-MX'
import { Avatar } from '../../components/ui'
import { useTournament } from '../../data/tournamentStore'
import { formatMoney } from '../../lib/money'
import { Wave } from '../../components/Wave'
import { useTournamentCtx } from './TournamentGate'
import { FeedTicker } from './FeedTicker'
import { useActiveRound } from './useMyGroup'
import styles from './TvScreen.module.css'
import { IconSnake } from '../../components/icons'

type Board = 'individual' | 'pairs' | 'snake' | 'auction' | 'feed'

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
    if (state.feed.length > 0) b.push('feed')
    return b
  }, [state.modules, state.feed.length])
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    if (isAuctionNight) return
    const timer = setInterval(() => setIdx((i) => i + 1), 12000)
    return () => clearInterval(timer)
  }, [isAuctionNight])
  const board = boards[idx % boards.length] ?? 'individual'
  const accent = snapshot.tournament.accentColor ?? undefined

  return (
    <div className={styles.tv} style={accent ? ({ '--accent': accent } as React.CSSProperties) : undefined}>
      <header className={styles.header}>
        {snapshot.tournament.logoUrl && <img src={snapshot.tournament.logoUrl} alt="" className={styles.logo} />}
        <div className="grow">
          <h1 className={styles.title}>{snapshot.tournament.name}</h1>
          <span className={styles.sub}>{isAuctionNight ? settings.modules.auction.label : round ? `${t.round.day(round.number)} · ${t.roundStatus[round.status]}` : t.status[snapshot.tournament.status]}</span>
        </div>
        <Link to={`/t/${slug}`} className={styles.exit}>
          {t.tv.exit}
        </Link>
      </header>
      <Wave className={styles.wave} />

      <AnimatePresence mode="wait">
        {isAuctionNight && state.modules.auction ? (
          <motion.section key="auction-live" className={styles.board} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <AuctionBoard />
          </motion.section>
        ) : (
          <motion.section key={board} className={styles.board} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.4 }}>
            {board === 'individual' && state.modules.individual && (
              <>
                <h2 className={styles.boardTitle}>{settings.modules.individual.label}</h2>
                <div className={styles.rows}>
                  {state.modules.individual.rows.slice(0, 12).map((r) => {
                    const pr = round ? state.core.rounds[round.id]?.[r.playerId] : undefined
                    return (
                      <div key={r.playerId} className={styles.row}>
                        <span className={`num ${styles.pos}`}>{r.label}</span>
                        <Avatar name={name(r.playerId)} url={byId.get(r.playerId)?.avatarUrl} honoree={byId.get(r.playerId)?.isHonoree} />
                        <span className={styles.name}>
                          <span>
                            {name(r.playerId)}
                            {byId.get(r.playerId)?.tier && <span className="tierBadge">{byId.get(r.playerId)!.tier}</span>}
                          </span>
                        </span>
                        <span className={`num ${styles.small}`}>{pr ? `${t.round.thru(pr.thru)} · ${pr.points}` : ''}</span>
                        <span className={`num ${styles.big}`}>{r.total}</span>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
            {board === 'pairs' && state.modules.pairs && (
              <>
                <h2 className={styles.boardTitle}>{settings.modules.pairs.label}</h2>
                <div className={styles.rows}>
                  {state.modules.pairs.rows.map((r) => (
                    <div key={r.pairId} className={styles.row}>
                      <span className={`num ${styles.pos}`}>{r.label}</span>
                      <span className={styles.name}>
                        {r.name}
                        <span className={styles.small}>
                          {name(r.playerIds[0])} & {name(r.playerIds[1])}
                        </span>
                      </span>
                      <span className={`num ${styles.small}`}>{r.perRound.join(' + ')}</span>
                      <span className={`num ${styles.big}`}>{r.total}</span>
                    </div>
                  ))}
                </div>
              </>
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
                          {t.card.group} {g.groupNumber} · {formatMoney(g.pot)}
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
              <>
                <h2 className={styles.boardTitle}>
                  {settings.modules.auction.label} · {formatMoney(state.modules.auction.pot)}
                </h2>
                <div className={styles.rows}>
                  {state.modules.auction.portfolios.map((pf) => (
                    <div key={pf.ownerId} className={styles.row}>
                      <Avatar name={name(pf.ownerId)} url={byId.get(pf.ownerId)?.avatarUrl} />
                      <span className={styles.name}>
                        {name(pf.ownerId)}
                        <span className={styles.small}>{pf.holdings.map((h) => name(h.playerId)).join(' · ')}</span>
                      </span>
                      <span className={`num ${styles.small}`}>{formatMoney(pf.invested)}</span>
                      <span className={`num ${styles.big}`}>{formatMoney(pf.value)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  )
}

function AuctionBoard() {
  const data = useTournament((s) => s.data)!
  const { snapshot, state, settings } = data
  const auction = state.modules.auction!
  const byId = new Map(snapshot.players.map((p) => [p.id, p]))
  const name = (id: string) => byId.get(id)?.displayName ?? '?'
  const open = auction.lots.find((l) => l.status === 'open')
  const next = auction.lots.find((l) => l.status === 'pending')
  const lot = open ?? next
  const player = lot ? byId.get(lot.playerId) : undefined
  const bid = open?.currentBid?.amount ?? settings.auction.openingBid
  const bidder = open?.currentBid?.bidderId ?? open?.playerId
  const ph = lot ? state.core.rounds[state.core.roundIds[0] ?? '']?.[lot.playerId]?.playingHcp : undefined
  const pair = lot ? snapshot.pairs.find((p) => p.player1Id === lot.playerId || p.player2Id === lot.playerId) : undefined

  return (
    <div className={styles.auction}>
      <div className={styles.lot}>
        {player ? (
          <>
            <Avatar name={player.displayName} url={player.avatarUrl} size="lg" honoree={player.isHonoree} />
            <span className={styles.lotNum}>{lot ? t.auction.lot(lot.lotNumber) : ''}</span>
            <h2 className={styles.lotName}>{player.fullName}</h2>
            <span className={styles.lotMeta}>
              {player.tier && <span className="tierBadge">{player.tier}</span>} {ph != null ? `${t.live.playingHcp} ${ph}` : `${t.live.hcp} ${player.baseHcp}`}
              {pair ? ` · ${t.auction.pair}: ${pair.name ?? name(pair.player1Id === player.id ? pair.player2Id : pair.player1Id)}` : ''}
            </span>
            {player.formGuide && <p className={styles.form}>{player.formGuide}</p>}
            {open && (
              <motion.div key={`${bid}-${bidder}`} className={styles.bid} initial={{ scale: 0.85, opacity: 0.4 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 14 }}>
                <span className={`num ${styles.bidAmount}`}>{formatMoney(bid)}</span>
                <span className={styles.bidder}>{bidder === open.playerId ? t.auction.self : name(bidder ?? '')}</span>
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
          <motion.span key={auction.pot} className={`num ${styles.pot}`} initial={{ scale: 1.15 }} animate={{ scale: 1 }}>
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
          {auction.lots
            .filter((l) => l.status === 'sold')
            .slice(-8)
            .map((l) => (
              <span key={l.lotId} className={styles.soldRow}>
                <span>
                  {name(l.playerId)} <span className="muted">{l.ownerId === l.playerId ? t.auction.self : name(l.ownerId ?? '')}</span>
                </span>
                <span className="num">{formatMoney(l.price)}</span>
              </span>
            ))}
        </div>
      </div>
    </div>
  )
}
