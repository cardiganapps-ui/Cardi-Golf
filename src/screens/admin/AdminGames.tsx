/**
 * Comité › Juegos: for every instance game, who plays it (everyone or a
 * list: faces toggle in and out) and, for match games, the matchups. The
 * games themselves are added and configured in Torneo.
 */
import { useState } from 'react'
import { t } from '../../i18n/es-MX'
import { Avatar, Sheet, toast } from '../../components/ui'
import { EmptyState, Segmented } from '../../components/primitives'
import { adminSetAwards, saveSettings, seedGameEntries, setGameEntry, setGameResults } from '../../data/api'
import { CONTEST_SINGLE, type ContestHole, type ContestState } from '../../engine/games/contest'
import { useTournamentCtx } from '../tournament/TournamentGate'
import { useTournament } from '../../data/tournamentStore'
import type { GameConfig, Match } from '../../engine/settings/games'
import type { TournamentSettings } from '../../engine/settings/schema'
import { formatMoney } from '../../lib/money'
import a from './Admin.module.css'
import { humanError } from '../../lib/humanError'

const G = t.admin.games

export function moneyLine(g: GameConfig): string {
  const m = g.money
  if (m.source === 'main') return G.money.main(formatMoney(m.amount))
  if (m.source === 'side') return G.money.side(formatMoney(m.buyIn))
  if (m.source === 'direct') return G.money.direct(formatMoney(m.stake))
  return G.money.none
}

