/**
 * Matrimonios draw (§10): the honoree picks his partner from the eligible
 * tier, the rest is drawn with a rings animation (skippable), pairs name
 * themselves, and Day 1 groups are generated (one pair of each kind per group).
 */
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { t } from '../../i18n/es-MX'
import { Avatar, toast } from '../../components/ui'
import { EmptyState } from '../../components/primitives'
import { ConfirmSheet } from '../../components/ConfirmSheet'
import { saveDraw } from '../../data/api'
import { withTeeTimes } from '../../lib/teeTimes'
import { useTournament } from '../../data/tournamentStore'
import { drawGroupsFromPairs, drawPairs, partnerTier, type DrawnPair } from '../../lib/pairing'
import { useTournamentCtx } from '../tournament/TournamentGate'
import styles from './AdminDraw.module.css'
import a from './Admin.module.css'
import { IconRings } from '../../components/icons'

const D = t.draw

export function AdminDraw() {
  const data = useTournament((s) => s.data)!
  const reload = useTournament((s) => s.reload)
  const { tournamentId, slug } = useTournamentCtx()
  const { snapshot, settings } = data
  const pairing = settings.modules.pairs.pairing
  const byId = new Map(snapshot.players.map((p) => [p.id, p]))
  const name = (id: string) => byId.get(id)?.displayName ?? '?'
  const honoree = settings.modules.pairs.honoreePicks ? snapshot.players.find((p) => p.isHonoree) : undefined
  const eligibleTier = honoree ? partnerTier(honoree.tier, pairing) : null
  const eligible = eligibleTier ? snapshot.players.filter((p) => p.tier === eligibleTier && p.id !== honoree?.id) : []
  const [pick, setPick] = useState<string | null>(null)
  const [drawn, setDrawn] = useState<DrawnPair[] | null>(null)
  const [names, setNames] = useState<Record<number, string>>({})
  const [revealed, setRevealed] = useState(0)
  const [busy, setBusy] = useState(false)
  const [askSave, setAskSave] = useState(false)
  const timers = useRef<number[]>([])
  const missingTiers = snapshot.players.some((p) => !p.tier)

  const clearTimers = () => {
    for (const id of timers.current) window.clearTimeout(id)
    timers.current = []
  }
  useEffect(() => clearTimers, [])

  const fixed = useMemo((): DrawnPair[] => {
    if (!honoree || !pick) return []
    const kind = pairing.find(([x, y]) => (x === honoree.tier && y === eligibleTier) || (y === honoree.tier && x === eligibleTier))
    return [{ player1Id: honoree.id, player2Id: pick, kind: kind ? `${kind[0]}${kind[1]}` : '?', pickedByHonoree: true }]
  }, [honoree, pick, pairing, eligibleTier])

  function draw() {
    clearTimers()
    const pairs = drawPairs(snapshot.players, pairing, fixed)
    setDrawn(pairs)
    setNames({})
    setRevealed(0)
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      setRevealed(pairs.length)
      return
    }
    pairs.forEach((_, i) => timers.current.push(window.setTimeout(() => setRevealed(i + 1), 600 * (i + 1))))
  }
  function showAll() {
    clearTimers()
    if (drawn) setRevealed(drawn.length)
  }

  async function save() {
    if (!drawn) return
    setBusy(true)
    try {
      // Day-1 groups from the drawn pairs (one of each kind per group), keyed by draw index until the server assigns ids.
      const groups = drawGroupsFromPairs(drawn.map((p, i) => ({ id: String(i), kind: p.kind })))
      const times = withTeeTimes('09:00', groups.length)
      const round1Groups = groups.map((idxs, i) => ({
        number: i + 1,
        tee_time: times[i]!,
        start_hole: 1,
        player_ids: idxs.flatMap((k) => {
          const p = drawn[Number(k)]!
          return [p.player1Id, p.player2Id]
        }),
      }))
      await saveDraw(
        tournamentId,
        drawn.map((p, i) => ({ name: names[i]?.trim() || null, player1_id: p.player1Id, player2_id: p.player2Id, kind: p.kind, picked_by_honoree: p.pickedByHonoree })),
        snapshot.rounds.some((r) => r.number === 1) ? round1Groups : null,
        snapshot.tournament.status === 'auction',
      )
      await reload()
      setDrawn(null)
      setAskSave(false)
      toast(D.saved)
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (!settings.modules.pairs.enabled) return <EmptyState title={D.title} body={t.live.comingSoon} />

  return (
    <div className={a.screen}>
      <h2>{D.title}</h2>
      <p className={a.help}>{D.hint(settings.modules.pairs.label)}</p>
      {missingTiers && <p className={a.warn}>{D.missingTiers}</p>}
      {snapshot.pairs.length > 0 && !drawn && (
        <section className={a.section}>
          <div className={a.sectionTitle}>
            <strong>{settings.modules.pairs.label}</strong>
            <Link className="btn btn--ghost btn--sm" to={`/t/${slug}/admin/grupos`}>
              {t.admin.sections.groups}
            </Link>
          </div>
          <p className={a.help}>{D.existing}</p>
          <div className={a.rows}>
            {snapshot.pairs.map((p) => (
              <div key={p.id} className={a.row}>
                <span className={a.rowText}>
                  <span className={a.rowTitle}>{p.name ?? `${name(p.player1Id)} & ${name(p.player2Id)}`}</span>
                  <span className={a.rowSub}>
                    {name(p.player1Id)} & {name(p.player2Id)}, {p.kind}
                    {p.pickedByHonoree ? `, ${D.pickedByHonoree}` : ''}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {honoree ? (
        <section className={a.section}>
          <div className={a.sectionTitle}>
            <strong>
              {D.honoreePicks(honoree.displayName)} ({eligibleTier ?? '?'})
            </strong>
          </div>
          <div className={a.tiles} role="radiogroup" aria-label={D.eligible}>
            {eligible.map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={pick === p.id} className={`${a.tile} ${pick === p.id ? a.tileOn : ''}`} onClick={() => setPick(p.id)}>
                <Avatar name={p.displayName} url={p.avatarUrl} />
                <span className={a.tileText}>{p.displayName}</span>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <p className={a.help}>{D.noHonoree}</p>
      )}

      <button className="btn btn--primary" type="button" disabled={missingTiers || (!!honoree && eligible.length > 0 && !pick)} onClick={draw}>
        {drawn ? D.redraw : D.draw}
      </button>

      {drawn && (
        <section className={a.section}>
          <div className={a.sectionTitle}>
            <strong>{D.names}</strong>
            {revealed < drawn.length && (
              <button className="btn btn--ghost btn--sm" type="button" onClick={showAll}>
                {D.showAll}
              </button>
            )}
          </div>
          <AnimatePresence>
            {drawn.slice(0, revealed).map((p, i) => (
              <motion.div key={`${p.player1Id}${p.player2Id}`} className={styles.pairCard} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
                <span className={styles.rings} aria-hidden="true">
                  <IconRings />
                </span>
                <Avatar name={name(p.player1Id)} url={byId.get(p.player1Id)?.avatarUrl} size="sm" />
                <Avatar name={name(p.player2Id)} url={byId.get(p.player2Id)?.avatarUrl} size="sm" />
                <div className={styles.pairText}>
                  <input className="input" placeholder={D.namePlaceholder(name(p.player1Id), name(p.player2Id))} value={names[i] ?? ''} onChange={(e) => setNames({ ...names, [i]: e.target.value })} aria-label={D.names} />
                  <span className={a.rowSub}>
                    {name(p.player1Id)} & {name(p.player2Id)}, {p.kind}
                    {p.pickedByHonoree ? `, ${D.pickedByHonoree}` : ''}
                  </span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {revealed >= drawn.length && (
            <button className="btn btn--primary btn--block" type="button" disabled={busy} onClick={() => setAskSave(true)}>
              {D.save}
            </button>
          )}
        </section>
      )}

      <ConfirmSheet open={askSave} title={D.save} body={D.saveConfirm} busy={busy} confirmLabel={D.save} onConfirm={() => void save()} onClose={() => setAskSave(false)} />
    </div>
  )
}
