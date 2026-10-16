/**
 * Matrimonios draw (§10): the honoree picks his partner from the eligible
 * tier, the rest is drawn by tier, pairs name themselves, and Day 1 groups are
 * made with the draw (one pair of each kind per group).
 *
 * The draw is saved the moment it is drawn (UX-17), so the TV shows it to the
 * room a pair at a time while this phone does the same; the pairs then name
 * themselves here and the TV shows each name as it lands. On Calcutta night
 * «Empezar el torneo» closes the night, which saving the draw used to do.
 */
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { t } from '../../i18n/es-MX'
import { Avatar } from '../../components/ui'
import { toast } from '../../components/toast'
import { EmptyState } from '../../components/primitives'
import { ConfirmSheet } from '../../components/ConfirmSheet'
import { renamePair, saveDraw, updateTournament } from '../../data/api'
import { withTeeTimes } from '../../lib/teeTimes'
import { useTournament } from '../../data/tournamentStore'
import { drawGroupsFromPairs, drawOrder, drawPairs, partnerTier, type DrawnPair } from '../../lib/pairing'
import { useTournamentCtx } from '../tournament/tournamentContext'
import styles from './AdminDraw.module.css'
import a from './Admin.module.css'
import { IconRings } from '../../components/icons'
import { DRAW_STEP, easeSlow } from '../../design/motion'
import { humanError } from '../../lib/humanError'

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
  /** The saved draw, in the order the TV reveals it. */
  const saved = drawOrder(snapshot.pairs, pairing)
  // A redraw keeps the honoree's pick unless he picks again.
  const [pick, setPick] = useState<string | null>(() => {
    const mine = honoree && snapshot.pairs.find((p) => p.pickedByHonoree && (p.player1Id === honoree.id || p.player2Id === honoree.id))
    return mine ? (mine.player1Id === honoree.id ? mine.player2Id : mine.player1Id) : null
  })
  /** How many of the saved pairs this phone shows: a draw just made comes out a pair at a time, as on the TV. */
  const [revealed, setRevealed] = useState(Infinity)
  /** Names typed and not yet saved, by pair. */
  const [names, setNames] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [askRedraw, setAskRedraw] = useState(false)
  const timers = useRef<number[]>([])
  const missingTiers = snapshot.players.some((p) => !p.tier)
  const auctionNight = snapshot.tournament.status === 'auction'

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

  async function draw() {
    setAskRedraw(false)
    clearTimers()
    const pairs = drawPairs(snapshot.players, pairing, fixed)
    // Day-1 groups from the drawn pairs (one of each kind per group), keyed by draw index until the server assigns ids.
    const groups = drawGroupsFromPairs(pairs.map((p, i) => ({ id: String(i), kind: p.kind })))
    const times = withTeeTimes('09:00', groups.length)
    const round1Groups = groups.map((idxs, i) => ({
      number: i + 1,
      tee_time: times[i]!,
      start_hole: 1,
      player_ids: idxs.flatMap((k) => {
        const p = pairs[Number(k)]!
        return [p.player1Id, p.player2Id]
      }),
    }))
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    setBusy(true)
    // The list waits for the new draw, so it comes out a pair at a time from its first frame.
    if (!reduced) setRevealed(0)
    try {
      // Saved as it is drawn, nameless; the tournament stays on Calcutta night until «Empezar el torneo».
      await saveDraw(
        tournamentId,
        pairs.map((p) => ({ name: null, player1_id: p.player1Id, player2_id: p.player2Id, kind: p.kind, picked_by_honoree: p.pickedByHonoree })),
        snapshot.rounds.some((r) => r.number === 1) ? round1Groups : null,
        false,
      )
      await reload()
      setNames({})
      toast(D.saved)
      if (reduced) return
      // The first pair at once, then one every DRAW_STEP.
      setRevealed(1)
      for (let n = 2; n <= pairs.length; n++) timers.current.push(window.setTimeout(() => setRevealed(n), DRAW_STEP * 1000 * (n - 1)))
    } catch (e) {
      // Nothing was replaced: the draw on screen is still the saved one.
      setRevealed(Infinity)
      toast(humanError(e))
    } finally {
      setBusy(false)
    }
  }
  function showAll() {
    clearTimers()
    setRevealed(Infinity)
  }

  /** The names typed that differ from what is saved. */
  const renamed = saved.filter((p) => p.id in names && (names[p.id]!.trim() || null) !== (p.name ?? null))
  async function saveNames() {
    for (const p of renamed) await renamePair(p.id, names[p.id]!)
  }
  async function onSaveNames() {
    setBusy(true)
    try {
      await saveNames()
      await reload()
      setNames({})
      toast(D.namesSaved)
    } catch (e) {
      toast(humanError(e))
    } finally {
      setBusy(false)
    }
  }
  async function onStart() {
    setBusy(true)
    try {
      await saveNames()
      await updateTournament(tournamentId, { status: 'live' })
      await reload()
      setNames({})
      toast(D.started)
    } catch (e) {
      toast(humanError(e))
    } finally {
      setBusy(false)
    }
  }

  if (!settings.modules.pairs.enabled) return <EmptyState title={D.title} body={t.live.comingSoon} />

  const shown = saved.slice(0, revealed)
  return (
    <div className={a.screen}>
      <h2>{D.title}</h2>
      <p className={a.help}>{D.hint(settings.modules.pairs.label)}</p>
      {missingTiers && <p className={a.warn}>{D.missingTiers}</p>}

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

      {saved.length > 0 && <p className={a.help}>{D.existing}</p>}
      {/* Once there is a draw, redrawing is the rare thing: the night's next step («Empezar el torneo») is the primary one. */}
      <button className={`btn ${saved.length > 0 ? 'btn--secondary' : 'btn--primary'}`} type="button" disabled={busy || missingTiers || (!!honoree && eligible.length > 0 && !pick)} onClick={() => (saved.length > 0 ? setAskRedraw(true) : void draw())}>
        {busy ? t.common.saving : saved.length > 0 ? D.redraw : D.draw}
      </button>
      <p className={a.help}>
        {D.onTv} <Link to={`/t/${slug}/tv`}>/t/{slug}/tv</Link>
      </p>

      {saved.length > 0 && (
        <section className={a.section}>
          <div className={a.sectionTitle}>
            <strong>{D.names}</strong>
            {revealed < saved.length ? (
              <button className="btn btn--ghost btn--sm" type="button" onClick={showAll}>
                {D.showAll}
              </button>
            ) : (
              <Link className="btn btn--ghost btn--sm" to={`/t/${slug}/admin/grupos`}>
                {t.admin.sections.groups}
              </Link>
            )}
          </div>
          <AnimatePresence initial={false}>
            {shown.map((p) => {
              const both = t.common.andList([name(p.player1Id), name(p.player2Id)])
              return (
                <motion.div key={p.id} className={styles.pairCard} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={easeSlow}>
                  <span className={styles.rings} aria-hidden="true">
                    <IconRings />
                  </span>
                  <Avatar name={name(p.player1Id)} url={byId.get(p.player1Id)?.avatarUrl} size="sm" />
                  <Avatar name={name(p.player2Id)} url={byId.get(p.player2Id)?.avatarUrl} size="sm" />
                  <div className={styles.pairText}>
                    <input className="input" placeholder={D.namePlaceholder(name(p.player1Id), name(p.player2Id))} value={names[p.id] ?? p.name ?? ''} onChange={(e) => setNames({ ...names, [p.id]: e.target.value })} aria-label={D.nameOf(both)} />
                    <span className={a.rowSub}>
                      {both}, {p.kind}
                      {p.pickedByHonoree ? `, ${D.pickedByHonoree}` : ''}
                    </span>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
          {revealed >= saved.length && (
            <div className={a.chipRow}>
              <button className="btn btn--secondary" type="button" disabled={busy || renamed.length === 0} onClick={() => void onSaveNames()}>
                {D.saveNames}
              </button>
              {auctionNight && (
                <button className="btn btn--primary" type="button" disabled={busy} onClick={() => void onStart()}>
                  {D.start}
                </button>
              )}
            </div>
          )}
          {auctionNight && revealed >= saved.length && <p className={a.help}>{D.startHint}</p>}
        </section>
      )}

      <ConfirmSheet open={askRedraw} title={D.redraw} body={D.redrawConfirm} busy={busy} confirmLabel={D.redraw} onConfirm={() => void draw()} onClose={() => setAskRedraw(false)} />
    </div>
  )
}
