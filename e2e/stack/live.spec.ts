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
 *
 * The round runs twice, each on its own tournament: on the runner's own
 * network, and with both phones on emulated 4G (REL-11, FOUR_G): every
 * request and every frame of the live channel late by half the round trip
 * each way, on Chromium's bandwidth limits (phone.ts, `Link`).
 */
import { t } from '../../src/i18n/es-MX'
import { ROUND, SLUGS, type HoleEntry } from './field'
import {
  boardAfter,
  boardRows,
  cardShows,
  expect,
  expectLive,
  expectedScores,
  FOUR_G,
  holeHeading,
  keepMetrics,
  openCard,
  percentile,
  saveHole,
  savedAt,
  serverScores,
  shownAt,
  slowFrames,
  tab,
  takeTaps,
  test,
  typeHole,
  watchFor,
  type Link,
  type Phone,
  type Shown,
} from './phone'

/** §2: «Other phones see a new score in under 2 seconds on 4G». */
const BUDGET_MS = 2000
/** §2: «Entering one hole for a foursome takes under 10 seconds». */
const FOURSOME_HOLE_MS = 10_000
/**
 * A person's tap: a deliberate one with the thumb, reading the stepper first. Generous on purpose, since the
 * suite's taps are a machine's; the person's own pace is the rehearsal's to check (§17).
 */
const PERSON_TAP_MS = 600

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

type Join = (slug: string, name: string, link?: Link) => Promise<Phone>

