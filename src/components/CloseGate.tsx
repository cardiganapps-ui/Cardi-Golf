/**
 * «Cerrar torneo» (MONEY-05): before Terminado, publishing the results, or a
 * Ronda rápida's «Terminar y publicar», the Comité sees what is still open
 * and cannot go on until it is settled (`closeCheck`). What people still owe
 * is shown, not blocking. The check reads the holes waiting in «Pendientes
 * de revisar» from the server (0028 `rejected_inbox`), so it needs signal,
 * like the action it guards; a server without that list yet does not hold
 * the close on it (the sheet says the list is not available).
 *
 * The first line, not the only one: since 0029 the database refuses
 * Terminado and a publish on its own while a planned day is missing or open
 * or a hole waits in «Pendientes de revisar» (`close_blockers`), the part SQL
 * decides exactly as this check does. The rest (snake tiebreaks, money «por
 * asignar», unpayable assignments, unsigned cards) needs the engine and is
 * checked here only. A refusal from the server (a board that was stale, a
 * second phone) is a Spanish sentence that `humanError` shows as written.
 */
import { useState, type ReactNode } from 'react'
import { t } from '../i18n/es-MX'
import { openRejectedWrites } from '../data/api'
import { useTournament } from '../data/tournamentStore'
import { closeCheck, type CloseCheck } from '../engine/close'
import { humanError } from '../lib/humanError'
import { ConfirmSheet } from './ConfirmSheet'
import { Sheet, toast } from './ui'

const C = t.closeGate

interface GateOptions {
  /** A Ronda rápida finishes its live rounds as it closes. */
  finishLiveRounds?: boolean
  /** Ask before going on even with nothing to warn about (the action had its own confirmation). */
  alwaysConfirm?: boolean
  title?: string
  body?: string
  confirmLabel: string
  /**
   * When only money blocks (a Ronda rápida's live round hides its «Por
   * asignar» until it is over): close the rounds first, decide in Dinero,
   * then come back.
   */
  moneyFirst?: () => Promise<void>
}

/** What the Comité settles in Dinero once the rounds are over. */
const MONEY: ReadonlySet<string> = new Set(['unassigned', 'badAssignments'])

interface Pending extends GateOptions {
  check: CloseCheck
  proceed: () => Promise<void>
}

export function useCloseGate(tournamentId: string): { guard: (opts: GateOptions, proceed: () => Promise<void>) => Promise<void>; checking: boolean; sheet: ReactNode } {
  const [pending, setPending] = useState<Pending | null>(null)
  const [checking, setChecking] = useState(false)
  const [busy, setBusy] = useState(false)

  async function guard(opts: GateOptions, proceed: () => Promise<void>) {
    const d = useTournament.getState().data
    if (!d || d.snapshot.tournament.id !== tournamentId) return
    setChecking(true)
    let check: CloseCheck
    try {
      check = closeCheck(d.snapshot, d.settings, { finishLiveRounds: opts.finishLiveRounds, openRejected: await openRejectedWrites(tournamentId) })
    } catch (e) {
      toast(humanError(e))
      return
    } finally {
      setChecking(false)
    }
    if (check.ok && !check.warnings.length && !opts.alwaysConfirm) return proceed()
    setPending({ ...opts, check, proceed })
  }

  const go = () => (pending ? run(pending.proceed) : Promise.resolve())
  async function run(fn: () => Promise<void>) {
    setBusy(true)
    try {
      await fn()
      setPending(null)
    } catch (e) {
      toast(humanError(e))
    } finally {
      setBusy(false)
    }
  }

  const close = () => setPending(null)
  const sheet = !pending ? null : pending.check.ok ? (
    <ConfirmSheet open title={pending.title ?? C.title} body={pending.body ?? C.ok} confirmLabel={pending.confirmLabel} busy={busy} onConfirm={() => void go()} onClose={close}>
      {pending.check.warnings.map((w) => (
        <p key={w} className="help" role="status">
          {w}
        </p>
      ))}
    </ConfirmSheet>
  ) : (
    <Sheet open onClose={close} title={C.title}>
      <div className="stack">
        <p>{C.blocked}</p>
        <ul className="stack" data-close-blockers>
          {pending.check.blockers.map((b) => (
            <li key={b.kind}>{b.text}</li>
          ))}
        </ul>
        {pending.check.warnings.map((w) => (
          <p key={w} className="help">
            {w}
          </p>
        ))}
        {pending.moneyFirst && pending.check.blockers.every((b) => MONEY.has(b.kind)) && (
          <>
            <p className="help">{C.moneyFirstHint}</p>
            <button className="btn btn--secondary" type="button" disabled={busy} onClick={() => void run(pending.moneyFirst!)}>
              {C.moneyFirst}
            </button>
          </>
        )}
        <button className="btn btn--primary" type="button" onClick={close}>
          {C.understood}
        </button>
      </div>
    </Sheet>
  )
  return { guard, checking, sheet }
}
