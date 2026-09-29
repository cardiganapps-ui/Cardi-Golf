/**
 * Reglamento (§9.8): §5 as friendly Spanish copy, every number read from the
 * tournament's settings so it always mirrors what the engine runs.
 */
import { t } from '../../i18n/es-MX'
import { useTournament } from '../../data/tournamentStore'
import { fieldShape, individualPrizeAmounts, snakePotPerGroup } from '../../engine/settings/prizeCheck'
import { formatMoney } from '../../lib/money'
import { describeGame } from '../../engine/games/describe'
import { formatFor } from '../../engine/formats'
import styles from './RulesScreen.module.css'

const R = t.rules

export function RulesScreen() {
  const data = useTournament((s) => s.data)
  if (!data) return null
  const { snapshot, settings } = data
  const m = settings.modules
  const n = snapshot.players.length
  const honoree = snapshot.players.find((p) => p.isHonoree)
  const pairingRule = m.pairs.pairing.map(([a, b]) => `${a}-${b}`).join(', ')
  const slots = settings.auction.payout.map((s) => R.slot(s.slot, 'place' in s ? s.place : undefined, 'tier' in s ? s.tier : undefined, s.share, settings.labels.lastPlace))

  const sections: Array<{ id: string; title: string; lines: string[]; on: boolean }> = [
    { id: 'field', title: R.sections.field, lines: R.field(n, formatMoney(settings.entryFee), formatMoney(settings.entryFee * n), settings.tiers.join(', ')), on: true },
    {
      id: 'handicaps',
      title: R.sections.handicaps,
      lines: R.handicaps(Math.round(settings.handicap.allowance * 100), settings.handicap.cap, settings.day2Cut),
      on: true,
    },
    { id: 'individual', title: m.individual.label, lines: R.individual(individualPrizeAmounts(settings, fieldShape(snapshot, settings)).map((x, i) => (settings.prizes.stablefordMode === 'percent' ? `${formatMoney(x)} (${settings.prizes.stableford[i]}%)` : formatMoney(x))), settings.labels.lastPlace, formatFor(settings).describe(settings).steps), on: m.individual.enabled },
    { id: 'bestRound', title: m.bestRound.label, lines: R.bestRound(formatMoney(settings.prizes.bestRoundPerDay)), on: m.bestRound.enabled },
    { id: 'pairs', title: m.pairs.label, lines: R.pairs(pairingRule, settings.prizes.pairs.map((x) => formatMoney(x)), m.pairs.honoreePicks ? (honoree?.displayName ?? settings.labels.honoree) : null), on: m.pairs.enabled },
    {
      id: 'snake',
      title: m.snake.label,
      lines: R.snake(m.snake.puttsThreshold, formatMoney(settings.prizes.snakePerSurvivor), formatMoney(snakePotPerGroup(settings))),
      on: m.snake.enabled,
    },
    { id: 'fewestPutts', title: m.fewestPutts.label, lines: R.fewestPutts(formatMoney(settings.prizes.fewestPutts), settings.pickupPuttsForFewestPutts), on: m.fewestPutts.enabled },
    {
      id: 'auction',
      title: m.auction.label,
      lines: R.auction(formatMoney(settings.auction.openingBid), formatMoney(settings.auction.increment), settings.auction.maxPlayersPerOwner, settings.auction.buybackMaxPct, slots),
      on: m.auction.enabled,
    },
    ...settings.games.map((g) => ({ id: `game-${g.id}`, title: g.label, lines: describeGame(g), on: g.enabled })),
    { id: 'governance', title: R.sections.governance, lines: [...R.governance], on: true },
  ].filter((s) => s.on)

  return (
    <div className={styles.screen}>
      <h1>{R.title}</h1>
      <p className={styles.intro}>{R.intro(snapshot.tournament.name)}</p>
      {sections.map((s) => (
        <section key={s.id} className={styles.section}>
          <div className={styles.head}>
            <h2>{s.title}</h2>
          </div>
          <ul className={styles.lines}>
            {s.lines.map((l, j) => (
              <li key={j}>{l}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
