/**
 * Two phones, one card (§2, §16 M3; QA-17, REL-11): Ana's and Beto's phones
 * keep the same foursome's card. Ana's phone saves every hole of the round
 * and then corrects four; each time, Beto's phone must show it within 2 s.
 *
 * Save to shown is measured on the phones' own clocks: from Ana's tap on
 * «Guardar…» to the first DOM state on Beto's phone that shows the whole hole
 * (a MutationObserver armed before the tap, which fails if it is already true).
 * Holes 1–3 are watched on Beto's Tarjeta (his steppers take the four values),
 * holes 4–18 and the corrections on his En vivo board (four rows, their totals
 * and their «hoyo» exactly as field.ts works them out).
 */
import { t } from '../../src/i18n/es-MX'
import { ROUND, SLUGS, type HoleEntry } from './field'
import {
  boardAfter,
  cardShows,
  expect,
  expectLive,
  expectedScores,
  holeHeading,
  keepMetrics,
  openCard,
  percentile,
  saveHole,
  savedAt,
  serverScores,
  shownAt,
  tab,
  test,
  typeHole,
  watchFor,
  type Phone,
  type Shown,
} from './phone'

/** §2: «Other phones see a new score in under 2 seconds». */
const BUDGET_MS = 2000

interface Sample {
  what: 'tarjeta' | 'board' | 'correction'
  hole: number
  ms: number
}

/** The corrections Ana's phone makes once the round is in, from the card's grid. */
const FIXES = [
  { hole: 18, name: 'Ana', strokes: 5, putts: 2 },
  { hole: 1, name: 'Ana', strokes: 4, putts: 1 },
  { hole: 10, name: 'Beto', strokes: 5, putts: 2 },
  { hole: 5, name: 'Dani', strokes: 3, putts: 2 },
]

test('two phones, one card: every hole saved on one shows on the other within 2 s', async ({ join }, testInfo) => {
  test.setTimeout(300_000)
  const ana = await join(SLUGS.twoPhones, 'Ana')
  const beto = await join(SLUGS.twoPhones, 'Beto')
  const card = new Map<number, HoleEntry>()
  const samples: Sample[] = []

  /** Arms the watch on Beto's phone, saves on Ana's, and keeps the time it took. */
  async function measure(what: Sample['what'], hole: number, shown: Shown) {
    await watchFor(beto.page, shown)
    await saveHole(ana.page, hole)
    const ms = Math.round((await shownAt(beto.page)) - (await savedAt(ana.page)))
    samples.push({ what, hole, ms })
    console.log(`[e2e-stack] ${what} hole ${hole}: saved on Ana's phone → shown on Beto's in ${ms} ms`)
  }

  await openCard(ana.page)
  await openCard(beto.page)
  await expectLive(beto.page)

  // Holes 1–3: Beto's Tarjeta, on the same hole, takes the four values.
  for (const hole of [1, 2, 3]) {
    const entry = ROUND[hole - 1]!
    await expect(holeHeading(beto.page, hole)).toBeVisible()
    await typeHole(ana.page, hole, entry)
    card.set(hole, entry)
    await measure('tarjeta', hole, { card: cardShows(entry) })
    if (hole < 3) await beto.page.getByRole('button', { name: t.card.next, exact: true }).click()
  }

  // Holes 4–18: Beto's En vivo board.
  await tab(beto.page, t.nav.live).click()
  await expectLive(beto.page)
  for (let hole = 4; hole <= 18; hole++) {
    const entry = ROUND[hole - 1]!
    await typeHole(ana.page, hole, entry)
    card.set(hole, entry)
    await measure('board', hole, { board: boardAfter(card, hole) })
  }

  // Corrections: back to a hole from the card's grid, one player changed, saved again.
  for (const fix of FIXES) {
    const toGrid = ana.page.getByRole('button', { name: t.card.grid, exact: true })
    if (await toGrid.isVisible()) await toGrid.click()
    await ana.page.getByRole('button', { name: String(fix.hole), exact: true }).click()
    const entry = { [fix.name]: { strokes: fix.strokes, putts: fix.putts } }
    await typeHole(ana.page, fix.hole, entry)
    card.set(fix.hole, { ...card.get(fix.hole)!, ...entry })
    await measure('correction', fix.hole, { board: boardAfter(card, 18) })
  }

  const ms = samples.map((s) => s.ms)
  const stats = { saves: ms.length, min: Math.min(...ms), p50: percentile(ms, 0.5), p95: percentile(ms, 0.95), max: Math.max(...ms) }
  console.log(`[e2e-stack] save → shown over ${stats.saves} saves: min ${stats.min} ms, p50 ${stats.p50} ms, p95 ${stats.p95} ms, max ${stats.max} ms`)
  keepMetrics(testInfo.project.outputDir, 'save-to-shown', { budgetMs: BUDGET_MS, stats, samples }, [
    '### Save on one phone → shown on the other (e2e-stack)',
    '',
    `${stats.saves} saves: min **${stats.min} ms**, p50 **${stats.p50} ms**, p95 **${stats.p95} ms**, max **${stats.max} ms** (budget ${BUDGET_MS} ms each). Local stack, no network throttling.`,
    '',
    '| Where | Hole | ms |',
    '|---|---:|---:|',
    ...samples.map((s) => `| ${s.what} | ${s.hole} | ${s.ms} |`),
  ].join('\n'))

  expect(samples.filter((s) => s.ms >= BUDGET_MS), `saves that took ${BUDGET_MS} ms or more to show on the other phone`).toEqual([])
  // And the server holds the card as Ana's phone typed it: 72 rows, no discrepancy.
  expect(serverScores(SLUGS.twoPhones)).toEqual(expectedScores(card, 'Ana'))
  assertSamePlayer(ana, beto)
})

/** Neither phone was signed in again behind the player's back. */
function assertSamePlayer(...phones: Phone[]) {
  for (const p of phones) expect(p.signUps, `${p.name}: anonymous sign-ins`).toBe(1)
}
