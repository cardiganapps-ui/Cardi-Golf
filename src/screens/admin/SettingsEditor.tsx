/**
 * Form over TournamentSettings (§18). Every rule is a field; the prize-pool
 * check (§5.8) is live. Used by the wizard (compact) and the admin.
 */
import { useMemo } from 'react'
import { t } from '../../i18n/es-MX'
import { Field, Toggle } from '../../components/ui'
import { formatMoney } from '../../lib/money'
import { MODULE_IDS, safeParseSettings, type ModuleId, type TournamentSettings } from '../../engine/settings/schema'
import { checkPrizePool } from '../../engine/settings/prizeCheck'

interface Props {
  value: TournamentSettings
  onChange: (v: TournamentSettings) => void
  players: number
  compact?: boolean
}

const numList = (s: string) =>
  s
    .split(/[,\s]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && n >= 0)
const strList = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)

export function SettingsEditor({ value, onChange, players, compact }: Props) {
  const set = (fn: (d: TournamentSettings) => void) => {
    const d = structuredClone(value)
    fn(d)
    onChange(d)
  }
  const parsed = useMemo(() => safeParseSettings(value), [value])
  const check = useMemo(() => (parsed.success ? checkPrizePool(parsed.data, { players }) : null), [parsed, players])
  const m = value.modules
  const A = t.admin.tournament

  return (
    <div className="stack stack--lg">
      <section className="stack">
        <span className="label">{A.modules}</span>
        {MODULE_IDS.map((id: ModuleId) => (
          <div key={id} className="card card--cell" style={{ padding: '6px 14px' }}>
            <Toggle label={m[id].label} checked={m[id].enabled} onChange={(v) => set((d) => (d.modules[id].enabled = v))} />
            {m[id].enabled && !compact && (
              <Field label={A.moduleLabel}>
                <input className="input input--sm" value={m[id].label} onChange={(e) => set((d) => (d.modules[id].label = e.target.value))} />
              </Field>
            )}
            {m[id].enabled && id === 'pairs' && !compact && (
              <div className="grid2" style={{ marginTop: 8 }}>
                <Field label="Reglas de pareja (A-D, B-C)">
                  <input
                    className="input input--sm"
                    defaultValue={m.pairs.pairing.map((p) => p.join('-')).join(', ')}
                    onBlur={(e) =>
                      set((d) => {
                        d.modules.pairs.pairing = strList(e.target.value)
                          .map((p) => p.split('-').map((x) => x.trim()))
                          .filter((p): p is [string, string] => p.length === 2 && !!p[0] && !!p[1])
                      })
                    }
                  />
                </Field>
                <Toggle label="El homenajeado escoge pareja" checked={m.pairs.honoreePicks} onChange={(v) => set((d) => (d.modules.pairs.honoreePicks = v))} />
              </div>
            )}
            {m[id].enabled && id === 'snake' && !compact && (
              <Field label="Putts que pasan la víbora">
                <input className="input input--sm input--num" type="number" min={2} max={10} value={m.snake.puttsThreshold} onChange={(e) => set((d) => (d.modules.snake.puttsThreshold = Number(e.target.value) || 3))} />
              </Field>
            )}
          </div>
        ))}
      </section>

      <section className="stack">
        <span className="label">{A.rules}</span>
        <div className="grid2">
          <Field label={A.rounds}>
            <input className="input input--num" type="number" min={1} max={10} value={value.rounds} onChange={(e) => set((d) => (d.rounds = Number(e.target.value) || 1))} />
          </Field>
          <Field label={A.groupSize}>
            <input className="input input--num" type="number" min={2} max={4} value={value.groupSize} onChange={(e) => set((d) => (d.groupSize = Number(e.target.value) || 4))} />
          </Field>
        </div>
        <Field label={A.tiers}>
          <input className="input" defaultValue={value.tiers.join(', ')} onBlur={(e) => set((d) => (d.tiers = strList(e.target.value)))} placeholder="A, B, C, D" />
        </Field>
        {!compact && (
          <div className="grid2">
            <Field label={A.lastPlaceLabel}>
              <input className="input" value={value.labels.lastPlace} onChange={(e) => set((d) => (d.labels.lastPlace = e.target.value))} />
            </Field>
            <Field label={A.honoreeLabel}>
              <input className="input" value={value.labels.honoree} onChange={(e) => set((d) => (d.labels.honoree = e.target.value))} />
            </Field>
          </div>
        )}
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
          </>
        )}
        {!compact && <Toggle label="Ajustar hándicap por slope de cada ronda" hint="Apagado: un solo hándicap base para todo el torneo." checked={value.handicap.perRoundSlope} onChange={(v) => set((d) => (d.handicap.perRoundSlope = v))} />}
      </section>

      <section className="stack">
        <span className="label">{A.prizesTitle}</span>
        <Field label={A.entryFee}>
          <input className="input input--num" type="number" min={0} value={value.entryFee} onChange={(e) => set((d) => (d.entryFee = Number(e.target.value) || 0))} />
        </Field>
        {m.individual.enabled && (
          <Field label={A.stablefordPrizes}>
            <input className="input" defaultValue={value.prizes.stableford.join(', ')} onBlur={(e) => set((d) => (d.prizes.stableford = numList(e.target.value)))} />
          </Field>
        )}
        {m.pairs.enabled && (
          <Field label={A.pairsPrizes}>
            <input className="input" defaultValue={value.prizes.pairs.join(', ')} onBlur={(e) => set((d) => (d.prizes.pairs = numList(e.target.value)))} />
          </Field>
        )}
        <div className="grid3">
          {m.bestRound.enabled && (
            <Field label={A.bestRoundPerDay}>
              <input className="input input--num" type="number" min={0} value={value.prizes.bestRoundPerDay} onChange={(e) => set((d) => (d.prizes.bestRoundPerDay = Number(e.target.value) || 0))} />
            </Field>
          )}
          {m.snake.enabled && (
            <Field label={A.snakePerSurvivor}>
              <input className="input input--num" type="number" min={0} value={value.prizes.snakePerSurvivor} onChange={(e) => set((d) => (d.prizes.snakePerSurvivor = Number(e.target.value) || 0))} />
            </Field>
          )}
          {m.fewestPutts.enabled && (
            <Field label={A.fewestPutts}>
              <input className="input input--num" type="number" min={0} value={value.prizes.fewestPutts} onChange={(e) => set((d) => (d.prizes.fewestPutts = Number(e.target.value) || 0))} />
            </Field>
          )}
        </div>
        {!compact && m.fewestPutts.enabled && (
          <Field label={A.pickupPutts}>
            <input className="input input--num" type="number" min={0} max={10} value={value.pickupPuttsForFewestPutts} onChange={(e) => set((d) => (d.pickupPuttsForFewestPutts = Number(e.target.value) || 0))} />
          </Field>
        )}

        <div className={`card ${check?.balanced ? 'card--cell' : ''}`} style={{ background: check?.balanced ? undefined : 'var(--coral)', color: check?.balanced ? undefined : '#fff' }}>
          <strong>{A.balance}</strong>
          {!parsed.success && (
            <p className="small">
              {A.invalid} {parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' · ')}
            </p>
          )}
          {check && (
            <>
              <table className="table" style={{ marginTop: 8, color: 'inherit' }}>
                <tbody>
                  {check.lines.map((l) => (
                    <tr key={l.moduleId}>
                      <td>
                        {l.label} <span className="small" style={{ opacity: 0.8 }}>({l.detail})</span>
                      </td>
                      <td className="num">{formatMoney(l.amount)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td>
                      <strong>{t.money.prizes}</strong>
                    </td>
                    <td className="num">
                      <strong>{formatMoney(check.prizesTotal)}</strong>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      {t.money.entryFee} × {players}
                    </td>
                    <td className="num">{formatMoney(check.entryPot)}</td>
                  </tr>
                </tbody>
              </table>
              <p style={{ marginTop: 8, fontWeight: 700 }}>{check.balanced ? `✓ ${A.balanced}` : A.notBalanced(formatMoney(Math.abs(check.difference)))}</p>
            </>
          )}
        </div>
      </section>

      {!compact && m.auction.enabled && (
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
                  {slot.slot === 'place' ? `${slot.place}º lugar` : slot.slot === 'bestOfTier' ? `Mejor ${slot.tier}` : value.labels.lastPlace}
                </span>
                <input
                  className="input input--sm input--num"
                  style={{ width: 90 }}
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
