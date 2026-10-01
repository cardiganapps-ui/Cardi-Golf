/**
 * Grupos (§13): per round, build and edit groups (members, tee time, start
 * hole). With the pairs module on: generate from the pair standings (§5.5)
 * or randomly for Day 1, and warn when a group is not one pair of each kind.
 * Drafts are local until "Guardar"; leaving the day with a draft asks first.
 */
import { useMemo, useState } from 'react'
import { t } from '../../i18n/es-MX'
import { Avatar, Sheet, toast } from '../../components/ui'
import { EmptyState } from '../../components/primitives'
import { ConfirmSheet } from '../../components/ConfirmSheet'
import { saveGroups } from '../../data/api'
import { withTeeTimes } from '../../lib/teeTimes'
import { useTournament } from '../../data/tournamentStore'
import { generateGroupsFromStandings } from '../../engine/modules/pairs'
import { nextRoundGroups } from '../../engine/formats/bracket'
import type { Group, Round } from '../../engine/types'
import { IconClose } from '../../components/icons'
import a from './Admin.module.css'
import styles from './AdminGroups.module.css'
import { humanError } from '../../lib/humanError'

const G = t.admin.groups
const SEARCH_FROM = 12
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

interface DraftGroup {
  /** Existing group id; kept so tiebreak answers survive an edit. */
  id?: string
  number: number
  teeTime: string
  startHole: number
  playerIds: string[]
}

