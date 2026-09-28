/**
 * Form over TournamentSettings (§18) for Comité › Torneo. Every rule is a
 * field; the prize-pool balance is live in the money section.
 */
import { t } from '../../i18n/es-MX'
import { Field, Toggle } from '../../components/ui'
import type { TournamentSettings } from '../../engine/settings/schema'
import type { FieldShape } from '../../engine/settings/prizeCheck'
import { FormatEditor } from '../organizer/setup/FormatEditor'
import { GameCatalog } from '../organizer/setup/GameCatalog'
import { MoneyEditor } from '../organizer/setup/MoneyEditor'

interface Props {
  value: TournamentSettings
  onChange: (v: TournamentSettings) => void
  /** The field the prize check uses: players, real group sizes, game entrants. */
  field: FieldShape
}

/**
 * The Comité's editor: the same format, catalog and money components as the
 * create wizard, plus the rules only the Comité touches (labels, the next-day
 * cut, slope, the Calcutta).
 */
export function SettingsEditor({ value, onChange, field }: Props) {
  const set = (fn: (d: TournamentSettings) => void) => {
    const d = structuredClone(value)
    fn(d)
    onChange(d)
  }
  const m = value.modules
  const A = t.admin.tournament

  return (
    <div className="stack stack--lg">
      <section className="stack">
        <span className="label">{A.rules}</span>
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

      <section className="stack">
        <span className="label">{A.modules}</span>
        <GameCatalog value={value} onChange={onChange} />
      </section>

      <section className="stack">
        <span className="label">{A.handicap}</span>
        <div className="grid2">
          <Field label={A.allowance}>
            <input
              className="input input--num"
              type="number"
              min={0}
              max={100}
              value={Math.round(value.handicap.allowance * 100)}
              onChange={(e) => set((d) => (d.handicap.allowance = (Number(e.target.value) || 0) / 100))}
            />
          </Field>
          <Field label={A.cap}>
            <input className="input input--num" type="number" min={0} max={54} value={value.handicap.cap} onChange={(e) => set((d) => (d.handicap.cap = Number(e.target.value) || 0))} />
          </Field>
        </div>
        {value.rounds > 1 && (
          <>
            <span className="help">{A.cutTitle}</span>
            <div className="grid3">
              <Field label={A.cutThreshold}>
                <input className="input input--num" type="number" value={value.day2Cut.threshold} onChange={(e) => set((d) => (d.day2Cut.threshold = Number(e.target.value) || 0))} />
              </Field>
              <Field label={A.cutPer}>
                <input className="input input--num" type="number" min={1} value={value.day2Cut.pointsPerStroke} onChange={(e) => set((d) => (d.day2Cut.pointsPerStroke = Number(e.target.value) || 1))} />
              </Field>
              <Field label={A.cutMax}>
                <input className="input input--num" type="number" min={0} value={value.day2Cut.maxStrokes} onChange={(e) => set((d) => (d.day2Cut.maxStrokes = Number(e.target.value) || 0))} />
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

      <section className="stack">
        <span className="label">{A.prizesTitle}</span>
        <MoneyEditor value={value} onChange={onChange} field={field} />
        {m.fewestPutts.enabled && (
          <Field label={A.pickupPutts}>
            <input className="input input--num" type="number" min={0} max={10} value={value.pickupPuttsForFewestPutts} onChange={(e) => set((d) => (d.pickupPuttsForFewestPutts = Number(e.target.value) || 0))} />
          </Field>
        )}
      </section>

      {m.auction.enabled && (
        <section className="stack">
          <span className="label">{A.auctionTitle}</span>
          <div className="grid3">
            <Field label={A.openingBid}>
              <input className="input input--num" type="number" min={1} value={value.auction.openingBid} onChange={(e) => set((d) => (d.auction.openingBid = Number(e.target.value) || 1))} />
            </Field>
            <Field label={A.increment}>
              <input className="input input--num" type="number" min={1} value={value.auction.increment} onChange={(e) => set((d) => (d.auction.increment = Number(e.target.value) || 1))} />
            </Field>
            <Field label={A.maxPerOwner}>
              <input className="input input--num" type="number" min={1} value={value.auction.maxPlayersPerOwner} onChange={(e) => set((d) => (d.auction.maxPlayersPerOwner = Number(e.target.value) || 1))} />
            </Field>
          </div>
          <Field label={A.buybackMax}>
            <input className="input input--num" type="number" min={0} max={100} value={value.auction.buybackMaxPct} onChange={(e) => set((d) => (d.auction.buybackMaxPct = Number(e.target.value) || 0))} />
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
                <input
                  className="input input--sm input--num"
                  type="number"
                  min={0}
                  max={100}
                  value={Math.round(slot.share * 1000) / 10}
                  onChange={(e) => set((d) => (d.auction.payout[i]!.share = (Number(e.target.value) || 0) / 100))}
                />
                <span className="small">%</span>
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
