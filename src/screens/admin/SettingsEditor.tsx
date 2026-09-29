/**
 * Form over TournamentSettings (§18) for Comité › Torneo. Every rule is a
 * field; the prize-pool balance is live in the money section.
 *
 * It renders **one** section at a time, because all of it at once is the
 * screen Diego bounced off: brand + status + every rule + every game + every
 * peso + the Calcutta on one route, past sixty controls with no way to find
 * anything. Comité › Torneo now has a sub-nav and asks for the section it is
 * showing; the state, the dirty flag and the single Guardar stay up there, so
 * a change made under one tab still saves with the rest.
 */
import { t } from '../../i18n/es-MX'
import { Field, Toggle } from '../../components/ui'
import { NumberField } from '../../components/NumberField'
import type { TournamentSettings } from '../../engine/settings/schema'
import type { FieldShape } from '../../engine/settings/prizeCheck'
import { FormatEditor } from '../organizer/setup/FormatEditor'
import { GameCatalog } from '../organizer/setup/GameCatalog'
import { MoneyEditor } from '../organizer/setup/MoneyEditor'

/** Which block of the settings to show. One per sub-nav tab. */
export type SettingsSection = 'rules' | 'games' | 'money' | 'auction'

interface Props {
  value: TournamentSettings
  onChange: (v: TournamentSettings) => void
  /** The field the prize check uses: players, real group sizes, game entrants. */
  field: FieldShape
  section: SettingsSection
}

/**
 * The Comité's editor: the same format, catalog and money components as the
 * create wizard, plus the rules only the Comité touches (labels, the next-day
 * cut, slope, the Calcutta).
 */
