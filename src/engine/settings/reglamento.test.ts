/**
 * COPY-11, COPY-12: the Reglamento says what this tournament's settings say,
 * and nothing of the first tournament's sheet that they don't.
 *
 * It printed a Calcutta dinner without a Calcutta, a day-2 cut in one-day
 * events and with the cut off («máximo 0»), «los dos días», C and D tiers,
 * «se reparte entre los cuatro», «mitad hacia arriba» whatever the rounding,
 * «Premios: .» for a game with none, and «manda la hoja» (read: send the
 * sheet). Every design fixture is read here, plus settings no fixture has.
 */
import { describe, expect, it } from 'vitest'
import { FIXTURE_NAMES, getFixture } from '../../dev/fixtures'
import { t } from '../../i18n/es-MX'
import { formatMoney } from '../../lib/money'
import { cardSigningMode } from '../core/cardSigning'
import { makeFirstTournament, makeRound, makeSnapshot } from '../testing/fixtures'
import type { Snapshot } from '../types'
import { cutApplies } from './describeModule'
import { individualPrizeAmounts, fieldShape, snakePotPerGroup } from './prizeCheck'
import { DEFAULT_SETTINGS, FIRST_TOURNAMENT_SETTINGS } from './presets'
import { reglamento, type RulesSection } from './reglamento'
import { MODULE_IDS, parseSettings, type TournamentSettings } from './schema'

const R = t.rules
const text = (sections: RulesSection[]) => sections.flatMap((s) => s.lines).join('\n')
const section = (sections: RulesSection[], id: string) => sections.find((s) => s.id === id)

const TOURNAMENTS: Array<{ name: string; snapshot: Snapshot; settings: TournamentSettings }> = FIXTURE_NAMES.map((name) => {
  const f = getFixture(name)!
  return { name, snapshot: f.snapshot, settings: parseSettings(f.snapshot.tournament.settings) }
})

