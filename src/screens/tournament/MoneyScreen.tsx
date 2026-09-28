/**
 * Dinero (§9.6, §11): a statement. The bank in two figures and a verdict,
 * each person's net as the figure with the breakdown one tap away, and the
 * settlement (vía banco / sin banco) with "Pagado" for admins.
 */
import { useMemo, useState } from 'react'
import { t } from '../../i18n/es-MX'
import { HowCalculated } from '../../components/HowCalculated'
import { ShareCardButton } from '../../components/ShareCard'
import { Avatar, Segmented, ShareButton, toast } from '../../components/ui'
import { EmptyState, Money } from '../../components/primitives'
import { IconCheck } from '../../components/icons'
import { setBuybackPaid, setPaymentPaid } from '../../data/api'
import { useTournament } from '../../data/tournamentStore'
import type { Flow } from '../../engine/core/money'
import { formatMoney, formatSignedMoney } from '../../lib/money'
import { useTournamentCtx } from './TournamentGate'
import styles from './MoneyScreen.module.css'

const M = t.moneyScreen

export function MoneyScreen() {
  const data = useTournament((s) => s.data)!
  const reload = useTournament((s) => s.reload)
  const { me, tournamentId } = useTournamentCtx()
  const { snapshot, state } = data
  const money = state.money
  const byId = new Map(snapshot.players.map((p) => [p.id, p]))
  const name = (id: string | null) => (id ? (byId.get(id)?.displayName ?? '?') : M.bank)
  const banker = snapshot.tournament.bankerPlayerId ? byId.get(snapshot.tournament.bankerPlayerId) : undefined
  const [mode, setMode] = useState<'live' | 'final'>(state.tournamentFinal ? 'final' : 'live')
  const [settle, setSettle] = useState<'bank' | 'p2p'>('bank')
  const [openId, setOpenId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const people = useMemo(() => snapshot.players.map((p) => money.people[p.id]!).filter(Boolean).sort((a, b) => b.net - a.net), [snapshot.players, money.people])
  const owed = useMemo(() => money.flows.filter((f) => !f.paid && (f.kind === 'entry' || f.kind === 'calcutta' || f.kind === 'buyback')), [money.flows])

  async function run(fn: () => Promise<void>) {
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
  const toggle = (f: Flow, paid: boolean) =>
    run(async () => {
      if (f.kind === 'buyback') {
        const lot = state.modules.auction?.lots.find((l) => l.playerId === f.from && l.ownerId === f.to)
        if (lot) await setBuybackPaid(lot.lotId, paid)
      } else {
        // One payments row per (kind, from, to): the amount is the aggregate of every flow with that key (all of an owner's lots).
        const amount = money.flows.filter((x) => x.kind === f.kind && x.from === f.from && x.to === f.to).reduce((s, x) => s + x.amount, 0)
        await setPaymentPaid(tournamentId, { from_player_id: f.from, to_player_id: f.to, amount, kind: f.kind, paid })
      }
    })
  const togglePayout = (playerId: string, amount: number, paid: boolean) => run(() => setPaymentPaid(tournamentId, { from_player_id: null, to_player_id: playerId, amount, kind: 'payout', paid }))

  const payoutPaid = (playerId: string) => money.flows.filter((f) => f.kind === 'payout' && f.to === playerId).every((f) => f.paid) && money.flows.some((f) => f.kind === 'payout' && f.to === playerId)

  const shareText = useMemo(() => {
    const lines = [M.shareTitle(snapshot.tournament.name), '']
    for (const p of people) lines.push(`${name(p.playerId)}: ${t.money.paid.toLowerCase()} ${formatMoney(p.paid)}, ${t.money.receives.toLowerCase()} ${formatMoney(p.receives)}, ${t.money.net.toLowerCase()} ${formatSignedMoney(p.net)}`)
    lines.push('', settle === 'bank' ? M.viaBank : M.p2p)
    const transfers = settle === 'bank' ? money.viaBank : money.peerToPeer
    for (const tr of transfers) lines.push(M.pays(name(tr.from), name(tr.to), formatMoney(tr.amount)))
    return lines.join('\n')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people, settle, money, snapshot.tournament.name])

  const verdict = money.banker.balanced ? M.bankOk : M.bankPending(formatMoney(money.banker.difference))
  const verdictClass = money.banker.balanced ? '' : state.tournamentFinal ? styles.bankVerdictOff : styles.bankVerdictOpen

  return (
    <div className={styles.screen}>
      <div className={styles.head}>
        <h1>{t.nav.money}</h1>
        <span className={styles.headActions}>
          <ShareCardButton what={{ kind: 'settlement' }} className="btn btn--ghost btn--sm" label={t.common.share} />
          <ShareButton text={shareText} title={M.shareTitle(snapshot.tournament.name)} />
        </span>
      </div>
      <Segmented
        value={mode}
        options={[
          { value: 'live', label: M.live },
          { value: 'final', label: M.final },
        ]}
        onChange={setMode}
      />

      <section className={styles.bank}>
        <span className="label">{banker ? `${M.bank}: ${banker.displayName}` : M.bank}</span>
        <div className={styles.bankFigures}>
          <span className={styles.bankFigure}>
            <span className="help">{M.bankIn}</span>
            <span className={styles.bankAmount}>{formatMoney(money.banker.receives)}</span>
          </span>
          <span className={styles.bankFigure}>
            <span className="help">{M.bankOut}</span>
            <span className={styles.bankAmount}>{formatMoney(money.banker.pays)}</span>
          </span>
          <span className={`${styles.bankVerdict} ${verdictClass}`}>{verdict}</span>
        </div>
        {!banker && <span className={styles.bankNote}>{M.noBanker}</span>}
        {!state.tournamentFinal && !money.banker.balanced && <span className={styles.bankNote}>{M.provisional}</span>}
      </section>

      {mode === 'live' && (
        <div className={styles.people}>
          {people.length === 0 && <EmptyState title={t.enter.noPlayers} body="" />}
          {people.map((p) => {
            const player = byId.get(p.playerId)!
            const open = openId === p.playerId
            const prizes = state.prizes.filter((x) => x.playerId === p.playerId)
            return (
              <div key={p.playerId} className={styles.person}>
                <button type="button" className={styles.personRow} onClick={() => setOpenId(open ? null : p.playerId)} aria-expanded={open}>
                  <Avatar name={player.displayName} url={player.avatarUrl} honoree={player.isHonoree} />
                  <span className={styles.personText}>
                    <span className={styles.personName}>{player.displayName}</span>
                    <span className={styles.personSub}>
                      {t.money.paid} {formatMoney(p.paid)}, {t.money.receives.toLowerCase()} {formatMoney(p.receives)}
                    </span>
                  </span>
                  <span className={`${styles.net} ${p.net < 0 ? styles.netNeg : ''}`}>
                    <Money amount={p.net} signed />
                  </span>
                </button>
                {open && (
                  <div className={styles.breakdown}>
                    <Line label={M.entry} amount={-p.entry} />
                    {p.calcuttaPurchases > 0 && <Line label={M.purchases} amount={-p.calcuttaPurchases} />}
                    {p.buybacksPaid > 0 && <Line label={M.buybacksPaid} amount={-p.buybacksPaid} />}
                    {prizes.map((pr, i) => (
                      <div key={i} className={styles.line}>
                        <span>
                          {pr.label}
                          {!pr.final ? `, ${t.money.ifEndedNow}` : ''}
                        </span>
                        <HowCalculated why={pr.why} label={formatSignedMoney(pr.amount)} />
                      </div>
                    ))}
                    {p.buybacksReceived > 0 && <Line label={M.buybacksReceived} amount={p.buybacksReceived} />}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {mode === 'final' && (
        <>
          <section className={styles.section}>
            <h3>{M.checklist}</h3>
            {owed.length === 0 ? (
              <span className="help">{M.nothingOwed}</span>
            ) : (
              <div className={styles.transfers}>
                {owed.map((f, i) => (
                  <div key={i} className={styles.transfer}>
                    <span className={styles.transferText}>
                      <span>
                        <strong>{name(f.from)}</strong> {M.paysTo} {name(f.to)}
                      </span>
                      <span className={styles.transferKind}>{f.kind === 'entry' ? M.owesEntry : f.kind === 'calcutta' ? M.owesCalcutta : M.owesBuyback}</span>
                    </span>
                    <span className={styles.amount}>{formatMoney(f.amount)}</span>
                    {me.isAdmin ? (
                      <button className="btn btn--secondary btn--sm" type="button" disabled={busy} onClick={() => void toggle(f, true)}>
                        {M.markPaid}
                      </button>
                    ) : (
                      <span />
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className={styles.section}>
            <Segmented
              value={settle}
              options={[
                { value: 'bank', label: M.viaBank },
                { value: 'p2p', label: M.p2p },
              ]}
              onChange={setSettle}
            />
            <span className="help">{settle === 'bank' ? M.viaBankHint(banker?.displayName ?? M.bank) : M.p2pHint}</span>
            <div className={styles.transfers}>
              {(settle === 'bank' ? money.viaBank : money.peerToPeer).map((tr, i) => {
                const paidFlag = settle === 'bank' && tr.from === null && tr.to ? payoutPaid(tr.to) : false
                const canMark = me.isAdmin && settle === 'bank' && tr.from === null && !!tr.to
                return (
                  <div key={i} className={`${styles.transfer} ${paidFlag ? styles.paidRow : ''}`}>
                    <span className={styles.transferText}>
                      <span>
                        <strong>{name(tr.from)}</strong> {M.paysTo} <strong>{name(tr.to)}</strong>
                      </span>
                    </span>
                    <span className={styles.amount}>{formatMoney(tr.amount)}</span>
                    {canMark ? (
                      paidFlag ? (
                        <button className={`btn btn--ghost btn--sm ${styles.paidMark}`} type="button" disabled={busy} onClick={() => void togglePayout(tr.to!, tr.amount, false)} aria-label={M.markPaid}>
                          <IconCheck size={16} /> {M.markPaid}
                        </button>
                      ) : (
                        <button className="btn btn--secondary btn--sm" type="button" disabled={busy} onClick={() => void togglePayout(tr.to!, tr.amount, true)}>
                          {M.markPaid}
                        </button>
                      )
                    ) : (
                      <span />
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function Line({ label, amount }: { label: string; amount: number }) {
  return (
    <div className={styles.line}>
      <span>{label}</span>
      <span className={`${styles.lineAmount} ${amount < 0 ? styles.lineNeg : ''}`}>{formatSignedMoney(amount)}</span>
    </div>
  )
}
