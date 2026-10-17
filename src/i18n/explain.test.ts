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
import { strokesWhy } from '../engine/formats'
import { msg, type Msg, type MsgCode } from '../engine/messages'
import { parseSettings } from '../engine/settings/schema'
import { formatMoney, formatMoneyCents } from '../lib/money'
import { explain } from './es-MX'
import { renderExplanation, renderMsg } from './explain'

const isMsg = (x: unknown): x is Msg => !!x && typeof x === 'object' && 'code' in x && 'params' in x

/** Every message in a value, with its path; never inside a message's own figures. */
function messages(v: unknown, path: string, out: Array<[string, Msg]> = []): Array<[string, Msg]> {
  if (isMsg(v)) out.push([path, v])
  else if (Array.isArray(v)) v.forEach((x, i) => messages(x, `${path}[${i}]`, out))
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k !== 'settings') messages(x, `${path}.${k}`, out)
  return out
}

/** Where the state keeps words: an explanation's title and steps, and the lists of warnings. */
function wordsLeftAsText(v: unknown, path: string, out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x, i) => wordsLeftAsText(x, `${path}[${i}]`, out))
  else if (v && typeof v === 'object' && !isMsg(v)) {
    for (const [k, x] of Object.entries(v)) {
      if (k === 'settings') continue
      if (/^(why|playingHcpWhy|countbackWhy)$/.test(k) && x) for (const e of [x].flat() as Array<{ title: unknown; steps: unknown[] }>) for (const m of [e.title, ...e.steps]) if (!isMsg(m)) out.push(`${path}.${k}`)
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
  const holes = Object.values(state.core.rounds).flatMap((byPlayer) => Object.values(byPlayer).flatMap((pr) => pr.holes))
  return { name, state, extra: { close: closeCheck(snap, settings, { openRejected: null }), strokes: holes.flatMap((h) => [strokesWhy(h, true), strokesWhy(h, false)]) } }
})

describe('the engine says codes, and the renderer writes them (ARCH-05)', () => {
  it.each(STATES.map((s) => [s.name, s] as const))('%s: no explanation or warning is words the engine wrote', (_, s) => {
    expect(wordsLeftAsText(s.state, s.name)).toEqual([])
  })

  it.each(STATES.map((s) => [s.name, s] as const))('%s: every message renders to a sentence, money the formatter’s', (_, s) => {
    const all = [...messages(s.state, s.name), ...messages(s.extra, `${s.name}.extra`)]
    expect(all.length).toBeGreaterThan(0)
    for (const [path, m] of all) {
      const text = renderMsg(m, 'MXN')
      expect(text, `${path} (${m.code})`).not.toBe('')
      expect(text, `${path} (${m.code})`).not.toMatch(/undefined|NaN|\[object Object\]|\$\d{4,}|c\/u/)
    }
  })

  it('every code the engine says has its words', () => {
    const codes = new Set(STATES.flatMap((s) => [...messages(s.state, ''), ...messages(s.extra, '')].map(([, m]) => m.code)))
    for (const code of codes) expect(Object.keys(explain), code).toContain(code)
  })

  it('writes money in the tournament’s currency, with the app’s one formatter', () => {
    for (const currency of ['MXN', 'USD', 'EUR']) {
      expect(renderMsg(msg('prize.place', { place: 1, amount: 10000 }), currency)).toBe(`El 1.º lugar paga ${formatMoney(10000, currency)}`)
      expect(renderMsg(msg('settle.part', { label: 'Inscripción', amount: -500, of: null }), currency)).toBe(`Inscripción: ${formatMoney(-500, currency)}`)
      expect(renderMsg(msg('auction.shareOf', { share: 0.55, pot: 11750, raw: 6462.5 }), currency)).toBe(`55% de ${formatMoney(11750, currency)} = ${formatMoneyCents(6462.5, currency)}`)
    }
    // The same figure on the screen and in its «¿Cómo se calculó?»: «$10,000» on both, never «$10000».
    expect(renderMsg(msg('amount', { amount: 10000 }), 'MXN')).toBe('$10,000')
    expect(renderMsg(msg('amount', { amount: -0.4 }), 'MXN')).toBe('$0')
    expect(formatMoneyCents(6462.5, 'MXN')).toBe('$6,462.50')
    expect(formatMoneyCents(6600, 'MXN')).toBe('$6,600')
  })

  it('an explanation in words (a format’s rules) comes back as it is; a code its catalog lacks says nothing', () => {
    const rules = { title: 'Stableford', steps: ['Cada hoyo da puntos.'] }
    expect(renderExplanation(rules, 'MXN')).toBe(rules)
    expect(renderMsg({ code: 'never.heard' as MsgCode, params: {} } as unknown as Msg, 'MXN')).toBe('')
  })
})