export function SettingsEditor({ value, onChange, field, section }: Props) {
  const set = (fn: (d: TournamentSettings) => void) => {
    const d = structuredClone(value)
    fn(d)
    onChange(d)
  }
  const m = value.modules
  const A = t.admin.tournament

  return (
    <div className="stack stack--lg">
      {section === 'rules' && (
      <section className="stack">
        <FormatEditor value={value} onChange={onChange} />
        <div className="grid2">
          <Field label={A.lastPlaceLabel}>
            <input className="input" value={value.labels.lastPlace} onChange={(e) => set((d) => (d.labels.lastPlace = e.target.value))} />
          </Field>
          <Field label={A.honoreeLabel}>
            <input className="input" value={value.labels.honoree} onChange={(e) => set((d) => (d.labels.honoree = e.target.value))} />
          </Field>
        </div>
        {m.pairs.enabled && (
          <div className="grid2">
            <Field label={A.pairingRules}>
              <select
                className="select"
                value={m.pairs.pairing.map((p) => p.join('-')).join(',')}
                onChange={(e) =>
                  set((d) => {
                    d.modules.pairs.pairing = e.target.value ? e.target.value.split(',').map((p) => p.split('-') as [string, string]) : []
                  })
                }
              >
                {pairingOptions(value.tiers, m.pairs.pairing.map((p) => p.join('-')).join(',')).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Toggle label={A.honoreePicks} checked={m.pairs.honoreePicks} onChange={(v) => set((d) => (d.modules.pairs.honoreePicks = v))} />
          </div>
        )}
      </section>
      )}

      {section === 'games' && (
      <section className="stack">
        <GameCatalog value={value} onChange={onChange} field={field} />
      </section>
      )}

      {section === 'rules' && (
      <section className="stack">
        <span className="label">{A.handicap}</span>
        <div className="grid2">
          <Field label={A.allowance}>
            <NumberField min={0} max={100} suffix="%" value={Math.round(value.handicap.allowance * 100)} onChange={(v) => set((d) => (d.handicap.allowance = v / 100))} />
          </Field>
          <Field label={A.cap}>
            <NumberField min={0} max={54} value={value.handicap.cap} onChange={(v) => set((d) => (d.handicap.cap = v))} />
          </Field>
        </div>
        {value.rounds > 1 && (
          <>
            <span className="help">{A.cutTitle}</span>
            <div className="grid3">
              <Field label={A.cutThreshold}>
                <NumberField value={value.day2Cut.threshold} onChange={(v) => set((d) => (d.day2Cut.threshold = v))} />
              </Field>
              <Field label={A.cutPer}>
                <NumberField min={1} value={value.day2Cut.pointsPerStroke} onChange={(v) => set((d) => (d.day2Cut.pointsPerStroke = v))} />
              </Field>
              <Field label={A.cutMax}>
                <NumberField min={0} value={value.day2Cut.maxStrokes} onChange={(v) => set((d) => (d.day2Cut.maxStrokes = v))} />
              </Field>
            </div>
            {value.rounds > 2 && (
              <Field label={A.cutMode}>
                <select className="select" value={value.day2Cut.mode} onChange={(e) => set((d) => (d.day2Cut.mode = e.target.value === 'cumulative' ? 'cumulative' : 'previous'))}>
                  <option value="previous">{A.cutModePrevious}</option>
                  <option value="cumulative">{A.cutModeCumulative}</option>
                </select>
              </Field>
            )}
          </>
        )}
        {<Toggle label={A.perRoundSlope} hint={A.perRoundSlopeHint} checked={value.handicap.perRoundSlope} onChange={(v) => set((d) => (d.handicap.perRoundSlope = v))} />}
      </section>
      )}

      {section === 'money' && (
      <section className="stack">
        <span className="label">{A.prizesTitle}</span>
        <MoneyEditor value={value} onChange={onChange} field={field} />
        {m.fewestPutts.enabled && (
          <Field label={A.pickupPutts}>
            <NumberField min={0} max={10} value={value.pickupPuttsForFewestPutts} onChange={(v) => set((d) => (d.pickupPuttsForFewestPutts = v))} />
          </Field>
        )}
      </section>
      )}

      {section === 'auction' && m.auction.enabled && (
        <section className="stack">
          <div className="grid3">
            <Field label={A.openingBid}>
              <NumberField min={1} prefix="$" value={value.auction.openingBid} onChange={(v) => set((d) => (d.auction.openingBid = v))} />
            </Field>
            <Field label={A.increment}>
              <NumberField min={1} prefix="$" value={value.auction.increment} onChange={(v) => set((d) => (d.auction.increment = v))} />
            </Field>
            <Field label={A.maxPerOwner}>
              <NumberField min={1} value={value.auction.maxPlayersPerOwner} onChange={(v) => set((d) => (d.auction.maxPlayersPerOwner = v))} />
            </Field>
          </div>
          <Field label={A.buybackMax}>
            <NumberField min={0} max={100} suffix="%" value={value.auction.buybackMaxPct} onChange={(v) => set((d) => (d.auction.buybackMaxPct = v))} />
          </Field>
          <Toggle label={A.selfCounts} checked={value.auction.selfOwnedCountsTowardMax} onChange={(v) => set((d) => (d.auction.selfOwnedCountsTowardMax = v))} />
          <Toggle label={A.guests} checked={value.auction.guestsCanBid} onChange={(v) => set((d) => (d.auction.guestsCanBid = v))} />
          <span className="help">{A.payoutSlots}</span>
          <div className="stack">
            {value.auction.payout.map((slot, i) => (
              <div key={i} className="row">
                <span className="grow small">
                  {t.rules.slotName(slot.slot, 'place' in slot ? slot.place : undefined, 'tier' in slot ? slot.tier : undefined, value.labels.lastPlace)}
                </span>
                {slot.slot === 'bestOfTier' && (
                  <select
                    className="select input--sm"
                    aria-label={A.payoutTier}
                    value={value.tiers.includes(slot.tier) ? slot.tier : ''}
                    onChange={(e) =>
                      set((d) => {
                        const sl = d.auction.payout[i]!
                        if (sl.slot === 'bestOfTier') sl.tier = e.target.value
                      })
                    }
                  >
                    {!value.tiers.includes(slot.tier) && <option value="">{slot.tier}</option>}
                    {value.tiers.map((tier) => (
                      <option key={tier} value={tier}>
                        {tier}
                      </option>
                    ))}
                  </select>
                )}
                <NumberField
                  inputClassName="input--sm"
                  label={A.payoutSlots}
                  min={0}
                  max={100}
                  decimals={1}
                  suffix="%"
                  value={Math.round(slot.share * 1000) / 10}
                  onChange={(v) => set((d) => (d.auction.payout[i]!.share = v / 100))}
                />
              </div>
            ))}
            <p className="help">Suma: {Math.round(value.auction.payout.reduce((s, x) => s + x.share, 0) * 1000) / 10}%</p>
          </div>
        </section>
      )}
    </div>
  )
}

/** Pairing choices from the tiers: best with worst (A-D, B-C), neighbours (A-B, C-D), or none. */
function pairingOptions(tiers: string[], current: string): Array<{ value: string; label: string }> {
  const out = [{ value: '', label: '—' }]
  const n = tiers.length
  if (n >= 2 && n % 2 === 0) {
    const outer = Array.from({ length: n / 2 }, (_, i) => `${tiers[i]}-${tiers[n - 1 - i]}`).join(',')
    const next = Array.from({ length: n / 2 }, (_, i) => `${tiers[2 * i]}-${tiers[2 * i + 1]}`).join(',')
    out.push({ value: outer, label: outer.replace(/,/g, ', ') })
    if (next !== outer) out.push({ value: next, label: next.replace(/,/g, ', ') })
  }
  if (current && !out.some((o) => o.value === current)) out.push({ value: current, label: current.replace(/,/g, ', ') })
  return out
}
