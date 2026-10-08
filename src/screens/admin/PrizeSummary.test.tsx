// @vitest-environment happy-dom
/**
 * MONEY-09: the prize statement names a place nobody can win, with its pesos,
 * even when the pool balances; the money bar stops saying «Cuadra».
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { checkPrizePool } from '../../engine/settings/prizeCheck'
import { DEFAULT_SETTINGS } from '../../engine/settings/presets'
import type { TournamentSettings } from '../../engine/settings/schema'
import { t } from '../../i18n/es-MX'
import { MoneyBar } from '../organizer/setup/MoneyEditor'
import { PrizeSummary } from './PrizeSummary'

const A = t.admin.tournament
const settings: TournamentSettings = { ...structuredClone(DEFAULT_SETTINGS), entryFee: 2000, prizes: { ...DEFAULT_SETTINGS.prizes, stableford: [3000, 500, 500, 2000] } }

afterEach(() => cleanup())

describe('a prize nobody can win, on screen (MONEY-09)', () => {
  it('the statement balances and still lists the 4th place with its $2,000', () => {
    render(<PrizeSummary check={checkPrizePool(settings, { players: 3 })} players={3} />)
    expect(screen.getByText(A.balanced)).toBeTruthy()
    expect(screen.getByText(A.unreachableTitle)).toBeTruthy()
    const line = screen.getByText('4 lugares con premio y 3 jugadores').closest('div')!
    expect(line.textContent).toContain('$2,000')
  })

  it('with a 4th player there is nothing to list', () => {
    render(<PrizeSummary check={checkPrizePool({ ...settings, entryFee: 1500 }, { players: 4 })} players={4} />)
    expect(screen.queryByText(A.unreachableTitle)).toBeNull()
  })

  it('the money bar does not say «Cuadra» while a prize has no taker', () => {
    render(<MoneyBar value={settings} field={{ players: 3 }} />)
    const bar = screen.getByRole('status')
    expect(bar.textContent).toContain(t.setup.bar.unreachable)
    expect(bar.textContent).not.toContain(t.setup.bar.ok)
  })
})
