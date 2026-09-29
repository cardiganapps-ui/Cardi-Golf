/**
 * Equipos: the team draw for a team format (scramble, best ball, shamble).
 *
 * Separate from Parejas, which belongs to the pairs game and draws by tier.
 * A team format's teams can be any size and there are usually no tiers, so
 * what evens them out is the handicap — hence the snake draft in
 * `lib/pairing.ts` and the totals shown next to each team, which are the
 * whole point: an organizer should be able to see the draw is fair before
 * saving it.
 */
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { t } from '../../i18n/es-MX'
import { Avatar, Segmented, toast } from '../../components/ui'
import { EmptyState } from '../../components/primitives'
import { ConfirmSheet } from '../../components/ConfirmSheet'
import { saveTeams } from '../../data/api'
import { withTeeTimes } from '../../lib/teeTimes'
import { useTournament } from '../../data/tournamentStore'
import { drawTeams, groupsFromTeams, type DrawnTeam } from '../../lib/pairing'
import { useTournamentCtx } from '../tournament/TournamentGate'
import styles from './AdminDraw.module.css'
import a from './Admin.module.css'
import { IconRings } from '../../components/icons'
import { easeSlow } from '../../design/motion'

const E = t.teams
const SIZES = ['2', '3', '4']

export function AdminTeams() {
  const data = useTournament((s) => s.data)!
  const reload = useTournament((s) => s.reload)
  const { tournamentId, slug } = useTournamentCtx()
  const { snapshot, settings } = data
  const byId = new Map(snapshot.players.map((p) => [p.id, p]))
  const name = (id: string) => byId.get(id)?.displayName ?? '?'
  const teamMode = settings.modules.individual.formatOptions.teamMode
  const [size, setSize] = useState(teamMode === 'scramble' ? '4' : '2')
  const [drawn, setDrawn] = useState<DrawnTeam[] | null>(null)
  const [names, setNames] = useState<Record<number, string>>({})
  const [revealed, setRevealed] = useState(0)
  const [busy, setBusy] = useState(false)
  const [askSave, setAskSave] = useState(false)
  const timers = useRef<number[]>([])

  const clearTimers = () => {
    for (const id of timers.current) window.clearTimeout(id)
    timers.current = []
  }
  useEffect(() => clearTimers, [])

  // The spread between the strongest and weakest team: what the draw evens out.
  const spread = useMemo(() => {
    if (!drawn?.length) return null
    const totals = drawn.map((x) => x.totalHcp)
    return Math.round((Math.max(...totals) - Math.min(...totals)) * 10) / 10
  }, [drawn])

  function draw() {
    clearTimers()
    const teams = drawTeams(snapshot.players, Number(size))
    setDrawn(teams)
    setNames({})
    setRevealed(0)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setRevealed(teams.length)
      return
    }
    teams.forEach((_, i) => timers.current.push(window.setTimeout(() => setRevealed(i + 1), 450 * (i + 1))))
  }
  function showAll() {
    clearTimers()
    if (drawn) setRevealed(drawn.length)
  }

  async function save() {
    if (!drawn) return
    setBusy(true)
    try {
      await saveTeams(
        tournamentId,
        drawn.map((team, i) => ({ name: names[i]?.trim() || null, player_ids: team.playerIds })),
      )
      await reload()
      setDrawn(null)
      setAskSave(false)
      toast(E.saved)
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (settings.modules.individual.format !== 'team') return <EmptyState title={E.title} body={E.notTeamFormat} />

  // What the round's groups would look like, so nobody is surprised later.
  const preview = drawn ? groupsFromTeams(drawn) : []
  const times = withTeeTimes('09:00', preview.length)

  return (
    <div className={a.screen}>
      <h2>{E.title}</h2>
      <p className={a.help}>{E.hint}</p>

      {snapshot.teams.length > 0 && !drawn && (
        <section className={a.section}>
          <div className={a.sectionTitle}>
            <strong>{E.existing}</strong>
            <Link className="btn btn--ghost btn--sm" to={`/t/${slug}/admin/grupos`}>
              {t.admin.sections.groups}
            </Link>
          </div>
          <div className={a.rows}>
            {snapshot.teams.map((team) => (
              <div key={team.id} className={a.row}>
                <span className={a.rowText}>
                  <span className={a.rowTitle}>{team.name ?? E.unnamed(team.number)}</span>
                  <span className={a.rowSub}>{team.playerIds.map(name).join(', ')}</span>
                </span>
                <span className="small">{E.hcpTotal(Math.round(team.playerIds.reduce((s, id) => s + (byId.get(id)?.baseHcp ?? 0), 0) * 10) / 10)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className={a.section}>
        <div className={a.sectionTitle}>
          <strong>{E.size}</strong>
        </div>
        <Segmented value={size} options={SIZES.map((n) => ({ value: n, label: E.sizeOption(Number(n)) }))} onChange={setSize} label={E.size} />
        <p className={a.help}>{E.sizeHint(snapshot.players.length, Math.ceil(snapshot.players.length / Number(size)))}</p>
      </section>

      <button className="btn btn--primary" type="button" disabled={snapshot.players.length < Number(size)} onClick={draw}>
        {drawn ? E.redraw : E.draw}
      </button>

      {drawn && (
        <section className={a.section}>
          <div className={a.sectionTitle}>
            <strong>{E.names}</strong>
            {revealed < drawn.length && (
              <button className="btn btn--ghost btn--sm" type="button" onClick={showAll}>
                {t.draw.showAll}
              </button>
            )}
          </div>
          {revealed >= drawn.length && spread != null && <p className={a.help}>{E.spread(spread)}</p>}
          <AnimatePresence>
            {drawn.slice(0, revealed).map((team, i) => (
              <motion.div key={team.playerIds.join('-')} className={styles.pairCard} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={easeSlow}>
                <span className={styles.rings} aria-hidden="true">
                  <IconRings />
                </span>
                {team.playerIds.map((id) => (
                  <Avatar key={id} name={name(id)} url={byId.get(id)?.avatarUrl} size="sm" />
                ))}
                <div className={styles.pairText}>
                  <input
                    className="input"
                    placeholder={E.unnamed(i + 1)}
                    value={names[i] ?? ''}
                    onChange={(e) => setNames({ ...names, [i]: e.target.value })}
                    aria-label={E.names}
                  />
                  {/* The total first: it is the point of the draw, and a long
                      roster truncates whatever follows it. */}
                  <span className={a.rowSub}>
                    {E.hcpTotal(Math.round(team.totalHcp * 10) / 10)} · {team.playerIds.map(name).join(', ')}
                  </span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {revealed >= drawn.length && (
            <>
              <p className={a.help}>{E.groupsPreview(preview.length, times[0] ?? '09:00')}</p>
              <button className="btn btn--primary btn--block" type="button" disabled={busy} onClick={() => setAskSave(true)}>
                {E.save}
              </button>
            </>
          )}
        </section>
      )}

      <ConfirmSheet open={askSave} title={E.save} body={E.saveConfirm} busy={busy} confirmLabel={E.save} onConfirm={() => void save()} onClose={() => setAskSave(false)} />
    </div>
  )
}
