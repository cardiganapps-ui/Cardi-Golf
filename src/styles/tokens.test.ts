/**
 * Contrast guard: every text pair the system uses must be AA (4.5:1) and every
 * figure pair AAA (7:1), because the app is read in sunlight, in both themes
 * (A11Y-09, VIS-11). The curated event accents are held to their uses and kept
 * apart from the semantic colors (VIS-09). Pairs are [foreground, background,
 * minimum ratio].
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contrast } from '../lib/contrast'
import { deltaE2000 } from '../lib/deltaE'
import { ACCENTS } from '../design/accents'

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')

/** The body of the block a selector opens, as written (the selector must appear once). */
function block(selector: string): string {
  const at = css.indexOf(`${selector} {`)
  if (at < 0 || css.indexOf(`${selector} {`, at + 1) >= 0) throw new Error(`no single block for ${selector}`)
  const start = css.indexOf('{', at) + 1
  return css.slice(start, css.indexOf('}', start))
}
function colors(body: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) out.set(m[1]!, m[2]!.toLowerCase())
  return out
}
const LIGHT = colors(block(":root,\n:where([data-theme='light'])"))
const DARK = colors(block("  :root[data-theme='dark']"))
const BASE = colors(block('\n:root'))
const THEMES = { light: LIGHT, dark: DARK } as const
type Theme = keyof typeof THEMES
const hex = (theme: Theme, name: string) => {
  const v = THEMES[theme].get(name) ?? BASE.get(name)
  if (!v) throw new Error(`token --${name} is not a color literal for the ${theme} theme`)
  return v
}
const accentBlock = (theme: Theme, id: string) =>
  colors(
    block(
      theme === 'light'
        ? `\n[data-accent='${id}']`
        : `  :root[data-theme='dark'] [data-accent='${id}']:not([data-theme='light'])`,
    ),
  )
/** An accent's own values in a theme: Fairway is :root's. */
function accent(theme: Theme, id: string) {
  const own = id === 'fairway' ? THEMES[theme] : accentBlock(theme, id)
  const get = (k: string) => own.get(k) ?? THEMES[theme].get(k)!
  return { accent: get('accent'), soft: get('accent-soft'), wash: get('accent-wash'), ink: get('accent-ink') }
}

const PAIRS: Array<[string, string, number]> = [
  // Figures and primary text: AAA. A figure is ink, red or blue; on my row's tint too (A11Y-09).
  ['ink', 'bg', 7],
  ['ink', 'surface', 7],
  ['ink', 'surface-2', 7],
  ['ink', 'accent-soft', 7],
  ['under', 'bg', 7],
  ['under', 'surface', 7],
  ['under', 'accent-soft', 7],
  ['over', 'bg', 7],
  ['over', 'surface', 7],
  ['over', 'accent-soft', 7],
  // --ink-2 carries the board's small figures («hoy», «hoyo», the position) on the card stock only.
  ['ink-2', 'bg', 7],
  // Secondary text and controls: AA
  ['ink-2', 'surface', 4.5],
  ['ink-2', 'surface-2', 4.5],
  ['ink-2', 'accent-soft', 4.5],
  ['ink-3', 'bg', 4.5],
  ['ink-3', 'surface', 4.5],
  ['ink-3', 'surface-2', 4.5],
  ['accent', 'bg', 4.5],
  ['accent', 'surface', 4.5],
  ['accent', 'surface-2', 4.5],
  ['accent', 'accent-soft', 4.5],
  ['accent-ink', 'accent', 4.5],
  ['under', 'under-soft', 4.5],
  ['over', 'over-soft', 4.5],
  // A changed board figure washes for a moment (MOT-18): the row's text, and the figures, which are large text (AAA at 4.5:1).
  ['ink', 'accent-wash', 7],
  ['ink-2', 'accent-wash', 4.5],
  ['under', 'accent-wash', 4.5],
  ['over', 'accent-wash', 4.5],
  ['accent', 'accent-wash', 4.5],
  ['caution', 'bg', 4.5],
  ['caution', 'surface', 4.5],
  ['caution', 'caution-soft', 4.5],
  // A badge or a banner on a fill: the text on it.
  ['on-fill', 'ink', 4.5],
  ['on-fill', 'caution', 4.5],
  ['on-fill', 'under', 4.5],
  ['bg', 'ink', 4.5], // toast text, the chosen segment
  // A control's edge is its only boundary on a white sheet (A11Y-05, WCAG 1.4.11 non-text, 3:1): fields, steppers,
  // segmented controls, and a switch's track when off, with its knob on it.
  ['rule-2', 'bg', 3],
  ['rule-2', 'surface', 3],
  ['rule-2', 'surface-2', 3],
  ['surface-2', 'rule-2', 3],
]
const BOARD: Array<[string, string, number]> = [
  ['board-ink', 'board-bg', 7],
  ['board-ink', 'board-surface', 7],
  // --board-ink-2 carries figures on the TV («Hoyo 11, 25»): AAA on both greens (A11Y-09; it was 6.1:1 on the plate).
  ['board-ink-2', 'board-bg', 7],
  ['board-ink-2', 'board-surface', 7],
  ['board-accent', 'board-bg', 4.5],
  ['board-under', 'board-bg', 4.5],
  ['board-over', 'board-bg', 4.5],
  ['board-bg', 'board-accent', 4.5],
  // The focus ring on a board surface (A11Y-15): 3:1 against both of its greens.
  ['board-accent', 'board-surface', 3],
]
/** The colors that carry a meaning the accent must never be mistaken for (VIS-09). */
const SEMANTIC = ['under', 'over', 'caution', 'ink', 'ink-2', 'ink-3']
/** ΔE2000 15: told apart at a glance; the first set had Agua 2.9 from the over-par blue. */
const APART = 15

