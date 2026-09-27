/**
 * Matrimonios draw (§10): the honoree picks his partner from the eligible
 * tier, the rest is drawn with a rings animation, pairs name themselves,
 * and Day 1 groups are generated (one pair of each kind per group).
 */
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { t } from '../../i18n/es-MX'
import { Avatar, toast } from '../../components/ui'
import { replaceGroups, replacePairs, updateTournament } from '../../data/api'
import { useTournament } from '../../data/tournamentStore'
import { drawGroupsFromPairs, drawPairs, partnerTier, type DrawnPair } from '../../lib/pairing'
import { useTournamentCtx } from '../tournament/TournamentGate'
import styles from './AdminDraw.module.css'

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
  const missingTiers = snapshot.players.some((p) => !p.tier)

  const fixed = useMemo((): DrawnPair[] => {
    if (!honoree || !pick) return []
    const kind = pairing.find(([a, b]) => (a === honoree.tier && b === eligibleTier) || (b === honoree.tier && a === eligibleTier))
    return [{ player1Id: honoree.id, player2Id: pick, kind: kind ? `${kind[0]}${kind[1]}` : '?', pickedByHonoree: true }]
  }, [honoree, pick, pairing, eligibleTier])

  function draw() {
    const pairs = drawPairs(snapshot.players, pairing, fixed)
    setDrawn(pairs)
    setNames({})
    setRevealed(0)
    // Reveal one pair at a time (rings animation).
    pairs.forEach((_, i) => setTimeout(() => setRevealed(i + 1), 700 * (i + 1)))
  }

  async function save() {
    if (!drawn) return
    setBusy(true)
    try {
      await replacePairs(
        tournamentId,
        drawn.map((p, i) => ({ name: names[i]?.trim() || null, player1_id: p.player1Id, player2_id: p.player2Id, kind: p.kind, picked_by_honoree: p.pickedByHonoree })),
      )
      await reload()
      // Day 1 groups from the freshly saved pairs.
      const fresh = useTournament.getState().data!.snapshot
      const round1 = fresh.rounds.find((r) => r.number === 1)
      if (round1) {
        const groups = drawGroupsFromPairs(fresh.pairs)
        await replaceGroups(
          round1.id,
          groups.map((pairIds, i) => ({
            number: i + 1,
            tee_time: `09:${String(i * 10).padStart(2, '0')}`,
            start_hole: 1,
            player_ids: pairIds.flatMap((pid) => {
              const p = fresh.pairs.find((x) => x.id === pid)!
              return [p.player1Id, p.player2Id]
            }),
          })),
        )
      }
      if (fresh.tournament.status === 'auction') await updateTournament(tournamentId, { status: 'live' })
      await reload()
      setDrawn(null)
      toast(D.saved)
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (!settings.modules.pairs.enabled) return <p className="muted">{t.live.comingSoon}</p>

  return (
    <div className="stack stack--lg">
      <h2>{D.title}</h2>
      <p className="help">{D.hint(settings.modules.pairs.label)}</p>
      {missingTiers && <p className="help coral">{D.missingTiers}</p>}
      {snapshot.pairs.length > 0 && !drawn && (
        <div className="card card--cell stack" style={{ padding: 12 }}>
          <p className="help">{D.existing}</p>
          {snapshot.pairs.map((p) => (
            <div key={p.id} className="row small">
              <strong>{p.name ?? `${name(p.player1Id)} & ${name(p.player2Id)}`}</strong>
              <span className="help">
                {name(p.player1Id)} & {name(p.player2Id)} · {p.kind}
                {p.pickedByHonoree ? ' · 👑' : ''}
              </span>
            </div>
          ))}
          <Link className="btn btn--ghost btn--sm" to={`/t/${slug}/admin/grupos`}>
            {t.admin.sections.groups}
          </Link>
        </div>
      )}

      {honoree ? (
        <section className="stack">
          <h3>
            👑 {D.honoreePicks(honoree.displayName)} ({eligibleTier ?? '?'})
          </h3>
          <div className={styles.grid}>
            {eligible.map((p) => (
              <button key={p.id} type="button" className={`${styles.face} ${pick === p.id ? styles.faceOn : ''}`} onClick={() => setPick(p.id)}>
                <Avatar name={p.displayName} url={p.avatarUrl} />
                <span className="small">{p.displayName}</span>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <p className="help">{D.noHonoree}</p>
      )}

      <button className="btn btn--primary" type="button" disabled={missingTiers || (!!honoree && eligible.length > 0 && !pick)} onClick={draw}>
        {D.rings} {drawn ? D.redraw : D.draw}
      </button>

      {drawn && (
        <section className="stack">
          <span className="label">{D.names}</span>
          <AnimatePresence>
            {drawn.slice(0, revealed).map((p, i) => (
              <motion.div key={`${p.player1Id}${p.player2Id}`} className={`card ${styles.pairCard}`} initial={{ opacity: 0, scale: 0.8, rotate: -6 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }}>
                <span className={styles.rings} aria-hidden="true">
                  💍
                </span>
                <Avatar name={name(p.player1Id)} url={byId.get(p.player1Id)?.avatarUrl} />
                <Avatar name={name(p.player2Id)} url={byId.get(p.player2Id)?.avatarUrl} />
                <div className="grow">
                  <input className="input input--sm" placeholder={D.namePlaceholder(name(p.player1Id), name(p.player2Id))} value={names[i] ?? ''} onChange={(e) => setNames({ ...names, [i]: e.target.value })} />
                  <span className="help">
                    {name(p.player1Id)} & {name(p.player2Id)} · {p.kind}
                    {p.pickedByHonoree ? ' · 👑' : ''}
                  </span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {revealed >= drawn.length && (
            <button className="btn btn--primary btn--block" type="button" disabled={busy} onClick={() => void save()}>
              {busy ? t.common.saving : D.save}
            </button>
          )}
        </section>
      )}
    </div>
  )
}
