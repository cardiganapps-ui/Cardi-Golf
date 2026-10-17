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
import { useCurrency, useWords } from '../../components/currency'

export function GameBoardView({ gameId, onOpen }: { gameId: string; onOpen: (playerId: string) => void }) {
  const cur = useCurrency()
  const words = useWords()
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
            {sec.title && <h2 className="h3">{words(sec.title)}</h2>}
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
          {words(n)}
        </p>
      ))}
      {prizes.length > 0 && (
        <>
          <h2 className="h3">{t.games.moneyOfGame}</h2>
          <div className={styles.rows}>
            {prizes.map((p, i) => (
              <div key={i} className={styles.rowLine}>
                <span className={styles.rowText}>
                  <strong>{p.payerId ? t.moneyScreen.payText(t.moneyScreen.payWords(name(p.payerId), name(p.playerId))) : name(p.playerId)}</strong>
                  <span className={styles.rowSub}>
                    {words(p.label)}
                    {!p.final ? `, ${t.money.ifEndedNow}` : ''}
                  </span>
                </span>
                <HowCalculated why={p.why} label={formatMoney(p.amount, cur)} about={`${p.payerId ? t.moneyScreen.payText(t.moneyScreen.payWords(name(p.payerId), name(p.playerId))) : name(p.playerId)}, ${words(p.label)}`} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function LeaderLine({ row, name, onOpen }: { row: GameResultState['board']['sections'][number]['rows'][number]; name: (id: string) => string; onOpen: (id: string) => void }) {
  const words = useWords()
  const names = t.common.andList(row.playerIds.map(name))
  const sub = [row.title ? names : null, row.label ? words(row.label) : null, row.sub ? words(row.sub) : null].filter(Boolean).join(', ')
  return (
    <button type="button" className={styles.gameRow} onClick={() => row.playerIds[0] && onOpen(row.playerIds[0])}>
      <span className={styles.gameText}>
        <span className={styles.gameLabel}>
          {row.pos ? `${row.pos}  ` : ''}
          {row.title ? words(row.title) : names}
        </span>
        {sub && <span className={styles.gameLeader}>{sub}</span>}
      </span>
      <span className={styles.gameStake}>
        <strong className="num">{words(row.figure)}</strong>
        {row.money ? (
          <span>
            <Money amount={row.money} signed={row.money < 0} />
          </span>
        ) : null}
      </span>
    </button>
  )
}
