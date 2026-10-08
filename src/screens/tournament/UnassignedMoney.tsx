/**
 * «Por asignar» on Dinero (MONEY-05, COPY-09). Once play is over, the money
 * the rules leave to the Comité is a list, not a bare red number: each line
 * says where it comes from, how much, «¿Cómo se calculó?», and that the
 * Comité decides. The Comité gets «Decidir» on each line (give it to
 * someone, refund it pro rata to who paid it, or leave it to the house, with
 * a reason) and «Anular» on what it already decided. Online only: a decision
 * goes straight to the server (`assign_unassigned`), never through the outbox.
 */
import { useEffect, useMemo, useState } from 'react'
import { t } from '../../i18n/es-MX'
import { ConfirmSheet } from '../../components/ConfirmSheet'
import { HowCalculated } from '../../components/HowCalculated'
import { NumberField } from '../../components/NumberField'
import { ReasonSheet } from '../../components/ReasonSheet'
import { Field, Input, Segmented } from '../../components/primitives'
import { toast } from '../../components/ui'
import { assignUnassigned, voidAdjustment, type AssignEntry } from '../../data/api'
import { useTournament } from '../../data/tournamentStore'
import { proRata, type Assignment, type UnassignedBucket } from '../../engine/core/unassigned'
import type { Player } from '../../engine/types'
import { humanError } from '../../lib/humanError'
import { formatMoney } from '../../lib/money'
import { useTournamentCtx } from './TournamentGate'
import styles from './MoneyScreen.module.css'

const U = t.unassigned