describe('the Reglamento follows the settings, on every fixture (COPY-11)', () => {
  it('covers the fixtures the finding names', () => {
    for (const name of ['full12-live', 'minimal4-live', 'gloria4', 'pairs8', 'friends8', 'stroke8', 'match8', 'team8', 'firma4', 'calcutta12']) expect(FIXTURE_NAMES).toContain(name)
  })

  for (const { name, snapshot, settings } of TOURNAMENTS) {
    describe(name, () => {
      const doc = reglamento(snapshot, settings)
      const all = text(doc)
      const m = settings.modules
      const days = Math.max(settings.rounds, snapshot.rounds.filter((r) => r.status !== 'cancelled').length)

      it('has a section for each game that is on, under its own label, and none for one that is off', () => {
        for (const id of MODULE_IDS) {
          expect(!!section(doc, id), id).toBe(m[id].enabled)
          if (m[id].enabled) expect(section(doc, id)!.title).toBe(m[id].label)
        }
        for (const g of settings.games) expect(!!section(doc, `game-${g.id}`), g.id).toBe(g.enabled)
        expect(doc[0]!.id).toBe('summary')
        expect(doc.at(-1)!.id).toBe('glossary')
      })

      it('names the Calcutta, its night and its pozo only when there is one', () => {
        if (m.auction.enabled) {
          expect(section(doc, 'summary')!.lines.join(' ')).toContain(m.auction.label)
          expect(all).toMatch(/\bpozo\b/)
        } else {
          expect(all).not.toMatch(/Calcutta|subasta|martill|\bpozo\b|lote/i)
        }
      })

      it('speaks of a cut, of day 2 and of «los dos días» only where the settings have them', () => {
        if (!cutApplies(settings, days)) expect(all).not.toMatch(/Recorte del día 2|Recorte de hándicap|recortado|máximo 0/)
        if (days !== 2) expect(all).not.toMatch(/los dos días/)
        if (days < 2) expect(all).not.toMatch(/día 2|último día|cada día|Sin recorte/)
        if (cutApplies(settings, days)) expect(section(doc, 'handicaps')!.lines.join(' ')).toContain(`máximo ${settings.day2Cut.maxStrokes}`)
      })

      it('names tiers only when the tournament has them, and the Calcutta’s tier places from its payout', () => {
        if (!settings.tiers.length) expect(all).not.toMatch(/Categorías|categoría/)
        else expect(section(doc, 'field')!.lines.join(' ')).toContain(t.common.andList(settings.tiers))
        const tiers = settings.auction.payout.flatMap((s) => (s.slot === 'bestOfTier' ? [s.tier] : []))
        if (m.auction.enabled && tiers.length) expect(section(doc, 'auction')!.lines.join(' ')).toContain(`categoría ${t.common.orList(tiers)}`)
        if (m.auction.enabled && !tiers.length) expect(section(doc, 'auction')!.lines.join(' ')).not.toMatch(/categoría/)
      })

      it('prints the settings’ own numbers', () => {
        const S = section(doc, 'summary')!.lines.join(' ')
        if (settings.entryFee > 0) expect(S).toContain(`${formatMoney(settings.entryFee)} de inscripción`)
        else expect(S).not.toMatch(/inscripción de \$|paga \$/)
        const hcp = section(doc, 'handicaps')!.lines.join(' ')
        if (settings.handicap.allowance > 0) {
          expect(hcp).toContain(`${Math.round(settings.handicap.allowance * 100)}% del hándicap base, con tope de ${settings.handicap.cap}`)
          expect(hcp).toContain(R.rounding[settings.handicap.rounding])
        }
        if (m.individual.enabled) {
          const amounts = individualPrizeAmounts(settings, fieldShape(snapshot, settings)).filter((x) => x > 0)
          const ind = section(doc, 'individual')!.lines.join(' ')
          for (const a of amounts) expect(ind).toContain(formatMoney(a))
          if (!amounts.length) expect(ind).toContain(R.noPrize)
          expect(ind).not.toContain('Premios: .')
        }
        if (m.snake.enabled) {
          const s = section(doc, 'snake')!.lines.join(' ')
          expect(s).toContain(`${m.snake.puttsThreshold} putts o más`)
          if (settings.prizes.snakePerSurvivor > 0) expect(s).toContain(`${formatMoney(settings.prizes.snakePerSurvivor)} de la bolsa (${formatMoney(snakePotPerGroup(settings))} por grupo)`)
          expect(s).not.toMatch(/entre los cuatro/)
        }
        if (m.bestRound.enabled && settings.prizes.bestRoundPerDay > 0) expect(section(doc, 'bestRound')!.lines.join(' ')).toContain(formatMoney(settings.prizes.bestRoundPerDay))
        if (m.fewestPutts.enabled) expect(section(doc, 'fewestPutts')!.lines.join(' ')).toContain(`cuenta ${settings.pickupPuttsForFewestPutts} putts`)
        if (m.pairs.enabled) for (const [a, b] of m.pairs.pairing) expect(section(doc, 'pairs')!.lines.join(' ')).toContain(`${a} con ${b}`)
        if (m.auction.enabled) {
          const a = section(doc, 'auction')!.lines.join(' ')
          expect(a).toContain(`en ${formatMoney(settings.auction.openingBid)} y las pujas suben de ${formatMoney(settings.auction.increment)}`)
          expect(a).toContain(`Máximo ${settings.auction.maxPlayersPerOwner} jugadores por dueño`)
          if (settings.auction.buybackMaxPct > 0) expect(a).toContain(`hasta el ${settings.auction.buybackMaxPct}%`)
        }
      })

      it('says who signs the cards by the tournament’s rule', () => {
        expect(section(doc, 'cards')!.lines).toEqual([R.cards.enter, R.cards[cardSigningMode(settings)]])
      })

      it('leaves out the platform’s generic last place, and says the precedence plainly (COPY-12)', () => {
        if (settings.labels.lastPlace === DEFAULT_SETTINGS.labels.lastPlace) expect(all).not.toContain(`gana ${DEFAULT_SETTINGS.labels.lastPlace}`)
        expect(all).not.toMatch(/manda la hoja/)
        expect(section(doc, 'governance')!.lines.join(' ')).toContain('vale esta página')
      })

      it('defines the golf words its rules use, and only those (COPY-12)', () => {
        const words = section(doc, 'glossary')!.lines
        expect(words).toContain(R.glossary.par)
        expect(words.includes(R.glossary.auction(m.auction.label))).toBe(m.auction.enabled)
        const putting = m.snake.enabled || m.fewestPutts.enabled || settings.games.some((g) => g.enabled && g.type === 'eventPot' && g.options.event === 'threePutt')
        expect(words.includes(R.glossary.putts)).toBe(putting)
        expect(words.includes(R.glossary.handicap)).toBe(settings.handicap.allowance > 0)
      })
    })
  }
})

describe('a tournament with no money at all reads as one (COPY-12)', () => {
  it('gloria4: «En corto» is one sentence and no figure is a peso', () => {
    const f = getFixture('gloria4')!
    const doc = reglamento(f.snapshot, parseSettings(f.snapshot.tournament.settings))
    expect(section(doc, 'summary')!.lines).toEqual([R.summary.noMoney])
    expect(text(doc)).not.toMatch(/\$/)
  })
})