for (const theme of ['light', 'dark'] as const) {
  describe(`tokens.css contrast, ${theme}`, () => {
    it.each(PAIRS)(`--%s on --%s is at least %s:1`, (fg, bg, min) => {
      expect(contrast(hex(theme, fg), hex(theme, bg))).toBeGreaterThanOrEqual(min)
    })
    it("a loading screen's blocks stand out from the page and a sheet (1.3:1; VIS-13)", () => {
      for (const bg of ['bg', 'surface-2'])
        expect(contrast(hex(theme, 'skeleton'), hex(theme, bg)), `--skeleton on --${bg}`).toBeGreaterThanOrEqual(1.3)
    })
    it("a monogram's initials read at AAA on every tint, and the tints are told apart (VIS-18)", () => {
      for (let i = 1; i <= 6; i++)
        expect(contrast(hex(theme, 'ink'), hex(theme, `mono-${i}`)), `--ink on --mono-${i}`).toBeGreaterThanOrEqual(7)
      for (let i = 1; i <= 6; i++)
        for (let j = i + 1; j <= 6; j++)
          expect(
            deltaE2000(hex(theme, `mono-${i}`), hex(theme, `mono-${j}`)),
            `--mono-${i} against --mono-${j}`,
          ).toBeGreaterThanOrEqual(8)
    })
    it('every line the race chart draws in colour reads against the page and the ruled panel (3:1, graphics; VIS-21)', () => {
      for (let i = 1; i <= 6; i++)
        for (const bg of ['bg', 'surface'])
          expect(contrast(hex(theme, `race-${i}`), hex(theme, bg)), `--race-${i} on --${bg}`).toBeGreaterThanOrEqual(3)
    })
  })

  describe(`the curated event accents, ${theme} (VIS-09)`, () => {
    it.each(ACCENTS.map((a) => [a.name, a.id]))(
      '%s carries its text and reads on every surface it meets',
      (_name, id) => {
        const a = accent(theme, id)
        const t = (k: string) => hex(theme, k)
        expect(contrast(a.ink, a.accent), 'text on the accent').toBeGreaterThanOrEqual(5)
        for (const bg of ['bg', 'surface', 'surface-2'])
          expect(contrast(a.accent, t(bg)), `accent on --${bg}`).toBeGreaterThanOrEqual(4.5)
        expect(contrast(a.accent, a.soft), 'accent on its tint').toBeGreaterThanOrEqual(4.5)
        expect(contrast(a.accent, a.wash), 'accent on its wash').toBeGreaterThanOrEqual(4.5)
        // My row's tint carries figures (AAA) and its labels (AA); the wash is a moment, large figures (4.5).
        for (const fg of ['ink', 'under', 'over'])
          expect(contrast(t(fg), a.soft), `--${fg} on its tint`).toBeGreaterThanOrEqual(7)
        expect(contrast(t('ink-2'), a.soft), '--ink-2 on its tint').toBeGreaterThanOrEqual(4.5)
        for (const fg of ['ink-2', 'under', 'over'])
          expect(contrast(t(fg), a.wash), `--${fg} on its wash`).toBeGreaterThanOrEqual(4.5)
      },
    )
    it.each(ACCENTS.map((a) => [a.name, a.id]))(
      `%s is ${APART} or more ΔE2000 from every semantic color`,
      (_name, id) => {
        const a = accent(theme, id).accent
        for (const s of SEMANTIC)
          expect(deltaE2000(a, hex(theme, s)), `${id} against --${s}`).toBeGreaterThanOrEqual(APART)
      },
    )
    it('the six are told apart from each other', () => {
      const values = ACCENTS.map((a) => accent(theme, a.id).accent)
      for (let i = 0; i < values.length; i++)
        for (let j = i + 1; j < values.length; j++)
          expect(deltaE2000(values[i]!, values[j]!), `${ACCENTS[i]!.id} and ${ACCENTS[j]!.id}`).toBeGreaterThanOrEqual(
            APART,
          )
    })
  })
}