export function UnassignedMoney() {
  const data = useTournament((s) => s.data)!
  const reload = useTournament((s) => s.reload)
  const { me, tournamentId } = useTournamentCtx()
  const [deciding, setDeciding] = useState<UnassignedBucket | null>(null)
  const [voiding, setVoiding] = useState<Assignment | null>(null)
  const { snapshot, state } = data
  const u = state.money.unassigned
  const players = useMemo(() => [...snapshot.players].sort((a, b) => a.sortOrder - b.sortOrder), [snapshot.players])
  if (!u.closing || (u.buckets.length === 0 && u.assignments.length === 0)) return null
  const name = (id: string | null) => (id ? (players.find((p) => p.id === id)?.displayName ?? '?') : U.toHouse)
  const who = (a: Assignment) => t.common.andList(a.rows.map((r) => (a.rows.length > 1 ? `${name(r.toPlayerId)} ${formatMoney(r.amount)}` : name(r.toPlayerId))))
  const statusNote = (a: Assignment) => (a.status === 'over' ? U.statusOver : a.status === 'orphan' ? U.statusOrphan : a.status === 'waiting' ? U.statusWaiting : null)

  return (
    <section className={styles.section} aria-label={U.heading}>
      <h3>{U.heading}</h3>
      <span className="help">{U.intro}</span>
      {u.buckets.length > 0 && (
        <div className={styles.transfers}>
          {u.buckets.map((b) => (
            <div key={b.key} className={styles.transfer}>
              <span className={styles.transferText}>
                <strong>{b.label}</strong>
                <span className={styles.transferKind}>{U.decides}</span>
                <HowCalculated why={b.why} />
              </span>
              <span className={styles.amount}>{formatMoney(b.remaining)}</span>
              {me.isAdmin && (
                <span className={styles.action}>
                  <button className="btn btn--secondary btn--sm" type="button" onClick={() => setDeciding(b)} aria-label={`${U.decide}: ${b.label}, ${formatMoney(b.remaining)}`}>
                    {U.decide}
                  </button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {u.assignments.length > 0 && (
        <>
          <span className="label">{U.applied}</span>
          <div className={styles.transfers}>
            {u.assignments.map((a) => {
              const note = statusNote(a)
              return (
                <div key={a.id} className={styles.transfer}>
                  <span className={styles.transferText}>
                    <span>
                      <strong>{a.label}</strong>: {who(a)}
                    </span>
                    <span className={styles.transferKind}>{a.reason}</span>
                    {note && (
                      <span className={`${styles.transferKind} ${styles.bankVerdictOff}`} role="status">
                        {note}
                      </span>
                    )}
                  </span>
                  <span className={styles.amount}>{formatMoney(a.total)}</span>
                  {me.isAdmin && (
                    <span className={styles.action}>
                      <button className="btn btn--ghost btn--sm" type="button" onClick={() => setVoiding(a)} aria-label={`${U.void}: ${U.rowWhat(a.label, formatMoney(a.total), a.reason)}`}>
                        {U.void}
                      </button>
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
      {me.isAdmin && <AssignSheet bucket={deciding} players={players} tournamentId={tournamentId} onClose={() => setDeciding(null)} onDone={reload} />}
      {me.isAdmin && (
        <ReasonSheet
          open={!!voiding}
          title={U.voidTitle}
          body={voiding ? `${U.rowWhat(voiding.label, formatMoney(voiding.total), voiding.reason)}. ${U.voidBody}` : undefined}
          confirmLabel={U.void}
          danger
          onConfirm={async (reason) => {
            await voidAdjustment(voiding!.id, reason)
            await reload()
            toast(U.voided)
          }}
          onClose={() => setVoiding(null)}
        />
      )}
    </section>
  )
}

type Mode = 'give' | 'refund' | 'house'

/** One decision on one line: to whom and how much, with a reason. Never more than the line holds. */
function AssignSheet({ bucket, players, tournamentId, onClose, onDone }: { bucket: UnassignedBucket | null; players: Player[]; tournamentId: string; onClose: () => void; onDone: () => Promise<unknown> }) {
  const remaining = bucket?.remaining ?? 0
  const [mode, setMode] = useState<Mode>('give')
  const [amounts, setAmounts] = useState<Record<string, number>>({})
  const [house, setHouse] = useState(remaining)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setMode('give')
    setAmounts({})
    setHouse(remaining)
    setReason('')
    setError(null)
  }, [bucket?.key, remaining])
  const refund = useMemo(() => (bucket?.contributors?.length ? proRata(remaining, bucket.contributors) : []), [bucket, remaining])
  const nameOf = (id: string) => players.find((p) => p.id === id)?.displayName ?? '?'

  const entries: AssignEntry[] =
    mode === 'give'
      ? players.filter((p) => (amounts[p.id] ?? 0) > 0).map((p) => ({ kind: 'award', to_player_id: p.id, amount: amounts[p.id]! }))
      : mode === 'refund'
        ? refund.map((c) => ({ kind: 'refund', to_player_id: c.playerId, amount: c.amount }))
        : house > 0
          ? [{ kind: 'house', to_player_id: null, amount: house }]
          : []
  const sum = entries.reduce((s, e) => s + e.amount, 0)

  async function confirm() {
    if (!bucket) return
    if (!entries.length) return setError(U.nothing)
    if (sum > remaining) return setError(U.tooMuch(formatMoney(remaining)))
    if (reason.trim().length < 3) return setError(U.reasonShort)
    setBusy(true)
    setError(null)
    try {
      await assignUnassigned(tournamentId, bucket.key, entries, reason.trim())
      await onDone()
      toast(U.assigned)
      onClose()
    } catch (e) {
      setError(humanError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ConfirmSheet open={!!bucket} title={bucket ? U.decideTitle(bucket.label) : ''} body={U.available(formatMoney(remaining))} confirmLabel={U.confirm} busy={busy} onConfirm={() => void confirm()} onClose={onClose}>
      <Segmented
        value={mode}
        label={U.decide}
        options={[
          { value: 'give', label: U.give },
          { value: 'refund', label: U.refund },
          { value: 'house', label: U.house },
        ]}
        onChange={(m) => {
          setMode(m)
          setError(null)
        }}
      />
      <span className="help">{mode === 'give' ? U.giveHint : mode === 'refund' ? (refund.length ? U.refundHint : U.refundNone) : U.houseHint}</span>
      {mode === 'give' && (
        <div className={styles.breakdown}>
          {players.map((p) => (
            <div key={p.id} className={styles.line}>
              <span>{p.displayName}</span>
              <NumberField value={amounts[p.id] ?? 0} min={0} max={remaining} prefix="$" label={U.amountFor(p.displayName)} onChange={(v) => setAmounts((x) => ({ ...x, [p.id]: v }))} />
            </div>
          ))}
        </div>
      )}
      {mode === 'refund' && refund.length > 0 && (
        <div className={styles.breakdown}>
          {refund.map((c) => (
            <div key={c.playerId} className={styles.line}>
              <span>{nameOf(c.playerId)}</span>
              <span>{formatMoney(c.amount)}</span>
            </div>
          ))}
        </div>
      )}
      {mode === 'house' && (
        <Field label={U.house}>
          <NumberField value={house} min={0} max={remaining} prefix="$" onChange={setHouse} />
        </Field>
      )}
      <p className="help" role="status">
        {sum > remaining ? U.tooMuch(formatMoney(remaining)) : U.assigning(formatMoney(sum), formatMoney(remaining - sum))}
      </p>
      <Field label={U.reason} hint={U.reasonHint} error={error}>
        <Input value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </ConfirmSheet>
  )
}