/** The whole round on `slug`, measured; `network` says which link the phones were on, for the summary. */
async function playRound(join: Join, outputDir: string, slug: string, network: { label: string; key: string; conditions?: Link }) {
  const ana = await join(slug, 'Ana', network.conditions)
  const beto = await join(slug, 'Beto', network.conditions)
  const card = new Map<number, HoleEntry>()
  const samples: Sample[] = []
  /** Per hole of the round, each stepper tap Ana's phone took to show its new value (ms). */
  const typing: Array<{ hole: number; taps: number[] }> = []
  async function typeRoundHole(hole: number, entry: HoleEntry) {
    await typeHole(ana.page, hole, entry)
    typing.push({ hole, taps: takeTaps(ana.page) })
  }

  /** Arms the watch on Beto's phone, saves on Ana's, and keeps the time it took. */
  async function measure(what: Sample['what'], hole: number, shown: Shown) {
    await watchFor(beto.page, shown)
    await saveHole(ana.page, hole)
    let at: number
    try {
      at = await shownAt(beto.page)
    } catch (e) {
      // Say what Beto's phone showed instead, what the server holds and what each phone's header says: a
      // failure here is read through the check's annotations only (CI logs can't be fetched from the session).
      const header = async (p: Phone) => (await p.page.locator('header').innerText().catch(() => '?')).replace(/\s+/g, ' ').slice(0, 160)
      const rows = 'board' in shown ? await boardRows(beto.page) : []
      const server = serverScores(slug).filter((s) => s.hole === hole)
      const detail = [
        `${network.label}: ${what} hole ${hole}: Beto's phone never showed it`,
        `expected: ${JSON.stringify('board' in shown ? shown.board : shown.card)}`,
        `Beto's board: ${JSON.stringify(rows)}`,
        `server hole ${hole}: ${JSON.stringify(server)}`,
        `Ana's header: ${await header(ana)} | Beto's header: ${await header(beto)}`,
        `page errors: ${JSON.stringify([...ana.errors, ...beto.errors])}`,
      ].join('\n')
      console.log(`::error::${detail.replace(/\n/g, '%0A')}`)
      throw new Error(detail, { cause: e })
    }
    const ms = Math.round(at - (await savedAt(ana.page)))
    samples.push({ what, hole, ms })
    console.log(`[e2e-stack] ${network.label}: ${what} hole ${hole}: saved on Ana's phone → shown on Beto's in ${ms} ms`)
  }

  await openCard(ana.page)
  await openCard(beto.page)
  await expectLive(beto.page)

  // Holes 1–3: Beto's Tarjeta, on the same hole, takes the four values.
  for (const hole of [1, 2, 3]) {
    const entry = ROUND[hole - 1]!
    await expect(holeHeading(beto.page, hole)).toBeVisible()
    await typeRoundHole(hole, entry)
    card.set(hole, entry)
    await measure('tarjeta', hole, { card: cardShows(entry) })
    if (hole < 3) await beto.page.getByRole('button', { name: t.card.next, exact: true }).click()
  }

  // Holes 4–18: Beto's En vivo board.
  await tab(beto.page, t.nav.live).click()
  await expectLive(beto.page)
  for (let hole = 4; hole <= 18; hole++) {
    const entry = ROUND[hole - 1]!
    await typeRoundHole(hole, entry)
    card.set(hole, entry)
    await measure('board', hole, { board: boardAfter(card, hole) })
  }

  // Corrections: back to a hole from the card's grid, one player changed, saved again.
  for (const fix of FIXES) {
    const toGrid = ana.page.getByRole('button', { name: t.card.grid, exact: true })
    if (await toGrid.isVisible()) await toGrid.click()
    await ana.page.getByRole('button', { name: `${t.player.hole} ${fix.hole}`, exact: true }).click()
    const entry = { [fix.name]: { strokes: fix.strokes, putts: fix.putts } }
    await typeHole(ana.page, fix.hole, entry)
    takeTaps(ana.page)
    card.set(fix.hole, { ...card.get(fix.hole)!, ...entry })
    await measure('correction', fix.hole, { board: boardAfter(card, 18) })
  }

  // A foursome's hole (§2): the taps it takes from par and 2 putts, plus «Guardar hoyo», each at a person's pace
  // and the screen's own answer to a tap. The suite's taps carry Playwright's time too, so this errs long.
  const tapMs = typing.flatMap((x) => x.taps)
  const perHole = typing.map((x) => x.taps.length + 1)
  const foursome = { holes: typing.length, meanTaps: Math.round((10 * perHole.reduce((a, b) => a + b, 0)) / perHole.length) / 10, maxTaps: Math.max(...perHole), tapP50: percentile(tapMs, 0.5), tapP95: percentile(tapMs, 0.95) }
  const longestHoleMs = foursome.maxTaps * (PERSON_TAP_MS + foursome.tapP95)
  console.log(`::notice title=a foursome's hole (${network.label})::${foursome.meanTaps} taps on average, ${foursome.maxTaps} at most; a tap shows its value in p50 ${foursome.tapP50} ms, p95 ${foursome.tapP95} ms; the longest hole at a person's pace ≈ ${(longestHoleMs / 1000).toFixed(1)} s`)

  const ms = samples.map((s) => s.ms)
  const stats = { saves: ms.length, min: Math.min(...ms), p50: percentile(ms, 0.5), p95: percentile(ms, 0.95), max: Math.max(...ms) }
  console.log(`[e2e-stack] ${network.label}: save → shown over ${stats.saves} saves: min ${stats.min} ms, p50 ${stats.p50} ms, p95 ${stats.p95} ms, max ${stats.max} ms`)
  // A notice on the check run: its annotations can be read through the API, the job's log and summary can't (from the session).
  console.log(`::notice title=save-to-shown (${network.label})::${stats.saves} saves: min ${stats.min} ms, p50 ${stats.p50} ms, p95 ${stats.p95} ms, max ${stats.max} ms`)
  keepMetrics(outputDir, network.key, { budgetMs: BUDGET_MS, network: network.conditions ?? null, stats, samples, foursomeHole: { ...foursome, personTapMs: PERSON_TAP_MS, longestHoleMs, budgetMs: FOURSOME_HOLE_MS } }, [
    `### Save on one phone → shown on the other (e2e-stack, ${network.label})`,
    '',
    `${stats.saves} saves: min **${stats.min} ms**, p50 **${stats.p50} ms**, p95 **${stats.p95} ms**, max **${stats.max} ms** (budget ${BUDGET_MS} ms each). Local stack; ${network.conditions ? `both phones on ${network.conditions.latency} ms round trip (requests and live-channel frames), 1.6 Mbps down, 750 kbps up` : 'no network throttling'}.`,
    '',
    `A foursome's hole: **${foursome.meanTaps}** taps on average, **${foursome.maxTaps}** at most (from par and 2 putts, «Guardar hoyo» included); each stepper tap showed its value in p50 ${foursome.tapP50} ms, p95 **${foursome.tapP95} ms**. At ${PERSON_TAP_MS} ms a tap for a person, the longest hole takes about **${(longestHoleMs / 1000).toFixed(1)} s** (budget ${FOURSOME_HOLE_MS / 1000} s).`,
    '',
    '| Where | Hole | ms |',
    '|---|---:|---:|',
    ...samples.map((s) => `| ${s.what} | ${s.hole} | ${s.ms} |`),
  ].join('\n'))

  expect(samples.filter((s) => s.ms >= BUDGET_MS), `${network.label}: saves that took ${BUDGET_MS} ms or more to show on the other phone`).toEqual([])
  expect(longestHoleMs, `${network.label}: the longest foursome hole, at a person's pace`).toBeLessThan(FOURSOME_HOLE_MS)
  // The live channel really was on the link: its frames went through slowSockets on both phones.
  if (network.conditions)
    for (const p of [ana, beto]) expect(await slowFrames(p.page), `${p.name}: live-channel frames held back`).toBeGreaterThan(0)
  // And the server holds the card as Ana's phone typed it: 72 rows, no discrepancy.
  expect(serverScores(slug)).toEqual(expectedScores(card, 'Ana'))
  assertSamePlayer(ana, beto)
}

test('two phones, one card: every hole saved on one shows on the other within 2 s', async ({ join }, testInfo) => {
  test.setTimeout(300_000)
  await playRound(join, testInfo.project.outputDir, SLUGS.twoPhones, { label: 'runner network', key: 'save-to-shown' })
})

test('two phones on 4G: every hole saved on one shows on the other within 2 s (REL-11)', async ({ join }, testInfo) => {
  test.setTimeout(420_000)
  await playRound(join, testInfo.project.outputDir, SLUGS.fourG, { label: '4G', key: 'save-to-shown-4g', conditions: FOUR_G })
})

/** Neither phone was signed in again behind the player's back. */
function assertSamePlayer(...phones: Phone[]) {
  for (const p of phones) expect(p.signUps, `${p.name}: anonymous sign-ins`).toBe(1)
}
