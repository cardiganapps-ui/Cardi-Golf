/**
 * MONEY-15: «¿Cómo se calculó?» is the trust feature, so what it says must
 * read like the screen and add up. Over every design fixture:
 *   - no amount is written without its thousands («$10000» beside «$10,000»);
 *   - every prize's title is what that prize pays (a team member paid $1,001
 *     read «$2001», the whole team's prize).
 */
import { describe, expect, it } from 'vitest'
import { FIXTURE_NAMES, getFixture } from '../dev/fixtures'
import { computeTournament } from './computeTournament'
import { pesos } from './core/pesos'
import { parseSettings } from './settings/schema'
import { words } from './testing/words'

/** The first amount a text writes, as written. */
const figure = (text: string) => /−?\$[\d,]+/.exec(text)?.[0] ?? null

/** Every string under `x`, with the path it was found at. */
function strings(x: unknown, path = '', out: Array<[string, string]> = []): Array<[string, string]> {
  if (typeof x === 'string') out.push([path, x])
  else if (Array.isArray(x)) x.forEach((v, i) => strings(v, `${path}[${i}]`, out))
  else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) strings(v, `${path}.${k}`, out)
  return out
}

describe('the engine’s explanations (MONEY-15)', () => {
  it('formats pesos one way: «$10,000», «−$1,200», whole', () => {
    expect([pesos(10000), pesos(1234567), pesos(0), pesos(-1200), pesos(999.6), pesos(-0.4)]).toEqual(['$10,000', '$1,234,567', '$0', '−$1,200', '$1,000', '$0'])
  })

  describe.each(FIXTURE_NAMES)('%s', (name) => {
    const fx = getFixture(name)!
    const state = computeTournament(fx.snapshot, parseSettings(fx.snapshot.tournament.settings))

    it('writes every amount with its thousands', () => {
      expect(strings(state).filter(([, s]) => /\$\d{4}/.test(s))).toEqual([])
    })

    it('titles every prize with what it pays', () => {
      // «$1,000 cada uno», «Camilo paga $300»: the title's figure is the prize's.
      const wrong = state.prizes.filter((p) => figure(words(p.why).title) !== pesos(p.amount)).map((p) => `${p.label} (${p.playerId}): paid ${pesos(p.amount)}, titled «${words(p.why).title}»`)
      expect(wrong).toEqual([])
    })
  })
})
