/**
 * "¿Qué van a jugar?" — the whole of a tournament's shape in one screen.
 *
 * This replaces three: a wall of five preset cards, the format editor, and a
 * catalog of fifteen game cards over six headings. What is left is what an
 * organizer actually has to decide before the first tee: the format, how many
 * of them for how many days, whether there is money, and the two or three
 * side games nearly everyone plays. The rest is not gone — it is behind
 * "Más opciones" and in Comité — and the screen says so, so nobody thinks
 * these chips are the whole catalog.
 */
import { useState } from 'react'
import { t } from '../../../i18n/es-MX'
import { Field, Segmented, Sheet, Toggle } from '../../../components/ui'
import { IconCheck, IconPlus } from '../../../components/icons'
import { InfoButton } from '../../../components/InfoButton'
import { NumberField } from '../../../components/NumberField'
import { PRESETS, type PresetId } from '../../../engine/games/presets'
import { describeGame } from '../../../engine/games/describe'
import type { GameConfig } from '../../../engine/settings/games'
import type { TournamentSettings } from '../../../engine/settings/schema'
import { FormatPicker } from './FormatPicker'
import { Group } from './Group'
import styles from './Setup.module.css'

const W = t.organizer.wizard
const U = t.setup
const SPLITS: Record<string, number[]> = { classic: [50, 30, 20], wta: [100], top2: [60, 40], top4: [40, 30, 20, 10] }

/**
 * The side games nearly every group plays. Everything else lives in the
 * tournament's own "Agregar juegos", where there is a roster to point at.
 */
const QUICK: Array<{ id: string; build: () => GameConfig }> = [
  {
    id: 'skins',
    build: () => ({ id: 'skins', type: 'skins', label: 'Skins', enabled: true, rounds: 'all', entrants: 'all', options: { basis: 'net', carryOver: true }, money: { source: 'side', buyIn: 200, amount: 0, stake: 0, split: [100] } }),
  },
  {
    id: 'birdies',
    build: () => ({ id: 'birdies', type: 'eventPot', label: 'Bote de birdies', enabled: true, rounds: 'all', entrants: 'all', options: { event: 'birdie', basis: 'gross' }, money: { source: 'direct', buyIn: 0, amount: 0, stake: 50, split: [100] } }),
  },
  {
    id: 'cerca',
    build: () => ({ id: 'cerca', type: 'contest', label: 'Más cerca del hoyo', enabled: true, rounds: 'all', entrants: 'all', options: { kind: 'closest', holes: 'par3' }, money: { source: 'side', buyIn: 100, amount: 0, stake: 0, split: [100] } }),
  },
  {
    id: 'tres-putts',
    build: () => ({ id: 'tres-putts', type: 'eventPot', label: 'Multa por tres putts', enabled: true, rounds: 'all', entrants: 'all', options: { event: 'threePutt', basis: 'gross' }, money: { source: 'direct', buyIn: 0, amount: 0, stake: 20, split: [100] } }),
  },
]

export function PlayStep({
  value,
  onChange,
  players,
  onPlayers,
  onPreset,
}: {
  value: TournamentSettings
  onChange: (v: TournamentSettings) => void
  players: number
  onPlayers: (n: number) => void
  onPreset: (id: PresetId) => void
}) {
  const [templates, setTemplates] = useState(false)
  const set = (fn: (d: TournamentSettings) => void) => {
    const d = structuredClone(value)
    fn(d)
    onChange(d)
  }
  const hasMoney = value.entryFee > 0
  const splitKey = Object.entries(SPLITS).find(([, v]) => v.join() === value.prizes.stableford.join())?.[0] ?? 'classic'

  const toggleGame = (q: (typeof QUICK)[number]) => {
    set((d) => {
      const at = d.games.findIndex((g) => g.id === q.id)
      if (at >= 0) d.games.splice(at, 1)
      else d.games.push(q.build())
    })
  }

  return (
    <div className={styles.section}>
      <FormatPicker value={value} onChange={onChange} />

      <div className={styles.fieldRow}>
        <Field label={W.players} hint={W.playersHint}>
          <NumberField label={W.players} value={players} min={2} max={200} onChange={onPlayers} />
        </Field>
      </div>
      <Group label={W.rounds}>
        <Segmented value={String(value.rounds)} options={['1', '2', '3', '4'].map((n) => ({ value: n, label: n }))} onChange={(v) => set((d) => (d.rounds = Number(v)))} />
      </Group>

      <Toggle
        label={W.money}
        hint={W.moneyHint}
        checked={hasMoney}
        onChange={(on) =>
          set((d) => {
            if (on) {
              d.entryFee = 500
              d.prizes.stableford = [...SPLITS.classic!]
              d.prizes.stablefordMode = 'percent'
            } else {
              d.entryFee = 0
              d.prizes.stableford = []
              d.prizes.stablefordMode = 'amount'
              // Money games make no sense in a tournament with no money.
              for (const g of d.games) g.money = { ...g.money, source: 'none' }
            }
          })
        }
      />
      {hasMoney && (
        <>
          <Field label={U.entryFee}>
            <NumberField label={U.entryFee} prefix="$" value={value.entryFee} onChange={(v) => set((d) => (d.entryFee = v))} />
          </Field>
          <Group label={U.split} hint={U.splitHint}>
            <Segmented
              value={splitKey}
              options={Object.keys(SPLITS).map((k) => ({ value: k, label: U.splits[k] ?? k }))}
              onChange={(k) =>
                set((d) => {
                  d.prizes.stableford = [...SPLITS[k]!]
                  d.prizes.stablefordMode = 'percent'
                })
              }
            />
          </Group>
        </>
      )}

      <Group label={W.quickGames} hint={W.quickGamesHint}>
        <div className={styles.chips}>
          {QUICK.map((q) => {
            const on = value.games.some((g) => g.id === q.id)
            const config = value.games.find((g) => g.id === q.id) ?? q.build()
            return (
              <span key={q.id} className={`${styles.chip} ${on ? styles.chipOn : ''}`}>
                <button type="button" role="switch" aria-checked={on} className={styles.chipMain} onClick={() => toggleGame(q)}>
                  {on ? <IconCheck size={16} /> : <IconPlus size={16} />}
                  {config.label}
                </button>
                <InfoButton why={{ title: config.label, steps: describeGame(config) }} label={W.formatInfo(config.label)} title={W.formatInfoTitle} />
              </span>
            )
          })}
        </div>
      </Group>

      <button type="button" className="btn btn--ghost btn--sm" onClick={() => setTemplates(true)}>
        {W.templateLink}
      </button>

      <Sheet open={templates} onClose={() => setTemplates(false)} title={W.template}>
        <div className="stack">
          <p className="help">{W.templateHint}</p>
          <div className={styles.choices} role="radiogroup" aria-label={W.template}>
            {PRESETS.map((p) => (
              <div key={p.id} className={styles.choice}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={false}
                  className={styles.choiceMain}
                  onClick={() => {
                    onPreset(p.id)
                    setTemplates(false)
                  }}
                >
                  <span className={styles.choiceTitle}>{p.name}</span>
                  <span className={styles.choiceBlurb}>{p.blurb}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      </Sheet>
    </div>
  )
}
