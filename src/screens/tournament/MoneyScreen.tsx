/**
 * Dinero (§9.6, §11): live "si terminara ahora" per person, the final
 * settlement (vía banco / sin banco) with Pagado toggles for admins, the
 * "who still owes what" checklist, and share as text.
 */
import { useMemo, useState } from 'react'
import { t } from '../../i18n/es-MX'
import { HowCalculated } from '../../components/HowCalculated'
import { ShareCardButton } from '../../components/ShareCard'
import { Avatar, Segmented, ShareButton, toast } from '../../components/ui'
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

  async function toggle(f: Flow, paid: boolean) {
    setBusy(true)
    try {
      if (f.kind === 'buyback') {
        const lot = state.modules.auction?.lots.find((l) => l.playerId === f.from && l.ownerId === f.to)
        if (lot) await setBuybackPaid(lot.lotId, paid)
      } else {
        await setPaymentPaid(tournamentId, { from_player_id: f.from, to_player_id: f.to, amount: f.amount, kind: f.kind, paid })
      }
      await reload()
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function togglePayout(playerId: string, amount: number, paid: boolean) {
    setBusy(true)
    try {
      await setPaymentPaid(tournamentId, { from_player_id: null, to_player_id: playerId, amount, kind: 'payout', paid })
      await reload()
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const payoutPaid = (playerId: string) => money.flows.filter((f) => f.kind === 'payout' && f.to === playerId).every((f) => f.paid) && money.flows.some((f) => f.kind === 'payout' && f.to === playerId)

  const shareText = useMemo(() => {
    const lines = [`${M.shareTitle(snapshot.tournament.name)}`, '']
    for (const p of people) lines.push(`${name(p.playerId)}: ${t.money.paid} ${formatMoney(p.paid)} · ${t.money.receives} ${formatMoney(p.receives)} · ${t.money.net} ${formatSignedMoney(p.net)}`)
    lines.push('', settle === 'bank' ? M.viaBank : M.p2p)
    const transfers = settle === 'bank' ? money.viaBank : money.peerToPeer
    for (const tr of transfers) lines.push(M.pays(name(tr.from), name(tr.to), formatMoney(tr.amount)))
    return lines.join('\n')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people, settle, money, snapshot.tournament.name])

  return (
    <div className="screen">
      <div className="row row--between">
        <h1>{t.nav.money}</h1>
        <span className="row">
          <ShareCardButton what={{ kind: 'settlement' }} className="btn btn--secondary btn--sm" label="" />
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

      <div className={`card ${money.banker.balanced ? 'card--cell' : ''}`} style={money.banker.balanced ? undefined : { background: 'var(--coral)', color: '#fff' }}>
        <div className="row row--between">
          <span>
            <span className="label" style={{ color: 'inherit', opacity: 0.8 }}>
              {M.bank} {banker ? `· ${banker.displayName}` : ''}
            </span>
            <span style={{ display: 'block' }} className="small">
              {M.bankIn} <strong className="num">{formatMoney(money.banker.receives)}</strong> · {M.bankOut} <strong className="num">{formatMoney(money.banker.pays)}</strong>
            </span>
          </span>
          <strong>{money.banker.balanced ? `✓ ${M.bankOk}` : M.bankPending(formatMoney(money.banker.difference))}</strong>
        </div>
        {!banker && <p className="help" style={{ color: 'inherit' }}>{M.noBanker}</p>}
        {!state.tournamentFinal && !money.banker.balanced && <p className="help" style={{ color: 'inherit' }}>{M.provisional}</p>}
      </div>

      {mode === 'live' && (
        <div className="list">
          {people.map((p) => {
            const player = byId.get(p.playerId)!
            const open = openId === p.playerId
            const prizes = state.prizes.filter((x) => x.playerId === p.playerId)
            return (
              <div key={p.playerId} className={styles.person}>
                <button type="button" className="listItem" onClick={() => setOpenId(open ? null : p.playerId)}>
                  <Avatar name={player.displayName} url={player.avatarUrl} honoree={player.isHonoree} />
                  <span className="grow">
                    <strong>{player.displayName}</strong>
                    <span className="help" style={{ display: 'block' }}>
                      {t.money.paid} {formatMoney(p.paid)} · {t.money.receives} {formatMoney(p.receives)}
                    </span>
                  </span>
                  <strong className={`num ${p.net >= 0 ? 'teal' : 'coral'}`} style={{ fontSize: '1.2rem' }}>
                    {formatSignedMoney(p.net)}
                  </strong>
                </button>
                {open && (
                  <div className={styles.breakdown}>
                    <Row label={M.entry} amount={-p.entry} />
                    {p.calcuttaPurchases > 0 && <Row label={M.purchases} amount={-p.calcuttaPurchases} />}
                    {p.buybacksPaid > 0 && <Row label={M.buybacksPaid} amount={-p.buybacksPaid} />}
                    {prizes.map((pr, i) => (
                      <div key={i} className="row row--between small">
                        <span>
                          {pr.label}
                          {!pr.final && <span className="help"> · {t.money.ifEndedNow}</span>}
                        </span>
                        <HowCalculated why={pr.why} label={`+${formatMoney(pr.amount)}`} />
                      </div>
                    ))}
                    {p.buybacksReceived > 0 && <Row label={M.buybacksReceived} amount={p.buybacksReceived} />}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {mode === 'final' && (
        <div className="stack stack--lg">
          <section className="stack">
            <h3>{M.checklist}</h3>
            {owed.length === 0 ? (
              <p className="help">{M.nothingOwed}</p>
            ) : (
              <div className="list">
                {owed.map((f, i) => (
                  <div key={i} className="listItem listItem--static">
                    <span className="grow small">
                      <strong>{name(f.from)}</strong> → {name(f.to)} · {f.kind === 'entry' ? M.owesEntry : f.kind === 'calcutta' ? M.owesCalcutta : M.owesBuyback}
                    </span>
                    <span className="num">{formatMoney(f.amount)}</span>
                    {me.isAdmin && (
                      <button className="btn btn--secondary btn--sm" type="button" disabled={busy} onClick={() => void toggle(f, true)}>
                        {M.markPaid}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="stack">
            <Segmented
              value={settle}
              options={[
                { value: 'bank', label: M.viaBank },
                { value: 'p2p', label: M.p2p },
              ]}
              onChange={setSettle}
            />
            <p className="help">{settle === 'bank' ? M.viaBankHint(banker?.displayName ?? M.bank) : M.p2pHint}</p>
            <div className="list">
              {(settle === 'bank' ? money.viaBank : money.peerToPeer).map((tr, i) => {
                const paidFlag = settle === 'bank' && tr.from === null && tr.to ? payoutPaid(tr.to) : false
                return (
                  <div key={i} className={`listItem listItem--static ${paidFlag ? styles.paid : ''}`}>
                    <span className="grow small">
                      <strong>{name(tr.from)}</strong> → <strong>{name(tr.to)}</strong>
                    </span>
                    <span className="num">{formatMoney(tr.amount)}</span>
                    {me.isAdmin && settle === 'bank' && tr.from === null && tr.to && (
                      <button className={`btn btn--sm ${paidFlag ? 'btn--ghost' : 'btn--secondary'}`} type="button" disabled={busy} onClick={() => void togglePayout(tr.to!, tr.amount, !paidFlag)}>
                        {paidFlag ? '✓' : M.markPaid}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

function Row({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="row row--between small">
      <span>{label}</span>
      <span className={`num ${amount >= 0 ? 'teal' : 'coral'}`}>{formatSignedMoney(amount)}</span>
    </div>
  )
}
