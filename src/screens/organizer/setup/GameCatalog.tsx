/**
 * The game catalog: every game a tournament can play, grouped. The six
 * built-in games switch on and off; the others are added as instances (two
 * skins, three Nassaus...). Each card shows its two or three key choices and
 * keeps the rest behind "Más opciones", so the list stays calm however many
 * games the group piles on. Money is set in the next step (MoneyEditor).
 */
import { useState } from 'react'
import { t } from '../../../i18n/es-MX'
import { Field, Segmented, Sheet, Toggle } from '../../../components/ui'
import { CATEGORY_LABEL, GAME_ENTRIES, MODULE_ENTRIES, entryOf, newGameId, type CatalogCategory } from '../../../engine/games/catalog'
import { describeGame } from '../../../engine/games/describe'
import { moduleRules } from '../../../engine/settings/describeModule'
import { InfoButton } from '../../../components/InfoButton'
import type { GameConfig } from '../../../engine/settings/games'
import type { TournamentSettings } from '../../../engine/settings/schema'
import type { FieldShape } from '../../../engine/settings/prizeCheck'
import { NumberField } from '../../../components/NumberField'
import { Group } from './Group'
import styles from './Setup.module.css'

const U = t.setup
const W = t.organizer.wizard
const CATEGORIES: CatalogCategory[] = ['main', 'hole', 'round', 'matches', 'specials', 'free']

