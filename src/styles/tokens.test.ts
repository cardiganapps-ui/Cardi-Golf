/**
 * Contrast guard: every text pair the system uses must be AA (4.5:1) and
 * every score pair AAA (7:1), because the app is read in sunlight.
 * Pairs are [foreground, background, minimum ratio].
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contrast } from '../lib/contrast'

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')
const tokens = new Map<string, string>()
for (const m of css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) tokens.set(m[1]!, m[2]!.toLowerCase())
const hex = (name: string) => {
  const v = tokens.get(name)
  if (!v) throw new Error(`token --${name} is not a color literal in tokens.css`)
  return v
}

const PAIRS: Array<[string, string, number]> = [
  // Scores and primary text: AAA
  ['ink', 'bg', 7],
  ['ink', 'surface', 7],
  ['ink', 'surface-2', 7],
  ['under', 'bg', 7],
  ['under', 'surface', 7],
  ['over', 'bg', 7],
  ['over', 'surface', 7],
  ['board-ink', 'board-bg', 7],
  ['board-ink', 'board-surface', 7],
  // Secondary text and controls: AA
  ['ink-2', 'bg', 4.5],
  ['ink-2', 'surface', 4.5],
  ['ink-2', 'surface-2', 4.5],
  ['ink-3', 'bg', 4.5],
  ['ink-3', 'surface', 4.5],
  ['ink-3', 'surface-2', 4.5],
  ['accent', 'bg', 4.5],
  ['accent', 'surface', 4.5],
  ['accent', 'accent-soft', 4.5],
  ['accent-ink', 'accent', 4.5],
  ['under', 'under-soft', 4.5],
  ['over', 'over-soft', 4.5],
  ['caution', 'bg', 4.5],
  ['caution', 'caution-soft', 4.5],
  ['board-ink-2', 'board-bg', 4.5],
  ['board-accent', 'board-bg', 4.5],
  ['board-under', 'board-bg', 4.5],
  ['board-over', 'board-bg', 4.5],
  ['board-bg', 'board-accent', 4.5],
  // The focus ring on a board surface (A11Y-15): 3:1 against both of its greens.
  ['board-accent', 'board-surface', 3],
  ['bg', 'ink', 4.5], // toast text
]

describe('tokens.css contrast', () => {
  it.each(PAIRS)('--%s on --%s is at least %s:1', (fg, bg, min) => {
    expect(contrast(hex(fg), hex(bg))).toBeGreaterThanOrEqual(min)
  })
  it('every chart series reads against the card stock (3:1, graphics)', () => {
    for (let i = 1; i <= 12; i++) expect(contrast(hex(`chart-${i}`), hex('bg')), `--chart-${i}`).toBeGreaterThanOrEqual(3)
  })
  it('every curated event accent carries white text (4.5:1)', () => {
    for (let i = 1; i <= 6; i++) expect(contrast(hex(`chart-${i}`), hex('accent-ink')), `--chart-${i}`).toBeGreaterThanOrEqual(4.5)
  })
})
