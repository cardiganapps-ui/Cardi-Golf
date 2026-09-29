/**
 * The first question a tournament should be asked: what are you playing?
 *
 * Until the format seam existed there was nothing to ask — every tournament
 * was Stableford — so setup opened on days, field size and allowances, which
 * is the wrong end of the conversation. Each card carries one line of plain
 * Spanish and an info icon with the format's own `describe()`, so nobody has
 * to already know what a shamble is to choose one.
 */
import { t } from '../../../i18n/es-MX'
import { Segmented } from '../../../components/ui'
import { InfoButton } from '../../../components/InfoButton'
import { ALL_FORMATS, type FormatId } from '../../../engine/formats'
import type { TournamentSettings } from '../../../engine/settings/schema'
import { Group } from './Group'
import styles from './Setup.module.css'

const W = t.organizer.wizard
const ORDER: FormatId[] = ['stableford', 'strokePlay', 'matchPlay', 'team']

export function FormatPicker({ value, onChange }: { value: TournamentSettings; onChange: (v: TournamentSettings) => void }) {
  const set = (fn: (d: TournamentSettings) => void) => {
    const d = structuredClone(value)
    fn(d)
    onChange(d)
  }
  const current = value.modules.individual.format
  const o = value.modules.individual.formatOptions

  return (
    <div className={styles.section}>
      <Group label={W.format} hint={W.formatHint}>
        <div role="radiogroup" aria-label={W.format} className={styles.choices}>
          {ORDER.map((id) => {
            const copy = W.formats[id]
            const on = current === id
            return (
              <div key={id} className={`${styles.choice} ${on ? styles.choiceOn : ''}`}>
                <button type="button" role="radio" aria-checked={on} className={styles.choiceMain} onClick={() => set((d) => (d.modules.individual.format = id))}>
                  <span className={styles.choiceTitle}>{copy.name}</span>
                  <span className={styles.choiceBlurb}>{copy.blurb}</span>
                </button>
                <InfoButton why={ALL_FORMATS[id].describe(value)} label={W.formatInfo(copy.name)} title={W.formatInfoTitle} />
              </div>
            )
          })}
        </div>
      </Group>

      {current === 'matchPlay' && (
        <Group label={W.matchMode} hint={W.matchHint}>
          <Segmented
            value={o.matchMode}
            options={[
              { value: 'singles', label: W.matchSingles },
              { value: 'fourball', label: W.matchFourball },
            ]}
            onChange={(v) => set((d) => (d.modules.individual.formatOptions.matchMode = v as 'singles' | 'fourball'))}
          />
        </Group>
      )}

      {current === 'team' && (
        <>
          <Group label={W.teamMode} hint={W.teamHint}>
            <Segmented
              value={o.teamMode}
              options={[
                { value: 'scramble', label: W.teamScramble },
                { value: 'bestBall', label: W.teamBestBall },
                { value: 'shamble', label: W.teamShamble },
              ]}
              onChange={(v) => set((d) => (d.modules.individual.formatOptions.teamMode = v as 'scramble' | 'bestBall' | 'shamble'))}
            />
          </Group>
          <Group label={W.teamScoring}>
            <Segmented
              value={o.teamScoring}
              options={[
                { value: 'strokes', label: W.teamStrokes },
                { value: 'stableford', label: W.teamPoints },
              ]}
              onChange={(v) => set((d) => (d.modules.individual.formatOptions.teamScoring = v as 'strokes' | 'stableford'))}
            />
          </Group>
        </>
      )}

      {/* Stableford is always net: the points already carry the strokes. */}
      {current !== 'stableford' && (
        <Group label={W.scoring}>
          <Segmented
            value={o.scoring}
            options={[
              { value: 'net', label: W.scoringNet },
              { value: 'gross', label: W.scoringGross },
            ]}
            onChange={(v) => set((d) => (d.modules.individual.formatOptions.scoring = v as 'net' | 'gross'))}
          />
        </Group>
      )}
    </div>
  )
}
