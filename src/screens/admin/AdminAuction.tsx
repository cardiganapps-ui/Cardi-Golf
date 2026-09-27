/**
 * Auctioneer console (§10): draw the lot order, open lots, take bids by
 * avatar, undo, hammer, buyback, next. Everything is a row the engine
 * derives from, so the TV board and every phone follow in real time.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { t } from '../../i18n/es-MX'
import { Avatar, Field, Sheet, toast } from '../../components/ui'
import { createLots, deleteBid, placeBid, reopenLot, resetAuction, sellLot, setBuyback, setLotStatus, updateTournament } from '../../data/api'
import { useTournament } from '../../data/tournamentStore'
import { formatMoney } from '../../lib/money'
import { shuffle } from '../../lib/pairing'
import { useTournamentCtx } from '../tournament/TournamentGate'
import styles from './AdminAuction.module.css'
import { IconArrowDown, IconArrowUp, IconUndo } from '../../components/icons'

const A = t.auction

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
  const [buybackFor, setBuybackFor] = useState<string | null>(null)
  const [bbPct, setBbPct] = useState<number>(0)

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

  if (!settings.modules.auction.enabled) return <p className="muted">{t.live.comingSoon}</p>
  if (snapshot.players.length === 0) return <p className="muted">{A.noPlayers}</p>

  // ---- Phase 1: no lots yet → draw the order.
  if (lots.length === 0) {
    const draft = order ?? snapshot.players.map((p) => p.id)
    return (
      <div className="stack">
        <h2>{A.console}</h2>
        <p className="help">{A.drawHint}</p>
        <div className="row row--wrap">
          <button className="btn btn--primary" type="button" onClick={() => setOrder(shuffle(draft))}>
            {A.drawOrder}
          </button>
          <button className="btn btn--secondary btn--sm" type="button" onClick={() => setOrder([...snapshot.players].sort((a, b) => a.sortOrder - b.sortOrder).map((p) => p.id))}>
            {A.manualOrder}
          </button>
        </div>
        <ol className={`list ${styles.orderList}`}>
          {draft.map((pid, i) => (
            <li key={pid} className="listItem listItem--static">
              <span className="num" style={{ width: 28 }}>
                {i + 1}
              </span>
              <Avatar name={name(pid)} url={byId.get(pid)?.avatarUrl} size="sm" />
              <span className="grow">{name(pid)}</span>
              <button className="btn btn--ghost btn--sm" type="button" disabled={i === 0} onClick={() => setOrder(move(draft, i, i - 1))} aria-label={t.common.moveUp}>
                <IconArrowUp />
              </button>
              <button className="btn btn--ghost btn--sm" type="button" disabled={i === draft.length - 1} onClick={() => setOrder(move(draft, i, i + 1))} aria-label={t.common.moveDown}>
                <IconArrowDown />
              </button>
            </li>
          ))}
        </ol>
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
          {A.open} 1
        </button>
      </div>
    )
  }

  const current = open ?? nextPending
  const currentBid = open?.currentBid ?? null
  const bidAmount = currentBid?.amount ?? cfg.openingBid
  const bidderId = currentBid?.bidderId ?? open?.playerId ?? null
  const lastBid = open ? [...snapshot.calcuttaBids.filter((b) => b.lotId === open.lotId)].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] : undefined
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
    <div className="stack">
      <div className="row row--between">
        <h2>{A.console}</h2>
        <span className="chip chip--teal">
          {A.pot} {formatMoney(auction?.pot ?? 0)}
        </span>
      </div>
      <p className="help">
        {A.tvHint} <Link to={`/t/${slug}/tv`}>/t/{slug}/tv</Link>
      </p>

      {current && player ? (
        <div className={`card card--deep ${styles.lotCard}`}>
          <div className="row">
            <Avatar name={player.displayName} url={player.avatarUrl} size="lg" honoree={player.isHonoree} />
            <div className="grow">
              <span className="label" style={{ color: 'var(--seafoam)' }}>
                {A.lot(current.lotNumber)} · {A.of(soldCount + 1, lots.length)}
              </span>
              <h2 style={{ color: 'var(--paper)' }}>{player.fullName}</h2>
              <span className="small">
                {player.tier && <span className="tierBadge" style={{ marginRight: 6 }}>{player.tier}</span>}
                {ph != null ? `${t.live.playingHcp} ${ph}` : `${t.live.hcp} ${player.baseHcp}`}
                {pair ? ` · ${A.pair}: ${pair.name ?? name(pair.player1Id === player.id ? pair.player2Id : pair.player1Id)}` : ''}
              </span>
              {player.formGuide && <p className="small" style={{ color: 'var(--seafoam)', marginTop: 4 }}>{player.formGuide}</p>}
            </div>
          </div>
          {open ? (
            <div className={styles.bidBox}>
              <span className="label" style={{ color: 'var(--seafoam)' }}>
                {A.currentBid}
              </span>
              <span className={`num ${styles.bidAmount}`}>{formatMoney(bidAmount)}</span>
              <span>{bidderId === open.playerId ? A.self : name(bidderId ?? '')}</span>
            </div>
          ) : (
            <button className="btn btn--primary btn--block" type="button" disabled={busy} onClick={() => void run(() => setLotStatus(current.lotId, 'open'))}>
              {A.open}
            </button>
          )}
        </div>
      ) : (
        <div className="card card--deep">
          <h2 style={{ color: 'var(--sun)' }}>{A.allSold}</h2>
          <Link className="btn btn--primary" to={`/t/${slug}/admin/parejas`} style={{ marginTop: 12 }}>
            {A.goDraw}
          </Link>
        </div>
      )}

      {open && (
        <>
          <span className="label">{A.bidder}</span>
          <div className={styles.bidders}>
            {snapshot.players.map((p) => {
              const ok = eligibleBidders.some((e) => e.id === p.id)
              const held = holdings[p.id] ?? 0
              return (
                <button key={p.id} type="button" className={`${styles.bidderBtn} ${bidder === p.id ? styles.bidderOn : ''}`} disabled={!ok} onClick={() => setBidder(p.id)} title={ok ? '' : A.limitReached(held)}>
                  <Avatar name={p.displayName} url={p.avatarUrl} size="sm" />
                  <span className="small">{p.displayName}</span>
                  {held > 0 && <span className="help">{held}</span>}
                </button>
              )
            })}
          </div>
          <div className="row row--wrap">
            {[cfg.increment, cfg.increment * 2, cfg.increment * 4].map((d) => (
              <button key={d} className="btn btn--secondary" type="button" disabled={busy || !bidder} onClick={() => void bid(d)}>
                {A.bid(formatMoney(d))}
              </button>
            ))}
            <input className="input input--num" style={{ width: 110 }} type="number" placeholder={A.custom} value={custom} onChange={(e) => setCustom(e.target.value)} />
            <button className="btn btn--secondary" type="button" disabled={busy || !bidder || !custom} onClick={() => void bid(null)}>
              {A.custom}
            </button>
          </div>
          <div className="row">
            <button className="btn btn--ghost btn--sm" type="button" disabled={busy || !lastBid} onClick={() => lastBid && void run(() => deleteBid(lastBid.id))}>
              <IconUndo /> {A.undo}
            </button>
            <button className="btn btn--primary grow" type="button" disabled={busy} onClick={() => void hammer()}>
              {A.sold}
            </button>
          </div>
        </>
      )}

      <div className="stack">
        <span className="label">{A.soldList}</span>
        <div className="list">
          {lots
            .filter((l) => l.status === 'sold')
            .map((l) => (
              <div key={l.lotId} className="listItem listItem--static">
                <span className="num" style={{ width: 28 }}>
                  {l.lotNumber}
                </span>
                <Avatar name={name(l.playerId)} url={byId.get(l.playerId)?.avatarUrl} size="sm" />
                <span className="grow small">
                  <strong>{name(l.playerId)}</strong>
                  <span className="help">
                    {A.owner}: {l.ownerId === l.playerId ? A.self : name(l.ownerId ?? '')}
                    {l.buybackPct > 0 && `, ${A.buyback} ${l.buybackPct}%`}
                  </span>
                </span>
                <span className="num">{formatMoney(l.price)}</span>
                <button className="btn btn--ghost btn--sm" type="button" disabled={busy} onClick={() => void run(() => reopenLot(l.lotId))} aria-label={A.reopen} title={A.reopen}>
                  <IconUndo />
                </button>
              </div>
            ))}
          {lots
            .filter((l) => l.status === 'pending')
            .map((l) => (
              <div key={l.lotId} className="listItem listItem--static muted">
                <span className="num" style={{ width: 28 }}>
                  {l.lotNumber}
                </span>
                <span className="grow small">{name(l.playerId)}</span>
                <span className="help">{A.pending}</span>
              </div>
            ))}
        </div>
        <button className="btn btn--ghost btn--sm coral" type="button" disabled={busy} onClick={() => confirm(A.resetConfirm) && void run(() => resetAuction(tournamentId))}>
          {A.reset}
        </button>
      </div>

      <Sheet open={!!buybackFor} onClose={() => setBuybackFor(null)} title={A.buyback}>
        {buybackFor &&
          (() => {
            const lot = lots.find((l) => l.lotId === buybackFor)!
            const amount = Math.round((lot.price * bbPct) / 100)
            return (
              <div className="stack">
                <p className="help">{A.buybackHint(cfg.buybackMaxPct)}</p>
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
                  {A.next}
                </button>
              </div>
            )
          })()}
      </Sheet>
    </div>
  )
}

function move<T>(arr: T[], from: number, to: number): T[] {
  const a = [...arr]
  const [x] = a.splice(from, 1)
  a.splice(to, 0, x!)
  return a
}
