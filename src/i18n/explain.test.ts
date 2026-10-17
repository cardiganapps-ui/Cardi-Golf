/**
 * ARCH-05: the engine says what happened as codes and figures, and one
 * renderer writes it. This holds the seam on every tournament we have:
 * every explanation and warning of the computed state is a code (never
 * words the engine wrote), every one of them renders to a sentence, and
 * money is written in the tournament's currency by the app's one money
 * formatter. The words themselves are pinned where they always were
 * (core/explanations.test.ts, the copy rules, each game's tests).
 */
import { describe, expect, it } from 'vitest'
import { FIXTURE_NAMES, getFixture } from '../dev/fixtures'
import { computeTournament } from '../engine/computeTournament'
import { closeCheck } from '../engine/close'
import { ALL_FORMATS, strokesWhy } from '../engine/formats'
import { GAME_ENTRIES } from '../engine/games/catalog'
import { describeGame } from '../engine/games/describe'
import { checkPrizePool } from '../engine/settings/prizeCheck'
import { reglamento } from '../engine/settings/reglamento'
import { settingsSense } from '../engine/settings/sense'
import { TournamentSettingsSchema } from '../engine/settings/schema'
import { stablefordFormat } from '../engine/formats/stableford'
import { DEFAULT_SETTINGS } from '../engine/settings/presets'
import { msg, say, type Msg, type MsgCode } from '../engine/messages'
import { parseSettings } from '../engine/settings/schema'
import { formatMoney, formatMoneyCents } from '../lib/money'
import { explain } from './es-MX'
import { issueWords, renderExplanation, renderMsg } from './explain'

const isMsg = (x: unknown): x is Msg => !!x && typeof x === 'object' && 'code' in x && 'params' in x

/** Every message in a value, with its path; never inside a message's own figures. */
function messages(v: unknown, path: string, out: Array<[string, Msg]> = []): Array<[string, Msg]> {
  if (isMsg(v)) out.push([path, v])
  else if (Array.isArray(v)) v.forEach((x, i) => messages(x, `${path}[${i}]`, out))
  else if (v && typeof v === 'object')
    for (const [k, x] of Object.entries(v)) if (k !== 'settings') messages(x, `${path}.${k}`, out)
  return out
}

/** Where the state keeps words: an explanation's title and steps, and the lists of warnings. */
function wordsLeftAsText(v: unknown, path: string, out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x, i) => wordsLeftAsText(x, `${path}[${i}]`, out))
  else if (v && typeof v === 'object' && !isMsg(v)) {
    for (const [k, x] of Object.entries(v)) {
      if (k === 'settings') continue
      if (/^(why|playingHcpWhy|countbackWhy)$/.test(k) && x)
        for (const e of [x].flat() as Array<{ title: unknown; steps: unknown[] }>)
          for (const m of [e.title, ...e.steps]) if (!isMsg(m)) out.push(`${path}.${k}`)
      if (/^(warnings|poolWarning)$/.test(k) && x) for (const m of [x].flat()) if (!isMsg(m)) out.push(`${path}.${k}`)
      wordsLeftAsText(x, `${path}.${k}`, out)
    }
  }
  return out
}

const STATES = FIXTURE_NAMES.map((name) => {
  const snap = getFixture(name)!.snapshot
  const settings = parseSettings(snap.tournament.settings)
  const state = computeTournament(snap, settings)
  const holes = Object.values(state.core.rounds).flatMap((byPlayer) =>
    Object.values(byPlayer).flatMap((pr) => pr.holes),
  )
  // ARCH-05 stage 2: the Reglamento, every format's and catalog game's rules, and the prize statement are codes too.
  const rules = {
    reglamento: reglamento(snap, settings),
    formats: Object.values(ALL_FORMATS).map((f) => f.describe(settings)),
    catalog: GAME_ENTRIES.map((e) => describeGame(e.create('x'))),
    pool: checkPrizePool(settings, { players: 2, pairs: 1, teams: 1 }),
  }
  return {
    name,
    state,
    extra: {
      close: closeCheck(snap, settings, { openRejected: null }),
      strokes: holes.flatMap((h) => [strokesWhy(h, true), strokesWhy(h, false)]),
      rules,
    },
  }
})

