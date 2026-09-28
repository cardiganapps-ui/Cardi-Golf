/**
 * The shape of the tournament: days, field, group size, handicap allowance
 * and optional tiers. Used by the wizard; the Comité edits the same fields in
 * SettingsEditor.
 */
import { useState } from 'react'
import { t } from '../../../i18n/es-MX'
import { Field, Segmented, Toggle } from '../../../components/ui'
import type { TournamentSettings } from '../../../engine/settings/schema'
import { NumberInput } from './NumberInput'
import { Group } from './Group'
import styles from './Setup.module.css'

const W = t.organizer.wizard
const ALLOWANCES = ['1', '0.9', '0.8', '0'] as const

export function FormatEditor({ value, onChange, players, onPlayers }: { value: TournamentSettings; onChange: (v: TournamentSettings) => void; players?: number; onPlayers?: (n: number) => void }) {
  const set = (fn: (d: TournamentSettings) => void) => {
    const d = structuredClone(value)
    fn(d)
    onChange(d)
  }
  const [newTier, setNewTier] = useState('')
  const allowance = ALLOWANCES.find((a) => Number(a) === value.handicap.allowance) ?? String(value.handicap.allowance)
  const addTier = () => {
    const name = newTier.trim().slice(0, 12)
    if (!name || value.tiers.includes(name)) return
    set((d) => d.tiers.push(name))
    setNewTier('')
  }
  return (
    <div className={styles.section}>
      {onPlayers && (
        <Field label={W.players} hint={W.playersHint}>
          <NumberInput label={W.players} value={players ?? 2} min={2} max={200} onChange={onPlayers} />
        </Field>
      )}
      <Group label={W.rounds}>
        <Segmented value={String(value.rounds)} options={['1', '2', '3', '4'].map((n) => ({ value: n, label: n }))} onChange={(v) => set((d) => (d.rounds = Number(v)))} />
      </Group>
      <Group label={W.groupSize}>
        <Segmented value={String(value.groupSize)} options={['2', '3', '4'].map((n) => ({ value: n, label: n }))} onChange={(v) => set((d) => (d.groupSize = Number(v)))} />
      </Group>
      <Group label={W.handicap} hint={W.handicapHint}>
        <Segmented
          value={allowance}
          options={ALLOWANCES.map((a) => ({ value: a, label: a === '0' ? W.noHandicap : `${Math.round(Number(a) * 100)}%` }))}
          onChange={(v) => set((d) => (d.handicap.allowance = Number(v)))}
        />
      </Group>
      <Toggle
        label={W.tiersOn}
        hint={W.tiersHint}
        checked={value.tiers.length > 0}
        onChange={(on) =>
          set((d) => {
            d.tiers = on ? ['A', 'B', 'C', 'D'] : []
            scrubTiers(d)
          })
        }
      />
      {value.tiers.length > 0 && (
        <div className={styles.tiers}>
          {value.tiers.map((tier) => (
            <span key={tier} className={styles.tier}>
              {tier}
              <button type="button" aria-label={`${t.setup.remove} ${tier}`} onClick={() => set((d) => {
                d.tiers = d.tiers.filter((x) => x !== tier)
                scrubTiers(d)
              })}>
                ×
              </button>
            </span>
          ))}
          <input className="input input--sm" style={{ width: '8em' }} value={newTier} placeholder={W.tierName} aria-label={W.tierName} onChange={(e) => setNewTier(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTier())} />
          <button type="button" className="btn btn--secondary btn--sm" onClick={addTier}>
            {W.tierAdd}
          </button>
        </div>
      )}
    </div>
  )
}

/** Rules that name a tier that no longer exists go with it (pairing rules, Calcutta tier slots). */
function scrubTiers(d: TournamentSettings) {
  const tiers = new Set(d.tiers)
  d.modules.pairs.pairing = d.modules.pairs.pairing.filter(([a, b]) => tiers.has(a) && tiers.has(b))
  const kept = d.auction.payout.filter((s) => s.slot !== 'bestOfTier' || tiers.has(s.tier))
  const sum = kept.reduce((s, x) => s + x.share, 0)
  d.auction.payout = sum > 0 ? kept.map((s) => ({ ...s, share: s.share / sum })) : kept
}
