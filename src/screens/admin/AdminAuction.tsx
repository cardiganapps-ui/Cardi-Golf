/**
 * Auctioneer console (§10): draw the lot order, open lots, take bids by
 * avatar, undo, hammer, buyback, next. Everything is a row the engine
 * derives from, so the TV board and every phone follow in real time.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { t } from '../../i18n/es-MX'
import { Avatar, Field, Sheet, toast } from '../../components/ui'
import { EmptyState } from '../../components/primitives'
import { ConfirmSheet } from '../../components/ConfirmSheet'
import { createLots, deleteBid, placeBid, reopenLot, resetAuction, sellLot, setBuyback, setLotStatus, updateTournament } from '../../data/api'
import { useTournament } from '../../data/tournamentStore'
import { formatMoney } from '../../lib/money'
import { shuffle } from '../../lib/pairing'
import { useTournamentCtx } from '../tournament/TournamentGate'
import styles from './AdminAuction.module.css'
import a from './Admin.module.css'
import { IconArrowDown, IconArrowUp, IconUndo } from '../../components/icons'

const A = t.auction
const SEARCH_FROM = 16
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function AdminAuction() {
  const data = useTournament((s) => s.data)!
  const reload = useTournament((s) => s.reload)
  const { tournamentId, slug } = useTournamentCtx()
  const { snapshot, state, settings } = data
  const auction = state.modules.auction
  const cfg = settings.auction
  const byId = new Map(snapshot.players.map((p) => [p.id, p]))
  const name = (id: string) => byId.get(id)?.displayName ?? '?'
  const [busy, setBusy] = useState(false)
  const [order, setOrder] = useState<string[] | null>(null)
  const [bidder, setBidder] = useState<string | null>(null)
  const [custom, setCustom] = useState<string>('')
  const [q, setQ] = useState('')
  const [buybackFor, setBuybackFor] = useState<string | null>(null)
  const [bbPct, setBbPct] = useState<number>(0)
  const [askReset, setAskReset] = useState(false)

  const lots = auction?.lots ?? []
  const open = lots.find((l) => l.status === 'open') ?? null
  const nextPending = lots.find((l) => l.status === 'pending') ?? null
  const soldCount = lots.filter((l) => l.status === 'sold').length

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await fn()
      await reload()
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const holdings = useMemo(() => auction?.holdings ?? {}, [auction])
  const eligibleBidders = useMemo(
    () => snapshot.players.filter((p) => (holdings[p.id] ?? 0) < cfg.maxPlayersPerOwner || (!cfg.selfOwnedCountsTowardMax && open?.playerId === p.id)),
    [snapshot.players, holdings, cfg.maxPlayersPerOwner, cfg.selfOwnedCountsTowardMax, open],
  )
  const bidderList = useMemo(() => {
    const needle = norm(q.trim())
    return needle ? snapshot.players.filter((p) => norm(p.displayName).includes(needle) || norm(p.fullName).includes(needle)) : snapshot.players
  }, [q, snapshot.players])

  if (!settings.modules.auction.enabled) return <EmptyState title={A.title} body={t.live.comingSoon} />
  if (snapshot.players.length === 0) return <EmptyState title={A.title} body={A.noPlayers} />

  // ---- Phase 1: no lots yet → draw the order.
  if (lots.length === 0) {
    const draft = order ?? snapshot.players.map((p) => p.id)
    return (
      <div className={a.screen}>
        <h2>{A.console}</h2>
        <p className={a.help}>{A.drawHint}</p>
        <div className={a.chipRow}>
          <button className="btn btn--primary" type="button" onClick={() => setOrder(shuffle(draft))}>
            {A.drawOrder}
          </button>
          <button className="btn btn--secondary btn--sm" type="button" onClick={() => setOrder([...snapshot.players].sort((x, y) => x.sortOrder - y.sortOrder).map((p) => p.id))}>
            {A.manualOrder}
          </button>
        </div>
        <ol className={`${a.rows} ${styles.orderList}`}>
          {draft.map((pid, i) => (
            <li key={pid} className={a.row}>
              <span className={styles.orderNum}>{i + 1}</span>
              <Avatar name={name(pid)} url={byId.get(pid)?.avatarUrl} size="sm" />
              <span className={a.rowText} style={{ flex: 1 }}>
                <span className={a.rowTitle}>{name(pid)}</span>
              </span>
              <span className={a.rowActions}>
                <button className="btn btn--ghost btn--sm" type="button" disabled={i === 0} onClick={() => setOrder(move(draft, i, i - 1))} aria-label={t.common.moveUp}>
                  <IconArrowUp />
                </button>
                <button className="btn btn--ghost btn--sm" type="button" disabled={i === draft.length - 1} onClick={() => setOrder(move(draft, i, i + 1))} aria-label={t.common.moveDown}>
                  <IconArrowDown />
                </button>
              </span>
            </li>
          ))}
        </ol>
        <div className={a.sticky}>
          <button
            className="btn btn--primary btn--block"
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await createLots(tournamentId, draft)
                await updateTournament(tournamentId, { status: 'auction' })
              })
            }
          >
            {busy ? t.common.saving : `${A.open} 1`}
          </button>
        </div>
      </div>
    )
  }

  const current = open ?? nextPending
  const currentBid = open?.currentBid ?? null
  const bidAmount = currentBid?.amount ?? cfg.openingBid
  const bidderId = currentBid?.bidderId ?? open?.playerId ?? null
  const lastBid = open ? [...snapshot.calcuttaBids.filter((b) => b.lotId === open.lotId)].sort((x, y) => y.createdAt.localeCompare(x.createdAt))[0] : undefined
  const player = current ? byId.get(current.playerId) : undefined
  const pair = current ? snapshot.pairs.find((p) => p.player1Id === current.playerId || p.player2Id === current.playerId) : undefined
  const ph = current ? state.core.rounds[state.core.roundIds[0] ?? '']?.[current.playerId]?.playingHcp : undefined

  async function bid(delta: number | null) {
    if (!open || !bidder) return
    const amount = delta == null ? Number(custom) : bidAmount + delta
    if (!Number.isFinite(amount) || amount <= bidAmount) {
      toast(`> ${formatMoney(bidAmount)}`)
      return
    }
    await run(() => placeBid(open.lotId, bidder, Math.round(amount)))
    setCustom('')
  }

  async function hammer() {
    if (!open || !bidderId) return
    await run(() => sellLot(open.lotId, bidderId, bidAmount))
    if (bidderId !== open.playerId && cfg.buybackMaxPct > 0) {
      setBuybackFor(open.lotId)
      setBbPct(0)
    }
    setBidder(null)
  }

  return (
    <div className={a.screen}>
      <div className={a.head}>
        <h2>{A.console}</h2>
        <span className={styles.potLine}>
          <span className={a.count}>{A.pot}</span>
          <span className={styles.pot}>{formatMoney(auction?.pot ?? 0)}</span>
        </span>
      </div>
      <p className={a.help}>
        {A.tvHint} <Link to={`/t/${slug}/tv`}>/t/{slug}/tv</Link>
      </p>

      <div className={styles.console}>
        <div className={a.section}>
          {current && player ? (
            <div className={styles.lotCard}>
              <div className={styles.lotHead}>
                <Avatar name={player.displayName} url={player.avatarUrl} size="lg" honoree={player.isHonoree} />
                <div className={styles.lotText}>
                  <span className={styles.lotLabel}>
                    {A.lot(current.lotNumber)}, {A.of(soldCount + 1, lots.length)}
                  </span>
                  <span className={styles.lotName}>{player.fullName}</span>
                  <span className={styles.lotSub}>
                    {player.tier ? `${player.tier}, ` : ''}
                    {ph != null ? `${t.live.playingHcp.toLowerCase()} ${ph}` : `${t.live.hcp.toLowerCase()} ${player.baseHcp}`}
                    {pair ? `, ${A.pair.toLowerCase()}: ${pair.name ?? name(pair.player1Id === player.id ? pair.player2Id : pair.player1Id)}` : ''}
                  </span>
                </div>
              </div>
              {player.formGuide && <p className={styles.lotForm}>{player.formGuide}</p>}
              {open ? (
                <div className={styles.bidBox}>
                  <span className={styles.lotLabel}>{A.currentBid}</span>
                  <span className={styles.bidAmount}>{formatMoney(bidAmount)}</span>
                  <span>{bidderId === open.playerId ? A.self : name(bidderId ?? '')}</span>
                </div>
              ) : (
                <button className="btn btn--primary btn--block" type="button" disabled={busy} onClick={() => void run(() => setLotStatus(current.lotId, 'open'))}>
                  {busy ? t.common.saving : A.open}
                </button>
              )}
            </div>
          ) : (
            <EmptyState
              title={A.allSold}
              body={A.goDraw}
              action={
                <Link className="btn btn--primary" to={`/t/${slug}/admin/parejas`}>
                  {A.goDraw}
                </Link>
              }
            />
          )}

          {open && (
            <>
              <div className={a.sectionTitle}>
                <strong>{A.bidder}</strong>
                {bidder && <span className={a.count}>{name(bidder)}</span>}
              </div>
              {snapshot.players.length > SEARCH_FROM && <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={A.searchBidder} aria-label={A.searchBidder} />}
              <div className={a.tiles} role="radiogroup" aria-label={A.bidder}>
                {bidderList.map((p) => {
                  const ok = eligibleBidders.some((e) => e.id === p.id)
                  const held = holdings[p.id] ?? 0
                  return (
                    <button key={p.id} type="button" role="radio" aria-checked={bidder === p.id} className={`${a.tile} ${bidder === p.id ? a.tileOn : ''}`} disabled={!ok} onClick={() => setBidder(p.id)} aria-label={ok ? p.displayName : `${p.displayName}, ${A.limitReached(held)}`}>
                      <Avatar name={p.displayName} url={p.avatarUrl} size="sm" />
                      <span className={a.tileText}>{p.displayName}</span>
                      <span className={styles.held}>{ok ? (held > 0 ? held : '') : A.limitReached(held)}</span>
                    </button>
                  )
                })}
              </div>
              <div className={styles.bidControls}>
                {[cfg.increment, cfg.increment * 2, cfg.increment * 4].map((d) => (
                  <button key={d} className="btn btn--secondary" type="button" disabled={busy || !bidder} onClick={() => void bid(d)}>
                    {A.bid(formatMoney(d))}
                  </button>
                ))}
                <input className={`input input--num ${styles.custom}`} type="number" placeholder={A.customAmount} value={custom} onChange={(e) => setCustom(e.target.value)} aria-label={A.customAmount} />
                <button className="btn btn--secondary" type="button" disabled={busy || !bidder || !custom} onClick={() => void bid(null)}>
                  {A.custom}
                </button>
              </div>
              <div className={styles.hammer}>
                <button className="btn btn--ghost" type="button" disabled={busy || !lastBid} onClick={() => lastBid && void run(() => deleteBid(lastBid.id))}>
                  <IconUndo /> {A.undo}
                </button>
                <button className="btn btn--primary" type="button" disabled={busy} onClick={() => void hammer()}>
                  {busy ? t.common.saving : A.sold}
                </button>
              </div>
            </>
          )}
        </div>

        <div className={a.section}>
          <div className={a.sectionTitle}>
            <strong>{A.soldList}</strong>
            <span className={a.count}>{A.of(soldCount, lots.length)}</span>
          </div>
          <div className={a.rows}>
            {lots
              .filter((l) => l.status === 'sold')
              .map((l) => (
                <div key={l.lotId} className={a.row}>
                  <span className={styles.orderNum}>{l.lotNumber}</span>
                  <Avatar name={name(l.playerId)} url={byId.get(l.playerId)?.avatarUrl} size="sm" />
                  <span className={a.rowText} style={{ flex: 1 }}>
                    <span className={a.rowTitle}>{name(l.playerId)}</span>
                    <span className={a.rowSub}>
                      {A.owner}: {l.ownerId === l.playerId ? A.self : name(l.ownerId ?? '')}
                      {l.buybackPct > 0 && `, ${A.buyback.toLowerCase()} ${l.buybackPct}%`}
                    </span>
                  </span>
                  <span className={a.fig}>{formatMoney(l.price)}</span>
                  <button className="btn btn--ghost btn--sm" type="button" disabled={busy} onClick={() => void run(() => reopenLot(l.lotId))} aria-label={A.reopen}>
                    <IconUndo />
                  </button>
                </div>
              ))}
            {lots
              .filter((l) => l.status === 'pending')
              .map((l) => (
                <div key={l.lotId} className={a.row}>
                  <span className={styles.orderNum}>{l.lotNumber}</span>
                  <span className={a.rowText} style={{ flex: 1 }}>
                    <span className={a.rowSub}>{name(l.playerId)}</span>
                  </span>
                  <span className={a.count}>{A.pending}</span>
                </div>
              ))}
          </div>
          <button className="btn btn--ghost btn--sm" type="button" disabled={busy} onClick={() => setAskReset(true)}>
            {A.reset}
          </button>
        </div>
      </div>

      <ConfirmSheet open={askReset} title={A.reset} body={A.resetConfirm} danger busy={busy} confirmLabel={A.reset} onConfirm={() => void run(async () => { await resetAuction(tournamentId); setAskReset(false) })} onClose={() => setAskReset(false)} />

      <Sheet open={!!buybackFor} onClose={() => setBuybackFor(null)} title={A.buyback}>
        {buybackFor &&
          (() => {
            const lot = lots.find((l) => l.lotId === buybackFor)!
            const amount = Math.round((lot.price * bbPct) / 100)
            return (
              <div className="stack">
                <p className={a.help}>{A.buybackHint(cfg.buybackMaxPct)}</p>
                <div className="segmented" role="tablist">
                  {[0, 25, 50].filter((x) => x <= cfg.buybackMaxPct).map((x) => (
                    <button key={x} type="button" role="tab" aria-selected={bbPct === x} onClick={() => setBbPct(x)}>
                      {x === 0 ? A.noBuyback : `${x}%`}
                    </button>
                  ))}
                </div>
                <Field label={`${A.custom} (%)`}>
                  <input className="input input--num" type="number" min={0} max={cfg.buybackMaxPct} value={bbPct} onChange={(e) => setBbPct(Math.min(cfg.buybackMaxPct, Math.max(0, Number(e.target.value) || 0)))} />
                </Field>
                {bbPct > 0 && <p>{A.buybackPays(name(lot.playerId), formatMoney(amount), name(lot.ownerId ?? ''))}</p>}
                <button
                  className="btn btn--primary"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await setBuyback(lot.lotId, bbPct, amount)
                      setBuybackFor(null)
                    })
                  }
                >
                  {busy ? t.common.saving : A.next}
                </button>
              </div>
            )
          })()}
      </Sheet>
    </div>
  )
}

function move<T>(arr: T[], from: number, to: number): T[] {
  const x = [...arr]
  const [item] = x.splice(from, 1)
  x.splice(to, 0, item!)
  return x
}