describe('the engine says codes, and the renderer writes them (ARCH-05)', () => {
  it.each(STATES.map((s) => [s.name, s] as const))(
    '%s: no explanation or warning is words the engine wrote',
    (_, s) => {
      expect(wordsLeftAsText(s.state, s.name)).toEqual([])
    },
  )

  it.each(STATES.map((s) => [s.name, s] as const))(
    '%s: every message renders to a sentence, money the formatter’s',
    (_, s) => {
      const all = [...messages(s.state, s.name), ...messages(s.extra, `${s.name}.extra`)]
      expect(all.length).toBeGreaterThan(0)
      for (const [path, m] of all) {
        const text = renderMsg(m, 'MXN')
        expect(text, `${path} (${m.code})`).not.toBe('')
        expect(text, `${path} (${m.code})`).not.toMatch(/undefined|NaN|\[object Object\]|\$\d{4,}|c\/u/)
      }
    },
  )

  it('the settings’ refusals and what makes no sense are codes, in words (ARCH-05 stage 2)', () => {
    const s = structuredClone(DEFAULT_SETTINGS)
    Object.assign(s, {
      currency: 'XYZ',
      timezone: 'Mars/Olympus',
      houseCut: 100000,
      entryFee: 100,
      cardSigning: 'pairs',
    })
    s.handicap.cap = 0
    const sense = settingsSense(s, { players: 4 })
    expect(sense.map((x) => x.key)).toEqual(['cap', 'houseCut', 'signingPairs', 'currency', 'timezone'])
    expect(renderMsg(sense[1]!.says, 'MXN')).toBe(
      'Los gastos del grupo se llevan $100,000 y las inscripciones suman $400.',
    )
    const bad = TournamentSettingsSchema.safeParse({ ...s, tiers: ['A', 'A'] })
    expect(bad.success).toBe(false)
    expect(bad.error!.issues.map((i) => issueWords(i, 'MXN'))).toContain('Dos categorías tienen el mismo nombre.')
    // Zod's own refusal of a value's shape keeps zod's words.
    expect(issueWords({ message: 'Too small' }, 'MXN')).toBe('Too small')
  })

  it.each(STATES.map((s) => [s.name, s] as const))(
    '%s: the labels and boards of the state are codes too (ARCH-05 stage 3)',
    (_, s) => {
      const st = s.state
      const said: unknown[] = [
        ...st.prizes.flatMap((p) => [p.label, ...(p.part ? [p.part] : [])]),
        ...st.money.flows.map((f) => f.label),
        ...st.money.unassigned.buckets.map((b) => b.label),
        ...st.money.unassigned.held.flatMap((h) => [h.label, h.note]),
        ...st.money.unassigned.assignments.map((a) => a.label),
        ...(st.modules.auction
          ? [...st.modules.auction.slots.map((x) => x.label), ...st.modules.auction.stakes.map((x) => x.label)]
          : []),
        ...(st.modules.individual
          ? [st.modules.individual.figureLabel, ...st.modules.individual.rows.map((r) => r.entrant.name)]
          : []),
        ...(st.modules.pairs ? st.modules.pairs.rows.map((r) => r.name) : []),
        ...(st.bracket ? st.bracket.rounds.map((r) => r.name) : []),
        ...Object.values(st.games).flatMap((g) =>
          [
            ...g.board.notes,
            ...g.board.sections.flatMap((sec) => [
              sec.title,
              ...sec.rows.flatMap((r) => [r.title, r.label, r.figure, r.sub]),
            ]),
          ].filter((x) => x !== undefined),
        ),
      ]
      expect(said.filter((x) => !isMsg(x))).toEqual([])
    },
  )

  it('every code the engine says has its words', () => {
    const codes = new Set(
      STATES.flatMap((s) => [...messages(s.state, ''), ...messages(s.extra, '')].map(([, m]) => m.code)),
    )
    for (const code of codes) expect(Object.keys(explain), code).toContain(code)
  })

  it('writes money in the tournament’s currency, with the app’s one formatter', () => {
    for (const currency of ['MXN', 'USD', 'EUR']) {
      expect(renderMsg(msg('prize.place', { place: 1, amount: 10000 }), currency)).toBe(
        `El 1.º lugar paga ${formatMoney(10000, currency)}`,
      )
      expect(renderMsg(msg('settle.part', { label: say('flow.entry'), amount: -500, of: null }), currency)).toBe(
        `Inscripción: ${formatMoney(-500, currency)}`,
      )
      expect(renderMsg(msg('auction.shareOf', { share: 0.55, pot: 11750, raw: 6462.5 }), currency)).toBe(
        `55% de ${formatMoney(11750, currency)} = ${formatMoneyCents(6462.5, currency)}`,
      )
    }
    // The same figure on the screen and in its «¿Cómo se calculó?»: «$10,000» on both, never «$10000».
    expect(renderMsg(msg('amount', { amount: 10000 }), 'MXN')).toBe('$10,000')
    expect(renderMsg(msg('amount', { amount: -0.4 }), 'MXN')).toBe('$0')
    expect(formatMoneyCents(6462.5, 'MXN')).toBe('$6,462.50')
    expect(formatMoneyCents(6600, 'MXN')).toBe('$6,600')
  })

  it('a format’s rules are codes too (ARCH-05 stage 2); a code its catalog lacks says nothing', () => {
    expect(renderExplanation(stablefordFormat.describe(DEFAULT_SETTINGS), 'MXN').title).toBe('Stableford')
    expect(renderMsg({ code: 'never.heard' as MsgCode, params: {} } as unknown as Msg, 'MXN')).toBe('')
  })
})
