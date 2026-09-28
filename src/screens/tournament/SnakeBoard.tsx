/**
 * La Víbora (§9.4): per day and group, who holds the snake, the passes hole
 * by hole, what is at stake and the payouts once the group finishes.
 */
import { motion } from 'motion/react'
import { t } from '../../i18n/es-MX'
import { Avatar } from '../../components/ui'
import { EmptyState } from '../../components/primitives'
import { useTournament } from '../../data/tournamentStore'
import { formatMoney } from '../../lib/money'
import styles from './SnakeBoard.module.css'
import { IconSnake } from '../../components/icons'

export function SnakeBoard({ onOpen }: { onOpen: (id: string) => void }) {
  const data = useTournament((s) => s.data)!
  const { snapshot, state, settings } = data
  const snake = state.modules.snake!
  const byId = new Map(snapshot.players.map((p) => [p.id, p]))
  const name = (id: string) => byId.get(id)?.displayName ?? '?'
  const byRound = new Map<string, typeof snake.groups>()
  for (const g of snake.groups) byRound.set(g.roundId, [...(byRound.get(g.roundId) ?? []), g])

  return (
    <div className={styles.board}>
      <p className="help">{t.games.snakeRule(settings.modules.snake.puttsThreshold)}</p>
      {[...byRound.entries()].map(([rid, groups]) => (
        <section key={rid} className={styles.day}>
          <h3>{t.round.day(groups[0]!.roundNumber)}</h3>
          {groups.map((g) => (
            <div key={g.groupId} className={styles.group}>
              <div className={styles.groupHead}>
                <strong>
                  {t.card.group} {g.groupNumber}
                </strong>
                <span className={`${styles.state} ${g.pendingHole != null ? styles.statePending : ''}`}>
                  {g.pendingHole != null ? t.games.snakePending(g.pendingHole) : g.finished ? t.games.snakeSettled : t.games.inPlay(formatMoney(g.pot))}
                </span>
              </div>
              <div className={styles.players}>
                {g.playerIds.map((pid) => {
                  const holder = g.holderId === pid
                  const payout = g.payouts[pid]
                  return (
                    <button key={pid} type="button" className={`${styles.player} ${holder ? styles.holder : ''}`} onClick={() => onOpen(pid)}>
                      <span className={styles.avatarWrap}>
                        <Avatar name={name(pid)} url={byId.get(pid)?.avatarUrl} />
                        {holder && (
                          <motion.span layoutId={`snake-${g.groupId}`} className={styles.snake} aria-label={t.games.holder} transition={{ duration: 0.25, ease: [0.2, 0, 0, 1] }}>
                            <IconSnake size={16} />
                          </motion.span>
                        )}
                      </span>
                      <span className={styles.playerName}>{name(pid)}</span>
                      {payout && <span className={`${styles.payout} ${payout.amount ? '' : styles.payoutZero}`}>{formatMoney(payout.amount)}</span>}
                    </button>
                  )
                })}
              </div>
              {g.passes.length > 0 ? (
                <ol className={styles.history}>
                  {g.passes.map((p) => (
                    <li key={p.hole} className={p.pending ? styles.pending : ''}>
                      {t.round.hole(p.hole)}: {p.pending ? t.games.snakeWho(p.candidates.map(name).join(' / ')) : t.games.snakeTo(name(p.holderId!))}
                    </li>
                  ))}
                </ol>
              ) : (
                <span className="help">{t.games.noThreePutts}</span>
              )}
            </div>
          ))}
        </section>
      ))}
      {snake.groups.length === 0 && <EmptyState title={t.card.noGroups} body="" />}
    </div>
  )
}