export function AdminGroups() {
  const data = useTournament((s) => s.data)!
  const reload = useTournament((s) => s.reload)
  const { snapshot, state, settings } = data
  const rounds = snapshot.rounds.filter((r) => r.status !== 'cancelled')
  const [roundId, setRoundId] = useState<string>(snapshot.tournament.currentRoundId ?? rounds[0]?.id ?? '')
  const round = rounds.find((r) => r.id === roundId) ?? null
  const [drafts, setDrafts] = useState<DraftGroup[] | null>(null)
  const [picking, setPicking] = useState<number | null>(null)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [leaveTo, setLeaveTo] = useState<string | null>(null)
  const byId = new Map(snapshot.players.map((p) => [p.id, p]))
  const name = (id: string) => byId.get(id)?.displayName ?? '?'
  const pairsOn = settings.modules.pairs.enabled && snapshot.pairs.length > 0

  const current: DraftGroup[] = useMemo(() => {
    if (drafts) return drafts
    return snapshot.groups
      .filter((g) => g.roundId === roundId)
      .sort((x, y) => x.number - y.number)
      .map((g) => ({ id: g.id, number: g.number, teeTime: g.teeTime?.slice(0, 5) ?? '', startHole: g.startHole, playerIds: g.playerIds }))
  }, [drafts, snapshot.groups, roundId])

  const assigned = useMemo(() => new Set(current.flatMap((g) => g.playerIds)), [current])
  const unassigned = useMemo(() => snapshot.players.filter((p) => !assigned.has(p.id)), [snapshot.players, assigned])

  const warnings = useMemo(() => {
    if (!pairsOn) return []
    const kinds = settings.modules.pairs.pairing.map(([x, y]) => `${x}${y}`)
    return current.map((g) => {
      const inGroup = new Set(g.playerIds)
      const pairs = snapshot.pairs.filter((p) => inGroup.has(p.player1Id) && inGroup.has(p.player2Id))
      if (pairs.length * 2 !== g.playerIds.length) return G.warnIncomplete
      const found = pairs.map((p) => p.kind ?? '').sort().join(',')
      if (kinds.length && found !== [...kinds].sort().join(',')) return G.warnKinds(t.common.plusList(kinds))
      return null
    })
  }, [current, pairsOn, snapshot.pairs, settings.modules.pairs.pairing])

  // The bracket round still waiting for its groups, if there is one.
  const bracketNext = useMemo(() => (state.bracket ? nextRoundGroups(state.bracket) : null), [state.bracket])

  function withTimes(groups: string[][]): DraftGroup[] {
    const times = withTeeTimes(current[0]?.teeTime || '09:00', groups.length)
    return groups.map((ids, i) => ({ number: i + 1, teeTime: times[i]!, startHole: 1, playerIds: ids }))
  }

  function fromStandings() {
    const rows = state.modules.pairs?.rows ?? []
    const perGroup = Math.max(1, Math.floor(settings.groupSize / 2))
    const groups = generateGroupsFromStandings(rows.map((r) => r.pairId), perGroup).map((pairIds) =>
      pairIds.flatMap((pid) => {
        const p = snapshot.pairs.find((x) => x.id === pid)!
        return [p.player1Id, p.player2Id]
      }),
    )
    setDrafts(withTimes(groups))
  }

  function randomPairs() {
    const byKind = new Map<string, string[]>()
    for (const p of snapshot.pairs) byKind.set(p.kind ?? '', [...(byKind.get(p.kind ?? '') ?? []), p.id])
    const lists = [...byKind.values()].map((l) => l.sort(() => Math.random() - 0.5))
    const n = Math.max(...lists.map((l) => l.length))
    const groups: string[][] = []
    for (let i = 0; i < n; i++) {
      const ids = lists.flatMap((l) => (l[i] ? [l[i]!] : []))
      groups.push(
        ids.flatMap((pid) => {
          const p = snapshot.pairs.find((x) => x.id === pid)!
          return [p.player1Id, p.player2Id]
        }),
      )
    }
    setDrafts(withTimes(groups))
  }

  /**
   * Match play: the groups ARE the bracket, so the next round's groups are
   * whoever won. It writes only the round the bracket is waiting on, so the
   * Comité cannot accidentally draw a semifinal before the quarters are in.
   */
  function fromBracket() {
    const next = state.bracket ? nextRoundGroups(state.bracket) : null
    if (!next) {
      toast(t.bracket.noNextRound)
      return
    }
    setDrafts(withTimes(next.groups))
  }

  function randomPlayers() {
    const ids = snapshot.players.map((p) => p.id).sort(() => Math.random() - 0.5)
    const groups: string[][] = []
    for (let i = 0; i < ids.length; i += settings.groupSize) groups.push(ids.slice(i, i + settings.groupSize))
    setDrafts(withTimes(groups))
  }

  const update = (i: number, patch: Partial<DraftGroup>) => setDrafts(current.map((g, j) => (j === i ? { ...g, ...patch } : g)))
  const addGroup = () => setDrafts([...current, { number: current.length + 1, teeTime: '', startHole: 1, playerIds: [] }])
  const removeGroup = (i: number) => setDrafts(current.filter((_, j) => j !== i).map((g, j) => ({ ...g, number: j + 1 })))
  const togglePlayer = (gi: number, pid: string) => {
    const next = current.map((g) => ({ ...g, playerIds: g.playerIds.filter((x) => x !== pid) }))
    const g = next[gi]!
    if (!current[gi]!.playerIds.includes(pid)) g.playerIds = [...g.playerIds, pid]
    setDrafts(next)
  }

  function switchRound(id: string) {
    if (drafts && id !== roundId) {
      setLeaveTo(id)
      return
    }
    setRoundId(id)
    setDrafts(null)
  }

  async function save() {
    if (!round) return
    setBusy(true)
    try {
      await saveGroups(round.id, current.map((g) => ({ id: g.id, number: g.number, tee_time: g.teeTime || null, start_hole: g.startHole, player_ids: g.playerIds })))
      await reload()
      setDrafts(null)
      toast(t.common.saved)
    } catch (e) {
      toast(humanError(e))
    } finally {
      setBusy(false)
    }
  }

  // Picker: unassigned first, then the rest, filtered by the search.
  const pickList = useMemo(() => {
    const needle = norm(q.trim())
    const list = [...unassigned, ...snapshot.players.filter((p) => assigned.has(p.id))]
    return needle ? list.filter((p) => norm(p.displayName).includes(needle) || norm(p.fullName).includes(needle)) : list
  }, [q, snapshot.players, assigned, unassigned])

  return (
    <div className={a.screen}>
      <div className={a.head}>
        <h2>{t.admin.sections.groups}</h2>
        {drafts && <span className={a.unsaved}>{G.unsavedChip}</span>}
      </div>
      {rounds.length === 0 && <EmptyState title={t.admin.sections.groups} body={t.admin.rounds.empty} />}
      {rounds.length > 0 && (
        <div className="segmented" role="tablist">
          {rounds.map((r: Round) => (
            <button key={r.id} type="button" role="tab" aria-selected={r.id === roundId} onClick={() => switchRound(r.id)}>
              {t.round.day(r.number)}
            </button>
          ))}
        </div>
      )}
      {round && (
        <>
          <div className={styles.actions}>
            {pairsOn && state.modules.pairs && round.number > 1 && (
              <button className="btn btn--secondary btn--sm" type="button" onClick={fromStandings}>
                {G.fromStandings}
              </button>
            )}
            {pairsOn && (
              <button className="btn btn--secondary btn--sm" type="button" onClick={randomPairs}>
                {G.randomPairs}
              </button>
            )}
            {bracketNext && (
              <button className="btn btn--secondary btn--sm" type="button" onClick={fromBracket}>
                {t.bracket.nextRound(bracketNext.round.name)}
              </button>
            )}
            <button className="btn btn--secondary btn--sm" type="button" onClick={randomPlayers}>
              {G.randomPlayers}
            </button>
            <button className="btn btn--ghost btn--sm" type="button" onClick={addGroup}>
              + {G.addGroup}
            </button>
          </div>
          {pairsOn && round.number > 1 && <p className={a.help}>{G.standingsHint}</p>}

          <div className={styles.groups}>
            {current.map((g, i) => (
              <section key={i} className={`${a.section} ${warnings[i] ? styles.groupWarn : ''}`}>
                <div className={a.sectionTitle}>
                  <span className={a.rowText}>
                    <strong>
                      {t.card.group} {g.number}
                    </strong>
                    <span className={a.rowSub}>{G.members(g.playerIds.length, settings.groupSize)}</span>
                  </span>
                  <span className={styles.groupControls}>
                    <input className={`input ${styles.time}`} type="time" value={g.teeTime} onChange={(e) => update(i, { teeTime: e.target.value })} aria-label={G.teeTime} />
                    <select className={`select ${styles.start}`} value={g.startHole} onChange={(e) => update(i, { startHole: Number(e.target.value) })} aria-label={G.startHole}>
                      <option value={1}>{G.startAt(1)}</option>
                      <option value={10}>{G.startAt(10)}</option>
                    </select>
                    <button className="btn btn--ghost btn--sm" type="button" onClick={() => removeGroup(i)} aria-label={`${t.common.delete} ${t.card.group} ${g.number}`}>
                      <IconClose />
                    </button>
                  </span>
                </div>
                <div className={a.rows}>
                  {g.playerIds.map((pid) => (
                    <div key={pid} className={`${a.row} ${styles.member}`}>
                      <Avatar name={name(pid)} url={byId.get(pid)?.avatarUrl} size="sm" />
                      <span className={a.rowText} style={{ flex: 1 }}>
                        <span className={a.rowTitle}>{name(pid)}</span>
                        {byId.get(pid)?.tier && <span className={a.rowSub}>{byId.get(pid)!.tier}</span>}
                      </span>
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => togglePlayer(i, pid)} aria-label={`${t.common.delete} ${name(pid)}`}>
                        <IconClose />
                      </button>
                    </div>
                  ))}
                  <button type="button" className={`${a.row} ${a.rowBtn}`} onClick={() => { setQ(''); setPicking(i) }}>
                    <span className="btn btn--ghost btn--sm">+ {G.addPlayer}</span>
                  </button>
                </div>
                {warnings[i] && <p className={a.warn}>{warnings[i]}</p>}
              </section>
            ))}
          </div>
          {unassigned.length > 0 && <p className={a.warn}>{G.unassigned(unassigned.map((p) => p.displayName).join(', '))}</p>}
          <div className={a.sticky}>
            <button className="btn btn--primary btn--block" type="button" disabled={busy || !drafts} onClick={() => void save()}>
              {busy ? t.common.saving : t.common.save}
            </button>
          </div>
        </>
      )}

      <ConfirmSheet
        open={!!leaveTo}
        title={G.unsavedChip}
        body={G.discardDrafts}
        danger
        confirmLabel={t.common.confirm}
        onConfirm={() => {
          if (leaveTo) {
            setRoundId(leaveTo)
            setDrafts(null)
          }
          setLeaveTo(null)
        }}
        onClose={() => setLeaveTo(null)}
      />

      <Sheet open={picking != null} onClose={() => setPicking(null)} title={G.addPlayer}>
        <div className="stack">
          {snapshot.players.length > SEARCH_FROM && <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.admin.players.search} aria-label={t.admin.players.search} autoFocus />}
          <div className={a.rows}>
            {pickList.map((p) => {
              const inGroup = current.findIndex((g) => g.playerIds.includes(p.id))
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`${a.row} ${a.rowBtn}`}
                  onClick={() => {
                    if (picking != null) togglePlayer(picking, p.id)
                    setPicking(null)
                  }}
                >
                  <Avatar name={p.displayName} url={p.avatarUrl} />
                  <span className={a.rowText}>
                    <span className={a.rowTitle}>{p.displayName}</span>
                    <span className={a.rowSub}>
                      {p.tier ?? ''}
                      {p.tier && inGroup >= 0 ? ', ' : ''}
                      {inGroup >= 0 ? `${t.card.group} ${current[inGroup]!.number}` : G.unassignedFirst.toLowerCase()}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </Sheet>
    </div>
  )
}

export type { Group }