export function GameCatalog({ value, onChange, field }: { value: TournamentSettings; onChange: (v: TournamentSettings) => void; field: FieldShape }) {
  const [more, setMore] = useState<string | null>(null)
  const set = (fn: (d: TournamentSettings) => void) => {
    const d = structuredClone(value)
    fn(d)
    onChange(d)
  }
  const setGame = (id: string, fn: (g: GameConfig) => void) =>
    set((d) => {
      const g = d.games.find((x) => x.id === id)
      if (g) fn(g)
    })
  const moreGame = value.games.find((g) => g.id === more) ?? null

  return (
    <div className={styles.section}>
      <p className="help">{U.catalogHint}</p>
      {CATEGORIES.map((cat) => {
        const mods = MODULE_ENTRIES.filter((e) => e.category === cat)
        const entries = GAME_ENTRIES.filter((e) => e.category === cat)
        if (!mods.length && !entries.length) return null
        return (
          <div key={cat} className={styles.section}>
            <h3 className={styles.catTitle}>{CATEGORY_LABEL[cat]}</h3>
            {mods.map((e) => {
              const mod = value.modules[e.id]
              return (
                <div key={e.id} className={`${styles.card} ${mod.enabled ? '' : styles.cardOff}`}>
                  <div className={styles.cardHead}>
                    <span className={styles.cardText}>
                      <span className={styles.cardTitle}>{mod.label}</span>
                      <span className={styles.cardBlurb}>{e.blurb}</span>
                    </span>
                    <InfoButton why={{ title: mod.label, steps: moduleRules(e.id, value, field) }} label={W.formatInfo(mod.label)} title={W.formatInfoTitle} />
                    <Toggle label="" ariaLabel={mod.label} checked={mod.enabled} onChange={(v) => set((d) => (d.modules[e.id].enabled = v))} />
                  </div>
                  {mod.enabled && e.id === 'snake' && (
                    <Field label={U.puttsThreshold}>
                      <NumberField label={U.puttsThreshold} value={value.modules.snake.puttsThreshold} min={2} max={10} onChange={(v) => set((d) => (d.modules.snake.puttsThreshold = v))} />
                    </Field>
                  )}
                  {mod.enabled && e.later && <span className="help">{e.later}</span>}
                  {mod.enabled && e.id !== 'individual' && (
                    <Field label={U.name}>
                      <input className="input input--sm" value={mod.label} onChange={(ev) => set((d) => (d.modules[e.id].label = ev.target.value))} />
                    </Field>
                  )}
                </div>
              )
            })}
            {entries.map((e) => {
              const instances = value.games.filter((g) => entryOf(g).key === e.key)
              return (
                <div key={e.key} className={styles.section}>
                  {instances.map((g) => (
                    <div key={g.id} className={styles.card}>
                      <div className={styles.cardHead}>
                        <span className={styles.cardText}>
                          <span className={styles.cardTitle}>{g.label}</span>
                          <span className={styles.cardBlurb}>{describeGame(g)[0]}</span>
                        </span>
                        <InfoButton why={{ title: g.label, steps: describeGame(g) }} label={W.formatInfo(g.label)} title={W.formatInfoTitle} />
                        <button type="button" className="btn btn--ghost btn--sm" onClick={() => set((d) => (d.games = d.games.filter((x) => x.id !== g.id)))}>
                          {U.remove}
                        </button>
                      </div>
                      <QuickFields game={g} onChange={(fn) => setGame(g.id, fn)} />
                      {e.later && <span className="help">{e.later}</span>}
                      <div className={styles.cardFoot}>
                        <button type="button" className="btn btn--secondary btn--sm" onClick={() => setMore(g.id)}>
                          {U.more}
                        </button>
                      </div>
                    </div>
                  ))}
                  {instances.length > 0 ? (
                    <button type="button" className="btn btn--secondary btn--sm" style={{ alignSelf: 'flex-start' }} onClick={() => set((d) => d.games.push(e.create(newGameId(d.games, e.key))))}>
                      {U.addAnother}: {e.title}
                    </button>
                  ) : (
                    <div className={`${styles.card} ${styles.cardOff}`}>
                      <div className={styles.cardHead}>
                        <span className={styles.cardText}>
                          <span className={styles.cardTitle}>{e.title}</span>
                          <span className={styles.cardBlurb}>{e.blurb}</span>
                        </span>
                        <InfoButton why={{ title: e.title, steps: describeGame(e.create('preview')) }} label={W.formatInfo(e.title)} title={W.formatInfoTitle} />
                        <button type="button" className="btn btn--primary btn--sm" onClick={() => set((d) => d.games.push(e.create(newGameId(d.games, e.key))))}>
                          {U.add}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
      <Sheet open={!!moreGame} onClose={() => setMore(null)} title={moreGame?.label}>
        {moreGame && <MoreFields game={moreGame} rounds={value.rounds} onChange={(fn) => setGame(moreGame.id, fn)} onDone={() => setMore(null)} />}
      </Sheet>
    </div>
  )
}

/** The two or three choices that define a game, right on its card. */
function QuickFields({ game: g, onChange }: { game: GameConfig; onChange: (fn: (g: GameConfig) => void) => void }) {
  const seg = <T extends string>(value: T, options: T[], labels: Record<string, string>, apply: (v: T) => void) => <Segmented value={value} options={options.map((o) => ({ value: o, label: labels[o] ?? o }))} onChange={apply} />
  switch (g.type) {
    case 'skins':
      return (
        <div className={styles.fieldRow}>
          {seg(g.options.basis, ['net', 'gross'], U.basis, (v) => onChange((x) => x.type === 'skins' && (x.options.basis = v)))}
          <Toggle label={U.carry} checked={g.options.carryOver} onChange={(v) => onChange((x) => x.type === 'skins' && (x.options.carryOver = v))} />
        </div>
      )
    case 'lowScore':
      return (
        <div className={styles.fieldRow}>
          {seg(g.options.basis, ['net', 'gross', 'points'], U.basis, (v) => onChange((x) => x.type === 'lowScore' && (x.options.basis = v)))}
          {seg(g.options.scope, ['perRound', 'overall'], U.scope, (v) => onChange((x) => x.type === 'lowScore' && (x.options.scope = v)))}
        </div>
      )
    case 'eventPot':
      return (
        <div className={styles.fieldRow}>
          {g.options.event !== 'threePutt' && seg(g.options.event, ['birdie', 'eagle'], U.event, (v) => onChange((x) => x.type === 'eventPot' && (x.options.event = v)))}
          {g.options.event !== 'threePutt' && seg(g.options.basis, ['gross', 'net'], U.basis, (v) => onChange((x) => x.type === 'eventPot' && (x.options.basis = v)))}
        </div>
      )
    case 'match':
      return (
        <div className={styles.fieldRow}>
          {seg(g.options.format, ['nassau', 'match'], U.format, (v) => onChange((x) => x.type === 'match' && (x.options.format = v)))}
          {seg(g.options.basis, ['net', 'gross'], U.basis, (v) => onChange((x) => x.type === 'match' && (x.options.basis = v)))}
          {seg(String(g.options.pressAt), ['0', '2', '3'], { '0': U.pressOff, '2': U.pressAt(2), '3': U.pressAt(3) }, (v) => onChange((x) => x.type === 'match' && (x.options.pressAt = Number(v))))}
        </div>
      )
    case 'contest': {
      const holes = g.options.holes
      const mode = holes === 'par3' ? 'par3' : holes === 'all' ? 'all' : 'pick'
      return (
        <div className="stack">
          {g.options.kind !== 'longDrive' && g.options.kind !== 'closest' && seg(g.options.kind, ['greenie', 'sandy'], U.kind, (v) => onChange((x) => x.type === 'contest' && (x.options.kind = v)))}
          {seg(mode, ['par3', 'all', 'pick'], { par3: U.holesPar3, all: U.holesAll, pick: U.holesPick }, (v) => onChange((x) => x.type === 'contest' && (x.options.holes = v === 'pick' ? (Array.isArray(holes) ? holes : [18]) : v)))}
          {Array.isArray(holes) && (
            <div className={styles.holePicks} role="group" aria-label={U.holes}>
              {Array.from({ length: 18 }, (_, i) => i + 1).map((h) => (
                <button
                  key={h}
                  type="button"
                  className={styles.holePick}
                  aria-pressed={holes.includes(h)}
                  onClick={() =>
                    onChange((x) => {
                      if (x.type !== 'contest' || !Array.isArray(x.options.holes)) return
                      const next = x.options.holes.includes(h) ? x.options.holes.filter((y) => y !== h) : [...x.options.holes, h].sort((a, b) => a - b)
                      if (next.length) x.options.holes = next
                    })
                  }
                >
                  {h}
                </button>
              ))}
            </div>
          )}
        </div>
      )
    }
    case 'custom':
      return (
        <div className="stack">
          <Field label={U.name}>
            <input className="input" value={g.label} onChange={(e) => onChange((x) => (x.label = e.target.value))} />
          </Field>
          <Field label={U.description}>
            <input className="input" value={g.options.description} placeholder={U.descriptionPlaceholder} onChange={(e) => onChange((x) => x.type === 'custom' && (x.options.description = e.target.value))} />
          </Field>
        </div>
      )
  }
}

/** Everything else: name, days, pair scoring and press limits. */
function MoreFields({ game: g, rounds, onChange, onDone }: { game: GameConfig; rounds: number; onChange: (fn: (g: GameConfig) => void) => void; onDone: () => void }) {
  const days = Array.from({ length: rounds }, (_, i) => i + 1)
  const on = (d: number) => g.rounds === 'all' || g.rounds.includes(d)
  return (
    <div className="stack">
      <Field label={U.name}>
        <input className="input" value={g.label} onChange={(e) => onChange((x) => (x.label = e.target.value))} />
      </Field>
      {rounds > 1 && (
        <Group label={U.days}>
          <div className={styles.fieldRow}>
            {days.map((d) => (
              <button
                key={d}
                type="button"
                className={styles.holePick}
                aria-pressed={on(d)}
                onClick={() =>
                  onChange((x) => {
                    const cur = x.rounds === 'all' ? days : x.rounds
                    const next = cur.includes(d) ? cur.filter((y) => y !== d) : [...cur, d].sort((a, b) => a - b)
                    if (next.length) x.rounds = next.length === days.length ? 'all' : next
                  })
                }
              >
                {U.day(d)}
              </button>
            ))}
          </div>
        </Group>
      )}
      {g.type === 'match' && (
        <>
          <Segmented value={g.options.pairScoring} options={(['bestBall', 'aggregate'] as const).map((v) => ({ value: v, label: U.pairScoring[v]! }))} onChange={(v) => onChange((x) => x.type === 'match' && (x.options.pairScoring = v))} />
          {g.options.pressAt > 0 && (
            <Field label={U.maxPresses}>
              <NumberField label={U.maxPresses} value={g.options.maxPresses} min={1} max={5} onChange={(v) => onChange((x) => x.type === 'match' && (x.options.maxPresses = v))} />
            </Field>
          )}
        </>
      )}
      <ul className="small">
        {describeGame(g).map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
      <button type="button" className="btn btn--primary" onClick={onDone}>
        {U.done}
      </button>
    </div>
  )
}
