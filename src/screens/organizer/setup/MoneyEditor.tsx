/**
 * The money of a tournament in one place: the main pot (entry, how the
 * individual game splits what is left, the house cut, the built-in games'
 * prizes) and each extra game's money (none, a side pot, from the main pot,
 * or direct between players). `MoneyBar` is the sticky line that says, live,
 * whether the main pot balances.
 */
import { useMemo } from 'react'
import { t } from '../../../i18n/es-MX'
import { Field, Segmented } from '../../../components/ui'
import { GAME_SOURCES, PAYS_BY_PLACE, type GameConfig } from '../../../engine/settings/games'
import { safeParseSettings, type TournamentSettings } from '../../../engine/settings/schema'
import { checkPrizePool, percentPlaces, type FieldShape } from '../../../engine/settings/prizeCheck'
import { formatMoney } from '../../../lib/money'
import { PrizeSummary } from '../../admin/PrizeSummary'
import { NumberField } from '../../../components/NumberField'
import { Group } from './Group'
import styles from './Setup.module.css'

const U = t.setup
const SPLITS: Record<string, number[]> = { classic: [50, 30, 20], wta: [100], top2: [60, 40], top4: [40, 30, 20, 10] }

function splitKey(s: TournamentSettings): string {
  if (s.prizes.stablefordMode === 'amount') return 'amounts'
  return Object.entries(SPLITS).find(([, v]) => v.join() === s.prizes.stableford.join())?.[0] ?? 'custom'
}

export function MoneyEditor({ value, onChange, field }: { value: TournamentSettings; onChange: (v: TournamentSettings) => void; field: FieldShape }) {
  const set = (fn: (d: TournamentSettings) => void) => {
    const d = structuredClone(value)
    fn(d)
    onChange(d)
  }
  const parsed = useMemo(() => safeParseSettings(value), [value])
  const check = useMemo(() => (parsed.success ? checkPrizePool(parsed.data, field) : null), [parsed, field])
  const cur = value.currency
  const m = value.modules
  const indivLine = check?.lines.find((l) => l.moduleId === 'individual')
  const key = splitKey(value)

  return (
    <div className={styles.section}>
      <h3>{U.mainPot}</h3>
      <Field label={U.entryFee}>
        <NumberField label={U.entryFee} prefix="$" value={value.entryFee} onChange={(v) => set((d) => (d.entryFee = v))} />
      </Field>

      {m.individual.enabled && (
        <Group label={U.split} hint={value.prizes.stablefordMode === 'percent' ? U.splitHint : undefined}>
          <div className="stack">
            <Segmented
              value={key === 'custom' ? 'classic' : key}
              options={['classic', 'top2', 'top4', 'wta', 'amounts'].map((k) => ({ value: k, label: U.splits[k]! }))}
              onChange={(k) =>
                set((d) => {
                  if (k === 'amounts') {
                    // Keep today's pesos so switching does not break the balance.
                    d.prizes.stableford = d.prizes.stablefordMode === 'percent' ? percentPlaces(indivLine?.amount ?? 0, d.prizes.stableford) : d.prizes.stableford
                    d.prizes.stablefordMode = 'amount'
                  } else {
                    d.prizes.stableford = [...SPLITS[k]!]
                    d.prizes.stablefordMode = 'percent'
                  }
                })
              }
            />
            <PlacesEditor
              values={value.prizes.stableford}
              mode={value.prizes.stablefordMode}
              pesos={value.prizes.stablefordMode === 'percent' ? percentPlaces(indivLine?.amount ?? 0, value.prizes.stableford) : undefined}
              currency={cur}
              onChange={(vals) => set((d) => (d.prizes.stableford = vals))}
            />
          </div>
        </Group>
      )}

      {(m.pairs.enabled || m.bestRound.enabled || m.snake.enabled || m.fewestPutts.enabled) && (
        <div className="stack">
          <span className="label">{U.modulePrizes}</span>
          {m.pairs.enabled && (
            <Group label={m.pairs.label}>
              <PlacesEditor values={value.prizes.pairs} mode="amount" currency={cur} onChange={(vals) => set((d) => (d.prizes.pairs = vals))} />
            </Group>
          )}
          {m.bestRound.enabled && (
            <Field label={m.bestRound.label}>
              <NumberField label={m.bestRound.label} prefix="$" suffix={U.perDay} value={value.prizes.bestRoundPerDay} onChange={(v) => set((d) => (d.prizes.bestRoundPerDay = v))} />
            </Field>
          )}
          {m.snake.enabled && (
            <Field label={m.snake.label}>
              <NumberField label={m.snake.label} prefix="$" suffix={U.perSurvivor} value={value.prizes.snakePerSurvivor} onChange={(v) => set((d) => (d.prizes.snakePerSurvivor = v))} />
            </Field>
          )}
          {m.fewestPutts.enabled && (
            <Field label={m.fewestPutts.label}>
              <NumberField label={m.fewestPutts.label} prefix="$" value={value.prizes.fewestPutts} onChange={(v) => set((d) => (d.prizes.fewestPutts = v))} />
            </Field>
          )}
        </div>
      )}

      <Field label={U.houseCut} hint={U.houseCutHint}>
        <NumberField label={U.houseCut} prefix="$" value={value.houseCut} onChange={(v) => set((d) => (d.houseCut = v))} />
      </Field>

      {value.games.length > 0 && (
        <>
          <h3>{U.sidePotsTitle}</h3>
          {value.games.map((g) => (
            <GameMoneyCard key={g.id} game={g} currency={cur} onChange={(fn) => set((d) => fn(d.games.find((x) => x.id === g.id)!))} />
          ))}
        </>
      )}

      <PrizeSummary check={check} players={field.players} issues={parsed.success ? undefined : parsed.error.issues.map((i) => i.message)} />
    </div>
  )
}

