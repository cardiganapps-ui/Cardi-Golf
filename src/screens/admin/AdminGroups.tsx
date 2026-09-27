/**
 * Grupos (§13): per round, build and edit groups (members, tee time, start
 * hole). With the pairs module on: generate from the pair standings
 * (§5.5) or randomly for Day 1, and warn when a group is not one pair of
 * each kind.
 */
import { useMemo, useState } from 'react'
import { t } from '../../i18n/es-MX'
import { Avatar, Sheet, toast } from '../../components/ui'
import { replaceGroups } from '../../data/api'
import { useTournament } from '../../data/tournamentStore'
import { generateGroupsFromStandings } from '../../engine/modules/pairs'
import type { Group, Round } from '../../engine/types'
import { IconClose } from '../../components/icons'

const G = t.admin.groups

interface DraftGroup {
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
  const [busy, setBusy] = useState(false)
  const byId = new Map(snapshot.players.map((p) => [p.id, p]))
  const name = (id: string) => byId.get(id)?.displayName ?? '?'
  const pairsOn = settings.modules.pairs.enabled && snapshot.pairs.length > 0

  const current: DraftGroup[] = useMemo(() => {
    if (drafts) return drafts
    return snapshot.groups
      .filter((g) => g.roundId === roundId)
      .sort((a, b) => a.number - b.number)
      .map((g) => ({ number: g.number, teeTime: g.teeTime?.slice(0, 5) ?? '', startHole: g.startHole, playerIds: g.playerIds }))
  }, [drafts, snapshot.groups, roundId])

  const assigned = new Set(current.flatMap((g) => g.playerIds))
  const unassigned = snapshot.players.filter((p) => !assigned.has(p.id))

  const warnings = useMemo(() => {
    if (!pairsOn) return []
    const kinds = settings.modules.pairs.pairing.map(([a, b]) => `${a}${b}`)
    return current.map((g) => {
      const inGroup = new Set(g.playerIds)
      const pairs = snapshot.pairs.filter((p) => inGroup.has(p.player1Id) && inGroup.has(p.player2Id))
      if (pairs.length * 2 !== g.playerIds.length) return G.warnIncomplete
      const found = pairs.map((p) => p.kind ?? '').sort().join(',')
      if (kinds.length && found !== [...kinds].sort().join(',')) return G.warnKinds(kinds.join(' + '))
      return null
    })
  }, [current, pairsOn, snapshot.pairs, settings.modules.pairs.pairing])

