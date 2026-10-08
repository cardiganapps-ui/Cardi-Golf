/**
 * A leaderboard row's spoken name: a card with nothing yet shows a dash, and a
 * screen reader heard «…, —» (#99's e2e-stack run).
 */
import { expect, it } from 'vitest'
import { t } from './es-MX'

it('a row with no figure yet is spoken without the dash', () => {
  for (const dash of ['–', '—', '-']) {
    const label = t.live.rowLabel('5', 'Diego', dash, dash, undefined)
    expect(label).not.toMatch(/[–—-]$|, [–—-]/)
    expect(label).toContain('Diego')
  }
  expect(t.live.rowLabel('1', 'Diego', '−2', 'E', '9')).toContain('−2')
})
