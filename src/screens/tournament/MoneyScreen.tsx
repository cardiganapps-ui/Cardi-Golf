/**
 * Dinero (§9.6, §11): a statement. The bank in two figures and a verdict,
 * each person's net as the figure with the breakdown one tap away, and the
 * settlement (vía banco / sin banco) with «Marcar pagado» for admins.
 *
 * While the tournament runs, «Quién debe qué» is where the banker collects
 * (entries, hammer prices, buybacks). Once it is final the settlement is the
 * one list: it already nets everything still due, so showing both would ask
 * for the same peso twice (MONEY-01).
 *
 * «Ya pagaron» keeps what has been marked, so a wrong tap can be taken back
 * (UX-21): «Pagado» there writes the same row with paid false, nothing else.
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { t } from '../../i18n/es-MX'
import { HowCalculated } from '../../components/HowCalculated'
import { IconCheck } from '../../components/icons'
import { ShareCardButton } from '../../components/ShareCard'
import { Avatar, Segmented, ShareButton, toast } from '../../components/ui'
import { EmptyState, Money } from '../../components/primitives'
import { setBuybackPaid, setPaymentPaid } from '../../data/api'
import { useTournament } from '../../data/tournamentStore'
import { applyPaidWrites, markPaidWrites, restorePaidWrites, unmarkPaidWrites, type Account, type PaidWrite, type Transfer } from '../../engine/core/money'
import { formatMoney, formatSignedMoney } from '../../lib/money'
import { Link } from 'react-router'
import { useTournamentCtx } from './TournamentGate'
import styles from './MoneyScreen.module.css'
import { UnassignedMoney } from './UnassignedMoney'
import { humanError } from '../../lib/humanError'

const M = t.moneyScreen

export function MoneyScreen() {
  const data = useTournament((s) => s.data)!
  const reload = useTournament((s) => s.reload)
  const patch = useTournament((s) => s.patch)
  const { me, tournamentId, slug } = useTournamentCtx()
  const { snapshot, state, settings } = data
  const money = state.money
  const byId = useMemo(() => new Map(snapshot.players.map((p) => [p.id, p])), [snapshot.players])
  const name = useCallback((id: string | null) => (id ? (byId.get(id)?.displayName ?? '?') : M.bank), [byId])
  const banker = snapshot.tournament.bankerPlayerId ? byId.get(snapshot.tournament.bankerPlayerId) : undefined
  const [mode, setMode] = useState<'live' | 'byGame' | 'final'>(state.tournamentFinal ? 'final' : 'live')
  const [settle, setSettle] = useState<'bank' | 'p2p'>('bank')
  const [openId, setOpenId] = useState<string | null>(null)
  /** Payment writes queued or on their way: the buttons wait until the last one is done. */
  const [busy, setBusy] = useState(0)

  const people = useMemo(() => snapshot.players.map((p) => money.people[p.id]!).filter(Boolean).sort((a, b) => b.net - a.net), [snapshot.players, money.people])
  /**
   * The same prizes, read per game instead of per person.
   *
   * "¿Cuánto paga este juego?" had three different answers on three screens
   * and none of them was on Dinero, which is where anyone goes to ask it.
   * Grouped by the game that awarded the money, biggest pot first.
   */
  const byGame = useMemo(() => {
    const groups = new Map<string, { label: string; total: number; final: boolean; lines: Array<{ playerId: string; amount: number; label: string }> }>()
    for (const pr of state.prizes) {
      const key = pr.gameId ?? pr.moduleId
      const gameLabel = pr.gameId
        ? (settings.games.find((g) => g.id === pr.gameId)?.label ?? pr.gameId)
        : pr.moduleId === 'adjustment'
          ? M.byComite
          : (settings.modules[pr.moduleId as keyof typeof settings.modules]?.label ?? pr.label.split(', ')[0] ?? pr.moduleId)
      const g = groups.get(key) ?? { label: gameLabel, total: 0, final: true, lines: [] }
      g.total += pr.amount
      g.final = g.final && pr.final
      // «Individual, 1.º» → «1.º»: the heading already says which game it is.
      const trimmed = gameLabel && pr.label.startsWith(gameLabel) ? pr.label.slice(gameLabel.length).replace(/^\s*,\s*/, '') : pr.label
      g.lines.push({ playerId: pr.playerId, amount: pr.amount, label: trimmed })
      groups.set(key, g)
    }
    return [...groups.values()].sort((a, b) => b.total - a.total)
  }, [state.prizes, settings])

  /** «Quién debe qué»: one row per debt still due (a payment key), the way «Pagado» records it. */
  const owed = useMemo(
    () =>
      money.accounts.filter((a) => a.due > 0 && a.from !== null && (a.kind === 'entry' || a.kind === 'calcutta' || a.kind === 'buyback' || a.kind === 'side' || (a.kind === 'bet' && a.final))),
    [money.accounts],
  )
  /** «Ya pagaron»: every account with a payment on record, where a wrong «Marcar pagado» is taken back (UX-21). */
  const paidAccounts = useMemo(() => money.accounts.filter((a) => a.paid > 0), [money.accounts])
  /** What a row is for: the flows still due on the account, or the ones its payment covers. */
  const accountDetail = useCallback(
    (a: Account, part: 'due' | 'paid' = 'due') => {
      const flows = money.flows.filter((f) => f.kind === a.kind && f.from === a.from && f.to === a.to && (part === 'due' ? f.outstanding > 0 : f.outstanding < f.amount))
      if (a.kind === 'entry') return M.owesEntry
      if (a.kind === 'buyback') return M.owesBuyback
      if (a.kind === 'payout') return M.prizes
      if (a.kind === 'calcutta') return flows.length ? M.owesLots(flows.map((f) => f.lotNumber ?? 0)) : M.shares
      const kind = a.kind === 'bet' ? M.owesBet : M.owesSide
      return flows.length ? `${kind}, ${flows.map((f) => f.label).join(', ')}` : kind
    },
    [money.flows],
  )

  /**
   * Payment writes go one at a time, in the order they were tapped, so two
   * writes to one key can't land the wrong way round; a «Deshacer» tapped
   * while another write is on its way waits its turn.
   */
  const queue = useRef<Promise<void>>(Promise.resolve())
  function run(fn: () => Promise<void>) {
    setBusy((n) => n + 1)
    queue.current = queue.current.then(async () => {
      try {
        await fn()
        await reload()
      } catch (e) {
        toast(humanError(e))
      } finally {
        setBusy((n) => n - 1)
      }
    })
    return queue.current
  }
  /**
   * Each payment key's latest tap. A «Deshacer» brings back the value from
   * before its own tap, so once a later tap has changed the same key it would
   * undo that one too: it says so instead.
   */
  const taps = useRef({ last: 0, byKey: new Map<string, number>() })
  const keyOf = (a: Account) => a.lotId ?? `${a.kind}|${a.from}|${a.to}`
  function tap(accounts: readonly Account[]) {
    const n = ++taps.current.last
    for (const a of accounts) taps.current.byKey.set(keyOf(a), n)
    return n
  }
  function undo(accounts: Account[], n: number) {
    if (!accounts.every((a) => taps.current.byKey.get(keyOf(a)) === n)) return toast(M.undoStale)
    tap(accounts)
    void run(() => write(restorePaidWrites(accounts)))
  }
  /**
   * The row a button was on leaves its list once the write lands. Focus goes
   * to the button now in its place (or the one before, at the end of the
   * list), not to the top of the page.
   */
  const refocus = useRef<(() => void) | null>(null)
  function keepFocus(button: EventTarget) {
    // Only a button that had focus (a keyboard, or a mouse on a desktop); a tap on a phone leaves focus alone.
    const list = button instanceof HTMLElement && document.activeElement === button ? button.closest('[data-money-list]') : null
    if (!list) return
    const actions = () => Array.from(list.querySelectorAll<HTMLButtonElement>('button[data-money-action]'))
    const at = actions().indexOf(button as HTMLButtonElement)
    const around = list.closest('details, section')
    refocus.current = () => {
      const active = document.activeElement
      if (active && active !== document.body && active.isConnected) return
      const now = list.isConnected ? actions() : []
      const next = now[Math.min(at, now.length - 1)] ?? (around?.isConnected ? around.querySelector<HTMLElement>('summary, h2, h3') : null)
      // A heading takes focus only with a tabindex; a summary and a button already do.
      if (next && /^H[23]$/.test(next.tagName) && !next.hasAttribute('tabindex')) next.tabIndex = -1
      next?.focus()
    }
  }
  useEffect(() => {
    if (busy > 0 || !refocus.current) return
    const f = refocus.current
    refocus.current = null
    f()
  }, [busy])
  /**
   * One write per account, in order: a payments row upserted on its key, or a
   * buyback on its lot. Each shows as soon as the server has it, so a row
   * moves under the thumb that tapped it; the reload then confirms them all.
   */
  async function write(writes: PaidWrite[]) {
    for (const w of writes) {
      if ('lotId' in w) await setBuybackPaid(w.lotId, w.paid)
      else await setPaymentPaid(tournamentId, { from_player_id: w.from, to_player_id: w.to, amount: w.amount, kind: w.kind, paid: w.paid })
      patch((s) => applyPaidWrites(s, [w]))
    }
  }
  /**
   * «Marcar pagado» records every account the row closes as paid in full, so
   * the row goes away and stays away (MONEY-04). The toast can put it back.
   */
  const markPaid = (settles: Account[], button: EventTarget) => {
    const n = tap(settles)
    keepFocus(button)
    return run(async () => {
      await write(markPaidWrites(settles))
      toast(M.markedPaid, { label: t.common.undo, onClick: () => undo(settles, n) })
    })
  }
  /**
   * «Pagado» tapped in «Ya pagaron»: that account's own row goes back to
   * unpaid, through the same write (UX-21). The toast records it again,
   * exactly as it was.
   */
  const unmarkPaid = (a: Account, button: EventTarget) => {
    const n = tap([a])
    keepFocus(button)
    return run(async () => {
      await write(unmarkPaidWrites([a]))
      toast(M.unmarkedPaid, { label: t.common.undo, onClick: () => undo([a], n) })
    })
  }
  const lineText = (from: string | null, to: string | null, amount: number) => (amount === 0 ? M.squared(name(from), name(to)) : M.pays(name(from), name(to), formatMoney(amount)))
  /** A row's own name, read out with its button: who, to whom, for what and how much, so no two buttons share one. */
  const accountText = (a: Account, part: 'due' | 'paid') => `${name(a.from)} ${part === 'due' ? M.paysTo : M.paidTo} ${name(a.to)}, ${accountDetail(a, part)}: ${formatMoney(part === 'due' ? a.due : a.paid)}`
  /** One debt still due, with «Marcar pagado» for admins. */
  const debtRow = (a: Account) => (
    <div key={`${a.kind}|${a.from}|${a.to}`} className={styles.transfer}>
      <span className={styles.transferText}>
        <span>
          <strong>{name(a.from)}</strong> {M.paysTo} {name(a.to)}
        </span>
        <span className={styles.transferKind}>{accountDetail(a)}</span>
      </span>
      <span className={styles.amount}>{formatMoney(a.due)}</span>
      {me.isAdmin && (
        <span className={styles.action}>
          <button className="btn btn--secondary btn--sm" type="button" data-money-action disabled={busy > 0} onClick={(e) => void markPaid([a], e.currentTarget)} aria-label={`${M.markPaid}: ${accountText(a, 'due')}`}>
            {M.markPaid}
          </button>
        </span>
      )}
    </div>
  )
  /** What a settlement line is made of, from its own side: «Premios +$13,200, Compras Calcutta −$3,000». */
  const lineParts = (tr: Transfer) =>
    [...(tr.settles ?? [])]
      // What the line pays first, then what it nets out.
      .sort((a, b) => Number(a.from !== tr.from && a.to !== tr.to) - Number(b.from !== tr.from && b.to !== tr.to))
      .map((a) => {
        const sign = a.from === tr.from || a.to === tr.to ? 1 : -1
        const label = a.due < 0 ? M.refund : a.kind === 'payout' ? M.prizes : a.kind === 'entry' ? M.entry : a.kind === 'calcutta' ? M.purchases : a.kind === 'side' ? M.sidePots : a.kind === 'bet' ? M.owesBet : M.owesBuyback
        return `${label} ${formatSignedMoney(sign * a.due)}`
      })

  /** One payment on record, with «Pagado» for admins: on, with its check, and a tap takes it back (UX-21). */
  const paidRow = (a: Account) => (
    <div key={`${a.kind}|${a.from}|${a.to}`} className={`${styles.transfer} ${styles.paidRow}`}>
      <span className={styles.transferText}>
        <span>
          <strong>{name(a.from)}</strong> {M.paidTo} {name(a.to)}
        </span>
        <span className={styles.transferKind}>{accountDetail(a, 'paid')}</span>
      </span>
      <span className={styles.amount}>{formatMoney(a.paid)}</span>
      {me.isAdmin && (
        <span className={styles.action}>
          <button className="btn btn--ghost btn--sm" type="button" aria-pressed="true" data-money-action disabled={busy > 0} onClick={(e) => void unmarkPaid(a, e.currentTarget)} aria-label={`${M.paid}: ${accountText(a, 'paid')}`}>
            <IconCheck size={16} />
            {M.paid}
          </button>
        </span>
      )}
    </div>
  )
  /** Folded by default: under «Quién debe qué» while the tournament runs, under the settlement once it is final. */
  const paidSection = paidAccounts.length > 0 && (
    <details className={styles.section}>
      <summary className={styles.recordSummary}>{M.paidTitle(paidAccounts.length)}</summary>
      {me.isAdmin && <span className="help">{M.paidHint}</span>}
      <div className={styles.transfers} data-money-list>{paidAccounts.map(paidRow)}</div>
    </details>
  )

  const shareText = useMemo(() => {
    const lines = [M.shareTitle(snapshot.tournament.name), '']
    for (const p of people) lines.push(`${name(p.playerId)}: ${t.money.paid.toLowerCase()} ${formatMoney(p.paid)}, ${t.money.receives.toLowerCase()} ${formatMoney(p.receives)}, ${t.money.net.toLowerCase()} ${formatSignedMoney(p.net)}`)
    lines.push('', settle === 'bank' ? M.viaBank : M.p2p)
    const transfers = settle === 'bank' ? money.viaBank : money.peerToPeer
    for (const tr of transfers) if (tr.amount > 0) lines.push(M.pays(name(tr.from), name(tr.to), formatMoney(tr.amount)))
    return lines.join('\n')
  }, [people, settle, money, snapshot.tournament.name, name])

  /** Vía banco, once final, an admin marks lines paid: the list gets a slot for the button. */
  const markable = me.isAdmin && settle === 'bank' && state.tournamentFinal
  // Once play is over, money still in the bank is «Por asignar», listed below
  // with where it comes from (COPY-09); red only for a bank that does not
  // square with that list.
  const u = money.unassigned
  const verdict = u.closing && u.total > 0 ? t.unassigned.total(formatMoney(u.total)) : money.banker.balanced ? M.bankOk : u.closing ? M.bankOff(formatSignedMoney(money.banker.difference)) : M.bankPending(formatMoney(money.banker.difference))
  const verdictClass = money.banker.balanced && u.total === 0 ? '' : u.closing && (u.total === 0 || u.total !== money.banker.difference) ? styles.bankVerdictOff : styles.bankVerdictOpen

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
          { value: 'byGame', label: M.byGame },
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
        {money.banker.houseCut > 0 && <span className={styles.bankNote}>{M.houseCut(formatMoney(money.banker.houseCut))}</span>}
        {state.flags.poolWarning && (
          <span className={`${styles.bankNote} ${styles.bankVerdictOpen}`} role="status">
            {state.flags.poolWarning}
          </span>
        )}
        {!banker && <span className={styles.bankNote}>{M.noBanker}</span>}
        {!u.closing && !money.banker.balanced && <span className={styles.bankNote}>{M.provisional}</span>}
        {u.closing && u.total > 0 && <span className={styles.bankNote}>{t.unassigned.totalHint}</span>}
      </section>

      <UnassignedMoney />

      {mode === 'live' && (
        <div className={styles.people}>
          {people.length === 0 && <EmptyState title={t.enter.noPlayers} body={t.enter.noPlayersHint} />}
          {people.map((p) => {
            const player = byId.get(p.playerId)!
            const open = openId === p.playerId
            const prizes = state.prizes.filter((x) => x.playerId === p.playerId)
            const betsLost = state.prizes.filter((x) => x.payerId === p.playerId)
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
                    {p.sidePots > 0 && <Line label={M.sidePots} amount={-p.sidePots} />}
                    {p.buybacksPaid > 0 && <Line label={M.buybacksPaid} amount={-p.buybacksPaid} />}
                    {betsLost.map((pr, i) => (
                      <div key={`bet${i}`} className={styles.line}>
                        <span>
                          {pr.label.split(',')[0]}, {M.paysTo} {name(pr.playerId)}
                          {!pr.final ? `, ${t.money.ifEndedNow}` : ''}
                        </span>
                        <HowCalculated why={pr.why} label={formatSignedMoney(-pr.amount)} />
                      </div>
                    ))}
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

      {mode === 'byGame' && (
        <div className={styles.people}>
          {byGame.length === 0 && <EmptyState title={M.byGameEmpty} body={M.byGameEmptyHint} />}
          {byGame.map((g) => (
            <section key={g.label} className={styles.section}>
              <div className={styles.gameHead}>
                <strong>{g.label}</strong>
                <span className={styles.amount}>{formatMoney(g.total)}</span>
              </div>
              {!g.final && <span className="help">{t.money.ifEndedNow}</span>}
              <div className={styles.breakdown}>
                {g.lines.map((l, i) => (
                  <div key={i} className={styles.line}>
                    <span>
                      {name(l.playerId)}
                      {l.label ? `, ${l.label}` : ''}
                    </span>
                    <span>{formatMoney(l.amount)}</span>
                  </div>
                ))}
              </div>
            </section>
          ))}
          <Link className="btn btn--ghost btn--sm" to={`/t/${slug}/reglamento`}>
            {M.seeRules}
          </Link>
        </div>
      )}

      {mode === 'final' && (
        <>
          {!state.tournamentFinal && (
            <section className={styles.section}>
              <h3>{M.checklist}</h3>
              {owed.length === 0 ? (
                <span className="help">{M.nothingOwed}</span>
              ) : (
                <div className={styles.transfers} data-money-list>{owed.map(debtRow)}</div>
              )}
            </section>
          )}
          {!state.tournamentFinal && paidSection}

          <section className={styles.section}>
            <Segmented
              value={settle}
              options={[
                { value: 'bank', label: M.viaBank },
                { value: 'p2p', label: M.p2p },
              ]}
              onChange={setSettle}
            />
            <span className="help">{settle === 'bank' ? M.viaBankHint(banker?.displayName ?? M.bank) : M.p2pHint(banker?.displayName ?? null)}</span>
            {!state.tournamentFinal && <span className="help">{M.settlePreview}</span>}
            {state.tournamentFinal && (settle === 'bank' ? money.viaBank : money.peerToPeer).length === 0 && <span className="help">{M.allSettled}</span>}
            <div className={styles.transfers} data-money-list>
              {(settle === 'bank' ? money.viaBank : money.peerToPeer).map((tr, i) => {
                const canMark = markable && !!tr.final && !!tr.settles?.length
                const parts = settle === 'bank' && (tr.settles?.length ?? 0) > 1 ? lineParts(tr) : []
                return (
                  <div key={`${i}|${tr.from}|${tr.to}`} className={styles.transfer}>
                    <span className={styles.transferText}>
                      {tr.amount === 0 ? (
                        <span>{M.squared(name(tr.from), name(tr.to))}</span>
                      ) : (
                        <span>
                          <strong>{name(tr.from)}</strong> {M.paysTo} <strong>{name(tr.to)}</strong>
                        </span>
                      )}
                      {parts.length > 0 && (
                        <span className={styles.transferKind}>
                          {parts.map((part, j) => (
                            <Fragment key={j}>
                              {j > 0 && ', '}
                              <span className={styles.part}>{part}</span>
                            </Fragment>
                          ))}
                        </span>
                      )}
                    </span>
                    <span className={styles.amount}>{formatMoney(tr.amount)}</span>
                    {/* Every line keeps the slot, so a line with a provisional prize (no button) keeps its amount in the column. */}
                    {markable && (
                      <span className={styles.action}>
                        {canMark && (
                          <button className="btn btn--secondary btn--sm" type="button" data-money-action disabled={busy > 0} onClick={(e) => void markPaid(tr.settles!, e.currentTarget)} aria-label={`${M.markPaid}: ${lineText(tr.from, tr.to, tr.amount)}`}>
                            {M.markPaid}
                          </button>
                        )}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </section>

          {/* Once final, the settlement already nets every debt. A payment made
              but never marked (cash on Calcutta night, say) is recorded here,
              so the settlement stops counting it. */}
          {state.tournamentFinal && me.isAdmin && owed.length > 0 && (
            <details className={styles.section}>
              <summary className={styles.recordSummary}>{M.recordPaid}</summary>
              <span className="help">{M.recordPaidHint}</span>
              <div className={styles.transfers} data-money-list>{owed.map(debtRow)}</div>
            </details>
          )}
          {state.tournamentFinal && paidSection}
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