describe('«En corto» on the first tournament (COPY-12)', () => {
  const snap = makeFirstTournament()
  const doc = reglamento(snap, FIRST_TOURNAMENT_SETTINGS)
  const S = section(doc, 'summary')!.lines

  it('what you pay, what the bolsa pays, the Calcutta apart, who holds the money', () => {
    expect(S[0]).toBe('Cada jugador paga $2,500 de inscripción. Con 12 jugadores, la bolsa es de $30,000.')
    expect(S[1]).toBe('De la bolsa salen los premios: Individual ($20,000), Los Matrimonios ($3,000), Mejor ronda ($2,400), La Víbora ($3,600) y Menos putts ($1,000).')
    expect(S[2]).toContain('La Calcutta va aparte de la bolsa')
    expect(S.some((l) => l.endsWith('es el banquero: junta el dinero y paga los premios.'))).toBe(true)
    expect(S.at(-1)).toBe(R.summary.settle)
  })

  it('the snake is paid from the bolsa, never the pozo (COPY-14)', () => {
    expect(section(doc, 'snake')!.lines.join(' ')).toContain('$200 de la bolsa ($600 por grupo)')
    expect(section(doc, 'snake')!.lines.join(' ')).not.toMatch(/\bpozo\b/)
  })

  it('the pairs are drawn on the Calcutta’s night, and the honoree picks', () => {
    expect(section(doc, 'pairs')!.lines[0]).toContain('sorteadas al terminar la noche de la Calcutta.')
  })

  it('the C and D places come from the payout', () => {
    expect(section(doc, 'auction')!.lines.join(' ')).toContain('si uno de la categoría C o D queda en un lugar mejor')
  })
})

describe('settings no fixture has', () => {
  const base = (s: Partial<TournamentSettings>, rounds?: Snapshot['rounds']) => {
    const settings = { ...DEFAULT_SETTINGS, ...s } as TournamentSettings
    return { doc: reglamento(makeSnapshot({ settings, rounds }), settings), settings }
  }

  it('a cut set but a one-day event: no cut line (MONEY-14)', () => {
    const { doc } = base({ rounds: 1, day2Cut: { ...DEFAULT_SETTINGS.day2Cut, maxStrokes: 4 } })
    expect(text(doc)).not.toMatch(/[Rr]ecorte/)
  })

  it('two days and the cut off: one sentence says so', () => {
    const { doc } = base({ rounds: 2 })
    expect(section(doc, 'handicaps')!.lines).toContain('Sin recorte: lo que hagas un día no cambia tu hándicap del siguiente.')
  })

  it('the rounding is the setting’s', () => {
    for (const rounding of ['floor', 'ceil', 'halfDown', 'nearestEven', 'halfUp'] as const) {
      const { doc } = base({ handicap: { ...DEFAULT_SETTINGS.handicap, rounding } })
      expect(section(doc, 'handicaps')!.lines.join(' ')).toContain(R.rounding[rounding])
    }
  })

  it('a scratch event says so and nothing about strokes received', () => {
    const { doc } = base({ handicap: { ...DEFAULT_SETTINGS.handicap, allowance: 0 } })
    expect(section(doc, 'handicaps')!.lines).toEqual(['Se juega sin hándicap: nadie recibe golpes de ventaja y cuentan los golpes tal cual.'])
    expect(section(doc, 'glossary')!.lines).not.toContain(R.glossary.handicap)
  })

  it('9-hole days: the tiebreak reads the last nine’s holes, and half the handicap', () => {
    const { doc } = base({}, [makeRound(1, { holes: 9 })])
    expect(section(doc, 'individual')!.lines.join(' ')).toContain('en los hoyos del 5 al 9, del 7 al 9 y el 9')
    expect(section(doc, 'handicaps')!.lines).toContain('En una ronda de 9 hoyos cuenta la mitad del hándicap de juego.')
    expect(section(doc, 'field')!.lines[0]).toContain('un día de 9 hoyos')
  })

  it('three days: «los 3 días», and a cut that reads day by day', () => {
    const { doc } = base({ rounds: 3, modules: { ...DEFAULT_SETTINGS.modules, pairs: { enabled: true, label: 'Parejas', pairing: [], honoreePicks: false } }, day2Cut: { ...DEFAULT_SETTINGS.day2Cut, maxStrokes: 3 } })
    expect(section(doc, 'pairs')!.lines.join(' ')).toContain('juegan juntas los 3 días')
    expect(section(doc, 'pairs')!.lines[0]).toBe('Parejas fijas, sorteadas por el Comité.')
    expect(section(doc, 'handicaps')!.lines.join(' ')).toContain('al día siguiente se te recorta')
  })

  it('a snake for no money says so, under its own name (STRAT-11)', () => {
    const { doc } = base({ modules: { ...DEFAULT_SETTINGS.modules, snake: { enabled: true, label: 'El Tres Putts', puttsThreshold: 3 } } })
    const s = section(doc, 'snake')!
    expect(s.title).toBe('El Tres Putts')
    expect(s.lines.join(' ')).toContain('el Tres Putts pasa a quien hace 3 putts')
    expect(s.lines.join(' ')).toContain('Es sin dinero')
    expect(text(doc)).not.toMatch(/víbora/i)
  })

  it('the house cut is said apart from the prizes', () => {
    const { doc } = base({ entryFee: 500, houseCut: 400, prizes: { ...DEFAULT_SETTINGS.prizes, stableford: [3600] } })
    expect(section(doc, 'summary')!.lines).toContain('$400 de la bolsa no son premio: se apartan para los gastos del torneo.')
  })
})