export function AdminGames() {
  const data = useTournament((s) => s.data)!
  const reload = useTournament((s) => s.reload)
  const { snapshot, settings } = data
  const tid = snapshot.tournament.id
  const [busy, setBusy] = useState(false)
  const [matchFor, setMatchFor] = useState<string | null>(null)
  const [awardFor, setAwardFor] = useState<{ gameId: string; hole: ContestHole } | null>(null)
  const { me } = useTournamentCtx()
  const games = settings.games

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    try {
      await fn()
      await reload()
    } catch (e) {
      toast(humanError(e))
    } finally {
      setBusy(false)
    }
  }
  const updateGame = (id: string, fn: (g: GameConfig) => void) => {
    const next: TournamentSettings = structuredClone(settings)
    const g = next.games.find((x) => x.id === id)
    if (!g) return Promise.resolve()
    fn(g)
    return saveSettings(tid, next)
  }

  const setMode = (g: GameConfig, mode: 'all' | 'list') =>
    run(async () => {
      // Switching to a list starts with everyone in it, so the Comité only takes people out.
      if (mode === 'list' && !snapshot.gameEntries.some((e) => e.gameId === g.id)) await seedGameEntries(tid, g.id, snapshot.players.map((p) => p.id))
      await updateGame(g.id, (x) => (x.entrants = mode))
    })

  if (!games.length) {
    return (
      <div className={a.screen}>
        <h2>{t.admin.sections.games}</h2>
        <EmptyState title={t.admin.sections.games} body={G.none} />
      </div>
    )
  }

  return (
    <div className={a.screen}>
      <h2>{t.admin.sections.games}</h2>
      <p className={a.help}>{G.hint}</p>
      {games.map((g) => {
        const entered = new Set(snapshot.gameEntries.filter((e) => e.gameId === g.id).map((e) => e.playerId))
        const count = g.entrants === 'all' ? snapshot.players.length : snapshot.players.filter((p) => entered.has(p.id)).length
        const name = (id: string) => snapshot.players.find((p) => p.id === id)?.displayName ?? '?'
        return (
          <section key={g.id} className={a.section}>
            <div className={a.sectionTitle}>
              <span className={a.rowText}>
                <span className={a.rowTitle}>{g.label}</span>
                <span className={a.rowSub}>{moneyLine(g)}</span>
              </span>
              <span className={a.count}>{G.playing(count, snapshot.players.length)}</span>
            </div>
            <Segmented
              value={g.entrants}
              options={[
                { value: 'all', label: G.everyone },
                { value: 'list', label: G.some },
              ]}
              onChange={(v) => void setMode(g, v)}
              label={G.who}
            />
            {g.entrants === 'list' && (
              <div className={a.tiles} role="group" aria-label={G.who}>
                {snapshot.players.map((p) => {
                  const on = entered.has(p.id)
                  return (
                    <button key={p.id} type="button" aria-pressed={on} className={`${a.tile} ${on ? a.tileOn : ''}`} disabled={busy} onClick={() => void run(() => setGameEntry(tid, g.id, p.id, !on))}>
                      <Avatar name={p.displayName} url={p.avatarUrl} size="sm" />
                      <span className={a.tileText}>{p.displayName}</span>
                    </button>
                  )
                })}
              </div>
            )}
            {g.type === 'contest' && (
              <>
                <span className="label">{G.contestHoles}</span>
                <div className={a.rows}>
                  {((data.state.games[g.id]?.state as ContestState | undefined)?.holes ?? []).map((h) => (
                    <button key={`${h.roundId}-${h.hole}`} type="button" className={a.rowBtn} onClick={() => setAwardFor({ gameId: g.id, hole: h })}>
                      <span className={a.rowText}>
                        <span className={a.rowTitle}>{G.dayHole(h.roundNumber, h.hole)}</span>
                        <span className={h.status === 'disputed' ? a.warn : a.rowSub}>{h.status === 'won' ? t.common.andList(h.winners.map(name)) : h.status === 'disputed' ? G.disputed(t.common.andList(h.claims.map(name))) : G.open}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
            {g.type === 'custom' && <CustomWinners game={g} busy={busy} run={run} />}
            {g.type === 'match' && (
              <>
                <span className="label">{G.matches}</span>
                {g.options.matches.length === 0 && <p className={a.help}>{G.noMatches}</p>}
                <div className={a.rows}>
                  {g.options.matches.map((m) => (
                    <div key={m.id} className={a.row}>
                      <span className={a.rowText}>
                        <span className={a.rowTitle}>
                          {t.common.andList(m.a.map(name))} {G.vs} {t.common.andList(m.b.map(name))}
                        </span>
                      </span>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        disabled={busy}
                        onClick={() => void run(() => updateGame(g.id, (x) => x.type === 'match' && (x.options.matches = x.options.matches.filter((y) => y.id !== m.id))))}
                      >
                        {G.removeMatch}
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button" className="btn btn--secondary btn--sm" disabled={busy} onClick={() => setMatchFor(g.id)}>
                  {G.addMatch}
                </button>
              </>
            )}
          </section>
        )
      })}
      <AwardSheet
        target={awardFor}
        onClose={() => setAwardFor(null)}
        onSave={(ids) =>
          run(async () => {
            await adminSetAwards(awardFor!.hole.roundId, awardFor!.gameId, awardFor!.hole.hole, ids, me.playerId)
            setAwardFor(null)
          })
        }
      />
      <MatchSheet
        game={games.find((g) => g.id === matchFor) ?? null}
        onClose={() => setMatchFor(null)}
        onSave={(m) =>
          run(async () => {
            await updateGame(matchFor!, (x) => x.type === 'match' && x.options.matches.push(m))
            setMatchFor(null)
          })
        }
      />
    </div>
  )
}

function MatchSheet({ game, onClose, onSave }: { game: GameConfig | null; onClose: () => void; onSave: (m: Match) => void }) {
  const data = useTournament((s) => s.data)!
  const [size, setSize] = useState<'1' | '2'>('1')
  const [sideA, setA] = useState<string[]>([])
  const [sideB, setB] = useState<string[]>([])
  const n = Number(size)
  const entrants = game ? (data.state.games[game.id]?.entrants ?? data.snapshot.players.map((p) => p.id)) : []
  const players = data.snapshot.players.filter((p) => entrants.includes(p.id))
  const ok = sideA.length === n && sideB.length === n && !sideA.some((x) => sideB.includes(x))
  const reset = () => {
    setA([])
    setB([])
  }
  const toggle = (side: 'a' | 'b', id: string) => {
    const [cur, set, other] = side === 'a' ? [sideA, setA, sideB] : [sideB, setB, sideA]
    if (cur.includes(id)) set(cur.filter((x) => x !== id))
    else if (!other.includes(id)) set([...cur, id].slice(-n))
  }
  return (
    <Sheet
      open={!!game}
      onClose={() => {
        reset()
        onClose()
      }}
      title={G.addMatch}
    >
      <div className="stack">
        <Segmented
          value={size}
          options={[
            { value: '1', label: G.singles },
            { value: '2', label: G.pairs },
          ]}
          onChange={(v) => {
            setSize(v)
            reset()
          }}
        />
        {(['a', 'b'] as const).map((side) => (
          <div key={side} className="stack">
            <span className="label">{side === 'a' ? G.sideA : G.sideB}</span>
            <div className={a.tiles}>
              {players.map((p) => {
                const cur = side === 'a' ? sideA : sideB
                const other = side === 'a' ? sideB : sideA
                const on = cur.includes(p.id)
                return (
                  <button key={p.id} type="button" aria-pressed={on} className={`${a.tile} ${on ? a.tileOn : ''}`} disabled={other.includes(p.id)} onClick={() => toggle(side, p.id)}>
                    <Avatar name={p.displayName} url={p.avatarUrl} size="sm" />
                    <span className={a.tileText}>{p.displayName}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
        {!ok && <p className="help">{G.incomplete}</p>}
        <button
          type="button"
          className="btn btn--primary"
          disabled={!ok}
          onClick={() => {
            onSave({ id: `m${Date.now().toString(36)}`, a: sideA, b: sideB })
            reset()
          }}
        >
          {G.saveMatch}
        </button>
      </div>
    </Sheet>
  )
}


/** Comité decision for one contest hole: pick the winner(s), "Nadie", or go back to what the groups marked. */
function AwardSheet({ target, onClose, onSave }: { target: { gameId: string; hole: ContestHole } | null; onClose: () => void; onSave: (ids: string[] | null) => void }) {
  const data = useTournament((s) => s.data)!
  const [sel, setSel] = useState<string[] | null>(null)
  const game = target ? data.settings.games.find((g) => g.id === target.gameId) : undefined
  const single = game?.type === 'contest' ? CONTEST_SINGLE[game.options.kind] : true
  const entrants = target ? (data.state.games[target.gameId]?.entrants ?? []) : []
  const players = data.snapshot.players.filter((p) => entrants.includes(p.id))
  const chosen = sel ?? target?.hole.winners ?? []
  const close = () => {
    setSel(null)
    onClose()
  }
  const toggle = (id: string) => setSel(single ? (chosen.includes(id) ? [] : [id]) : chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id])
  return (
    <Sheet open={!!target} onClose={close} title={target ? `${game?.label ?? ''}, ${G.dayHole(target.hole.roundNumber, target.hole.hole)}` : undefined}>
      <div className="stack">
        {target && target.hole.claims.length > 0 && <p className="help">{G.claims(t.common.andList(target.hole.claims.map((id) => data.snapshot.players.find((p) => p.id === id)?.displayName ?? '?')))}</p>}
        <div className={a.tiles}>
          {players.map((p) => (
            <button key={p.id} type="button" aria-pressed={chosen.includes(p.id)} className={`${a.tile} ${chosen.includes(p.id) ? a.tileOn : ''}`} onClick={() => toggle(p.id)}>
              <Avatar name={p.displayName} url={p.avatarUrl} size="sm" />
              <span className={a.tileText}>{p.displayName}</span>
            </button>
          ))}
        </div>
        <div className="row">
          <button type="button" className="btn btn--secondary" onClick={() => onSave(null)}>
            {G.useGroups}
          </button>
          <button
            type="button"
            className="btn btn--primary grow"
            onClick={() => {
              onSave(chosen)
              setSel(null)
            }}
          >
            {chosen.length ? G.saveWinner : G.saveNobody}
          </button>
        </div>
      </div>
    </Sheet>
  )
}

/** Custom bet: the Comité taps the winners and saves. */
function CustomWinners({ game, busy, run }: { game: GameConfig; busy: boolean; run: (fn: () => Promise<void>) => Promise<void> }) {
  const data = useTournament((s) => s.data)!
  const saved = data.snapshot.gameResults.filter((r) => r.gameId === game.id).map((r) => r.playerId)
  const [sel, setSel] = useState<string[] | null>(null)
  const chosen = sel ?? saved
  const entrants = data.state.games[game.id]?.entrants ?? []
  const players = data.snapshot.players.filter((p) => entrants.includes(p.id))
  const dirty = sel !== null && (sel.length !== saved.length || sel.some((x) => !saved.includes(x)))
  return (
    <>
      <span className="label">{G.winners}</span>
      <div className={a.tiles} role="group" aria-label={G.winners}>
        {players.map((p) => {
          const on = chosen.includes(p.id)
          return (
            <button key={p.id} type="button" aria-pressed={on} className={`${a.tile} ${on ? a.tileOn : ''}`} disabled={busy} onClick={() => setSel(on ? chosen.filter((x) => x !== p.id) : [...chosen, p.id])}>
              <Avatar name={p.displayName} url={p.avatarUrl} size="sm" />
              <span className={a.tileText}>{p.displayName}</span>
            </button>
          )
        })}
      </div>
      {dirty && (
        <button
          type="button"
          className="btn btn--primary"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await setGameResults(data.snapshot.tournament.id, game.id, chosen.map((playerId) => ({ playerId, share: 1 })))
              setSel(null)
            })
          }
        >
          {chosen.length ? G.saveWinners(chosen.length) : G.clearWinners}
        </button>
      )}
    </>
  )
}