function GameMoneyCard({ game: g, currency, onChange }: { game: GameConfig; currency: string; onChange: (fn: (g: GameConfig) => void) => void }) {
  const sources = GAME_SOURCES[g.type].filter((s) => !(g.type === 'eventPot' && g.options.event === 'threePutt' && (s === 'side' || s === 'main')))
  const src = g.money.source
  return (
    <div className={styles.card}>
      <span className={styles.cardTitle}>{g.label}</span>
      <Segmented value={src} options={sources.map((s) => ({ value: s, label: U.source[s]! }))} onChange={(v) => onChange((x) => (x.money.source = v))} />
      <span className="help">{U.sourceHint[src]}</span>
      {src === 'side' && <NumberField label={U.buyIn} prefix="$" value={g.money.buyIn} onChange={(v) => onChange((x) => (x.money.buyIn = v))} />}
      {src === 'main' && <NumberField label={U.amount} prefix="$" value={g.money.amount} onChange={(v) => onChange((x) => (x.money.amount = v))} />}
      {src === 'direct' && <NumberField label={U.stake(U.unit[g.type] ?? '')} prefix="$" suffix={U.stake(U.unit[g.type] ?? '').toLowerCase()} value={g.money.stake} onChange={(v) => onChange((x) => (x.money.stake = v))} />}
      {PAYS_BY_PLACE[g.type] && (src === 'side' || src === 'main') && (
        <Group label={U.placesSplit}>
          <PlacesEditor values={g.money.split} mode="percent" currency={currency} onChange={(vals) => onChange((x) => (x.money.split = vals))} />
        </Group>
      )}
    </div>
  )
}

/** One box per place, in pesos or percent, with add / remove at the end. */
function PlacesEditor({ values, mode, pesos, currency, onChange }: { values: number[]; mode: 'amount' | 'percent'; pesos?: number[]; currency: string; onChange: (v: number[]) => void }) {
  const sum = values.reduce((s, x) => s + x, 0)
  return (
    <div className="stack">
      <div className={styles.places}>
        {values.map((v, i) => (
          <div key={i} className={styles.place}>
            <span>{U.place(i + 1)}</span>
            <NumberField label={U.place(i + 1)} prefix={mode === 'amount' ? '$' : undefined} suffix={mode === 'percent' ? '%' : undefined} max={mode === 'percent' ? 100 : undefined} value={v} onChange={(n) => onChange(values.map((x, j) => (j === i ? n : x)))} />
            {pesos && <span>{formatMoney(pesos[i] ?? 0, currency)}</span>}
          </div>
        ))}
      </div>
      <div className={styles.fieldRow}>
        <button type="button" className="btn btn--secondary btn--sm" onClick={() => onChange([...values, 0])}>
          {U.addPlace}
        </button>
        {values.length > 1 && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => onChange(values.slice(0, -1))}>
            {U.remove}
          </button>
        )}
        {mode === 'percent' && <span className={sum === 100 ? 'help' : 'error'}>{sum}%</span>}
      </div>
    </div>
  )
}

/** The live balance line pinned under the money step. */
export function MoneyBar({ value, field }: { value: TournamentSettings; field: FieldShape }) {
  const parsed = useMemo(() => safeParseSettings(value), [value])
  const check = parsed.success ? checkPrizePool(parsed.data, field) : null
  const pots = check?.sidePots.reduce((s, p) => s + p.pot, 0) ?? 0
  const diff = check?.difference ?? 0
  const cur = value.currency
  return (
    <div className={styles.bar} role="status">
      <span className={styles.barFig}>
        {U.bar.main}
        <strong>{formatMoney(check?.entryPot ?? 0, cur)}</strong>
      </span>
      <span className={styles.barFig}>
        {U.bar.pots}
        <strong>{formatMoney(pots, cur)}</strong>
      </span>
      {!check ? <span className={styles.barOff}>{t.admin.tournament.invalid}</span> : diff === 0 ? <span className={styles.barOk}>{U.bar.ok}</span> : <span className={styles.barOff}>{diff > 0 ? U.bar.over(formatMoney(diff, cur)) : U.bar.off(formatMoney(-diff, cur))}</span>}
    </div>
  )
}