describe('the dark theme, written twice (VIS-11)', () => {
  it("the phone's setting and «Oscuro» declare the same sheet, word for word", () => {
    expect(block("  :root:not([data-theme='light'])")).toBe(block("  :root[data-theme='dark']"))
    for (const a of ACCENTS.slice(1))
      expect(block(`  :root:not([data-theme='light']) [data-accent='${a.id}']:not([data-theme='light'])`), a.id).toBe(
        block(`  :root[data-theme='dark'] [data-accent='${a.id}']:not([data-theme='light'])`),
      )
  })
  it('redefines every color the light theme has', () => {
    expect([...LIGHT.keys()].filter((k) => !DARK.has(k))).toEqual([])
  })
  it('more contrast is written twice too, after both themes (A11Y-19)', () => {
    const lines = (b: string) =>
      b
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
    expect(lines(block("  :root:not([data-contrast='normal'])"))).toEqual(lines(block(":root[data-contrast='more']")))
    expect(css.lastIndexOf(':root[data-contrast')).toBeGreaterThan(css.lastIndexOf("[data-theme='dark']"))
  })
})

describe('tokens.css, the board and the accents’ mirrors', () => {
  it.each(BOARD)('--%s on --%s is at least %s:1', (fg, bg, min) => {
    expect(contrast(hex('light', fg), hex('light', bg))).toBeGreaterThanOrEqual(min)
  })
  it('every chart series reads against the card stock (3:1, graphics)', () => {
    for (let i = 1; i <= 12; i++)
      expect(contrast(hex('light', `chart-${i}`), hex('light', 'bg')), `--chart-${i}`).toBeGreaterThanOrEqual(3)
  })
  it('accents.ts, [data-accent] and --chart-1..6 hold the same light values', () => {
    ACCENTS.forEach((a, i) => {
      expect(accent('light', a.id).accent, a.id).toBe(a.hex)
      expect(hex('light', `chart-${i + 1}`), a.id).toBe(a.hex)
    })
  })
  it('ΔE2000 matches its reference values', () => {
    expect(deltaE2000('#000000', '#000000')).toBe(0)
    expect(deltaE2000('#ffffff', '#000000')).toBeCloseTo(100, 0)
    // The first Agua against the over-par blue, as the review measured it.
    expect(deltaE2000('#2b5b8c', '#235380')).toBeCloseTo(2.9, 0)
  })
})