  function withTimes(groups: string[][]): DraftGroup[] {
    const first = current[0]?.teeTime || '09:00'
    const [h, m] = first.split(':').map(Number)
    return groups.map((ids, i) => {
      const mins = (h ?? 9) * 60 + (m ?? 0) + i * 10
      return { number: i + 1, teeTime: `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`, startHole: 1, playerIds: ids }
    })
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
    // One pair of each kind per group, kinds drawn at random (§5.5 Day 1).
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

  function randomPlayers() {
    const ids = snapshot.players.map((p) => p.id).sort(() => Math.random() - 0.5)
    const groups: string[][] = []
    for (let i = 0; i < ids.length; i += settings.groupSize) groups.push(ids.slice(i, i + settings.groupSize))
    setDrafts(withTimes(groups))
  }

  const update = (i: number, patch: Partial<DraftGroup>) => {
    const next = current.map((g, j) => (j === i ? { ...g, ...patch } : g))
    setDrafts(next)
  }
  const addGroup = () => setDrafts([...current, { number: current.length + 1, teeTime: '', startHole: 1, playerIds: [] }])
  const removeGroup = (i: number) => setDrafts(current.filter((_, j) => j !== i).map((g, j) => ({ ...g, number: j + 1 })))
  const togglePlayer = (gi: number, pid: string) => {
    const next = current.map((g) => ({ ...g, playerIds: g.playerIds.filter((x) => x !== pid) }))
    const g = next[gi]!
    if (!current[gi]!.playerIds.includes(pid)) g.playerIds = [...g.playerIds, pid]
    setDrafts(next)
  }

  async function save() {
    if (!round) return
    setBusy(true)
    try {
      await replaceGroups(round.id, current.map((g) => ({ number: g.number, tee_time: g.teeTime || null, start_hole: g.startHole, player_ids: g.playerIds })))
      await reload()
      setDrafts(null)
      toast(t.common.saved)
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <h2>{t.admin.sections.groups}</h2>
      {rounds.length === 0 && <p className="muted">{t.admin.rounds.empty}</p>}
      <div className="segmented" role="tablist">
        {rounds.map((r: Round) => (
          <button key={r.id} type="button" role="tab" aria-selected={r.id === roundId} onClick={() => { setRoundId(r.id); setDrafts(null) }}>
            {t.round.day(r.number)}
          </button>
        ))}
      </div>
      {round && (
        <>
          <div className="row row--wrap">
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
            <button className="btn btn--secondary btn--sm" type="button" onClick={randomPlayers}>
              {G.randomPlayers}
            </button>
            <button className="btn btn--ghost btn--sm" type="button" onClick={addGroup}>
              + {G.addGroup}
            </button>
          </div>
          {pairsOn && round.number > 1 && <p className="help">{G.standingsHint}</p>}

          {current.map((g, i) => (
            <div key={i} className="card stack" style={{ padding: 12, borderLeft: warnings[i] ? '4px solid var(--coral)' : undefined }}>
              <div className="row row--between">
                <strong>
                  {t.card.group} {g.number}
                </strong>
                <div className="row">
                  <input className="input input--sm" type="time" value={g.teeTime} onChange={(e) => update(i, { teeTime: e.target.value })} style={{ width: 110 }} aria-label={G.teeTime} />
                  <select className="select input--sm" value={g.startHole} onChange={(e) => update(i, { startHole: Number(e.target.value) })} style={{ width: 'auto' }} aria-label={G.startHole}>
                    <option value={1}>{G.startAt(1)}</option>
                    <option value={10}>{G.startAt(10)}</option>
                  </select>
                  <button className="btn btn--ghost btn--sm coral" type="button" onClick={() => removeGroup(i)} aria-label={t.common.delete}>
                    <IconClose />
                  </button>
                </div>
              </div>
              <div className="row row--wrap">
                {g.playerIds.map((pid) => (
                  <button key={pid} type="button" className="chip" onClick={() => togglePlayer(i, pid)} title={t.common.delete}>
                    <Avatar name={name(pid)} url={byId.get(pid)?.avatarUrl} size="sm" />
                    {name(pid)} {byId.get(pid)?.tier ? `(${byId.get(pid)!.tier})` : ''} <IconClose size={14} />
                  </button>
                ))}
                <button type="button" className="chip chip--outline" onClick={() => setPicking(i)}>
                  + {G.addPlayer}
                </button>
              </div>
              {warnings[i] && <p className="help coral">{warnings[i]}</p>}
            </div>
          ))}
          {unassigned.length > 0 && <p className="help coral">{G.unassigned(unassigned.map((p) => p.displayName).join(', '))}</p>}
          <div style={{ position: 'sticky', bottom: 12 }}>
            <button className="btn btn--primary btn--block" type="button" disabled={busy || !drafts} onClick={() => void save()}>
              {busy ? t.common.saving : t.common.save}
            </button>
          </div>
        </>
      )}

      <Sheet open={picking != null} onClose={() => setPicking(null)} title={G.addPlayer}>
        <div className="list">
          {snapshot.players.map((p) => {
            const inGroup = current.findIndex((g) => g.playerIds.includes(p.id))
            return (
              <button
                key={p.id}
                type="button"
                className="listItem"
                onClick={() => {
                  if (picking != null) togglePlayer(picking, p.id)
                  setPicking(null)
                }}
              >
                <Avatar name={p.displayName} url={p.avatarUrl} />
                <span className="grow">
                  <strong>{p.displayName}</strong>
                  <span className="help" style={{ display: 'block' }}>
                    {p.tier ?? ''} {inGroup >= 0 ? `· ${t.card.group} ${current[inGroup]!.number}` : ''}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </Sheet>
    </div>
  )
}

export type { Group }
