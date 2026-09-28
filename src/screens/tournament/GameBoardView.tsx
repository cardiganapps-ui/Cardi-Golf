/**
 * Any instance game (skins, matches, pots...) rendered from the engine's
 * generic `GameBoard`: a table per section, the notes, and every peso the
 * game moves with its "¿Cómo se calculó?".
 */
import { t } from '../../i18n/es-MX'
import { HowCalculated } from '../../components/HowCalculated'
import { Money } from '../../components/primitives'
import { useTournament } from '../../data/tournamentStore'
import type { GameResultState } from '../../engine/games/game'
import { formatMoney } from '../../lib/money'
import styles from './GamesScreen.module.css'

export function gameStake(g: GameResultState): { text: string; amount?: number } {
  const m = g.config.money
  if (m.source === 'side') return { text: t.games.sidePot, amount: g.pot }
  if (m.source === 'main') return { text: t.games.fromMain, amount: g.pot }
  if (m.source === 'direct') return { text: t.games.perBet(formatMoney(m.stake)), amount: m.stake }
  return { text: t.games.justForFun }
}

export function gameLeader(g: GameResultState, name: (id: string) => string): string {
  const row = g.board.sections[0]?.rows[0]
  if (!row) return t.games.noResults
  const who = row.playerIds.map(name).join(' y ')
  if (row.title) return `${row.title}: ${who ? `${who}, ` : ''}${row.figure.toLowerCase()}`
  return t.games.leader(who, row.label ? `${row.label} ${row.figure}` : row.figure)
}

export function GameBoardView({ gameId, onOpen }: { gameId: string; onOpen: (playerId: string) => void }) {
  const data = useTournament((s) => s.data)
  if (!data) return null
  const g = data.state.games[gameId]
  const byId = new Map(data.snapshot.players.map((p) => [p.id, p]))
  const name = (id: string) => byId.get(id)?.displayName ?? '?'
  if (!g) return <p className="help">{t.games.outdated}</p>
  const prizes = data.state.prizes.filter((p) => p.gameId === gameId)
  const total = data.snapshot.players.length
  return (
    <div className={styles.section}>
      {g.entrants.length < total && <p className="help">{t.games.notEntered(g.entrants.length, total)}</p>}
      {g.board.sections.map((sec, i) =>
        sec.rows.length === 0 ? null : (
          <div key={i} className={styles.section}>
            {sec.title && <h3>{sec.title}</h3>}
            <div className={styles.rows}>
              {sec.rows.map((r, j) => (
                <LeaderLine key={j} row={r} name={name} onOpen={onOpen} />
              ))}
            </div>
          </div>
        ),
      )}
      {g.board.notes.map((n, i) => (
        <p key={i} className="help">
          {n}
        </p>
      ))}
      {prizes.length > 0 && (
        <>
          <h3>{t.games.moneyOfGame}</h3>
          <div className={styles.rows}>
            {prizes.map((p, i) => (
              <div key={i} className={styles.rowLine}>
                <span className={styles.rowText}>
                  <strong>{p.payerId ? `${name(p.payerId)} → ${name(p.playerId)}` : name(p.playerId)}</strong>
                  <span className={styles.rowSub}>
                    {p.label}
                    {!p.final ? `, ${t.money.ifEndedNow}` : ''}
                  </span>
                </span>
                <HowCalculated why={p.why} label={formatMoney(p.amount)} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function LeaderLine({ row, name, onOpen }: { row: GameResultState['board']['sections'][number]['rows'][number]; name: (id: string) => string; onOpen: (id: string) => void }) {
  const names = row.playerIds.map(name).join(' y ')
  const sub = [row.title ? names : null, row.label, row.sub].filter(Boolean).join(' · ')
  return (
    <button type="button" className={styles.gameRow} onClick={() => row.playerIds[0] && onOpen(row.playerIds[0])}>
      <span className={styles.gameText}>
        <span className={styles.gameLabel}>
          {row.pos ? `${row.pos}  ` : ''}
          {row.title ?? names}
        </span>
        {sub && <span className={styles.gameLeader}>{sub}</span>}
      </span>
      <span className={styles.gameStake}>
        <strong className="num">{row.figure}</strong>
        {row.money ? (
          <span>
            <Money amount={row.money} signed={row.money < 0} />
          </span>
        ) : null}
      </span>
    </button>
  )
}
