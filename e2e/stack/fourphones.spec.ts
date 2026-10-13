/**
 * Four phones at once (§16 M3: «4 phones enter scores at the same time and
 * the others update in under 2 seconds»; §2 «on 4G»; QA-17). The four
 * twosomes of e2e-cuatro-telefonos each keep their card on one phone (Ana,
 * Caro, Eli and Gabi); on every hole the four type their twosome together
 * and tap «Guardar hoyo» together. Two more phones (Beto and Hugo) keep En
 * vivo open, and each must show every twosome's hole within 2 s of its own
 * phone's tap. All six phones are on emulated 4G (REL-11's link, phone.ts
 * `FOUR_G`), from the moment they open the link.
 *
 * Each save is timed from its phone's tap to the first moment a watcher's
 * board shows both of that twosome's rows as field.ts works them out (their
 * totals and «hoyo»): one watch per twosome, armed on each watcher before the
 * four taps (`watchEach`). The times go on the run's summary and as a notice
 * on the check run, as live.spec.ts's do.
 */
import { FRONT_NINE_ALL, SLUGS, groupNames, type HoleEntry } from './field'
import {
  boardAfter,
  boardRows,
  expect,
  expectLive,
  expectedScoresOf,
  FOUR_G,
  keepMetrics,
  openCard,
  percentile,
  saveHole,
  savedAt,
  serverScores,
  shownEachAt,
  slowFrames,
  test,
  typeHole,
  watchEach,
  type Phone,
} from './phone'

/** §2: «Other phones see a new score in under 2 seconds on 4G». */
const BUDGET_MS = 2000
/** The twosomes' holes played: 9 rounds of four saves, each shown on two phones. */
const HOLES = 9

interface Scorer {
  name: string
  group: number
  /** The twosome this phone keeps the card of. */
  names: string[]
  phone: Phone
  card: Map<number, HoleEntry>
}

interface Sample {
  hole: number
  group: number
  on: string
  ms: number
}

test('four phones save the same hole at once on 4G: every twosome’s hole shows on the other phones within 2 s', async ({ join }, testInfo) => {
  test.setTimeout(480_000)
  const slug = SLUGS.fourPhones
  const scorers: Scorer[] = []
  for (const [i, name] of ['Ana', 'Caro', 'Eli', 'Gabi'].entries()) {
    const names = groupNames(slug, i + 1)
    expect(names, `${name}'s twosome`).toContain(name)
    scorers.push({ name, group: i + 1, names, phone: await join(slug, name, FOUR_G), card: new Map() })
  }
  const watchers: Phone[] = []
  for (const name of ['Beto', 'Hugo']) watchers.push(await join(slug, name, FOUR_G))
  await Promise.all(scorers.map((s) => openCard(s.phone.page)))
  for (const w of watchers) await expectLive(w.page)

  const samples: Sample[] = []
  for (let hole = 1; hole <= HOLES; hole++) {
    const all = FRONT_NINE_ALL[hole - 1]!
    // The four type their twosome's hole at the same time, as four groups on the course do.
    await Promise.all(
      scorers.map((s) => {
        const entry: HoleEntry = Object.fromEntries(s.names.map((n) => [n, all[n]!]))
        s.card.set(hole, entry)
        return typeHole(s.phone.page, hole, entry)
      }),
    )
    for (const w of watchers) await watchEach(w.page, Object.fromEntries(scorers.map((s) => [s.name, { board: boardAfter(s.card, hole, s.names) }])))
    // The four taps, together.
    await Promise.all(scorers.map((s) => saveHole(s.phone.page, hole)))
    const tapped = new Map(await Promise.all(scorers.map(async (s) => [s.name, await savedAt(s.phone.page)] as const)))
    for (const w of watchers) {
      let at: Record<string, number>
      try {
        at = await shownEachAt(w.page)
      } catch (e) {
        // What the watcher showed instead and what the server holds: a failure here is read through the check's annotations.
        const server = serverScores(slug).filter((x) => x.hole === hole)
        const detail = [
          `4 phones: hole ${hole}: ${w.name}'s board never showed every twosome`,
          `expected: ${JSON.stringify(scorers.map((s) => boardAfter(s.card, hole, s.names)))}`,
          `${w.name}'s board: ${JSON.stringify(await boardRows(w.page))}`,
          `server hole ${hole}: ${JSON.stringify(server)}`,
          `page errors: ${JSON.stringify([...scorers.flatMap((s) => s.phone.errors), ...watchers.flatMap((p) => p.errors)])}`,
        ].join('\n')
        console.log(`::error::${detail.replace(/\n/g, '%0A')}`)
        throw new Error(detail, { cause: e })
      }
      for (const s of scorers) samples.push({ hole, group: s.group, on: w.name, ms: Math.round(at[s.name]! - tapped.get(s.name)!) })
    }
    const now = samples.filter((x) => x.hole === hole).map((x) => `${x.on}←${scorers[x.group - 1]!.name} ${x.ms}`)
    console.log(`[e2e-stack] 4 phones on 4G: hole ${hole}: ${now.join(', ')} ms`)
  }

  const ms = samples.map((x) => x.ms)
  const stats = { saves: HOLES * scorers.length, shown: ms.length, min: Math.min(...ms), p50: percentile(ms, 0.5), p95: percentile(ms, 0.95), max: Math.max(...ms) }
  // No comma in the title: the workflow command reads one as the end of it.
  console.log(`::notice title=save-to-shown (4 phones at once on 4G)::${stats.saves} saves, each on ${watchers.length} phones: min ${stats.min} ms, p50 ${stats.p50} ms, p95 ${stats.p95} ms, max ${stats.max} ms`)
  keepMetrics(testInfo.project.outputDir, 'save-to-shown-4-phones', { budgetMs: BUDGET_MS, network: FOUR_G, stats, samples }, [
    '### Four phones saving at once → shown on two others (e2e-stack, 4G)',
    '',
    `${stats.saves} saves (four twosomes, ${HOLES} holes, the four taps together), each timed on ${watchers.length} watching phones: min **${stats.min} ms**, p50 **${stats.p50} ms**, p95 **${stats.p95} ms**, max **${stats.max} ms** (budget ${BUDGET_MS} ms each). All six phones on ${FOUR_G.latency} ms round trip (requests and live-channel frames), 1.6 Mbps down, 750 kbps up.`,
    '',
    '| Hole | Twosome | Shown on | ms |',
    '|---:|---|---|---:|',
    ...samples.map((x) => `| ${x.hole} | ${scorers[x.group - 1]!.names.join(' y ')} | ${x.on} | ${x.ms} |`),
  ].join('\n'))

  expect(samples.filter((x) => x.ms >= BUDGET_MS), `saves that took ${BUDGET_MS} ms or more to show on another phone`).toEqual([])
  // Every phone's live channel was on the link, and nobody was signed in again behind the player's back.
  const phones = [...scorers.map((s) => s.phone), ...watchers]
  for (const p of phones) expect(await slowFrames(p.page), `${p.name}: live-channel frames held back`).toBeGreaterThan(0)
  for (const p of phones) expect(p.signUps, `${p.name}: anonymous sign-ins`).toBe(1)
  // The server holds each twosome's card as its phone typed it: 72 rows, each entered by that phone, no discrepancy.
  expect(serverScores(slug)).toEqual(expectedScoresOf(scorers.map((s) => ({ card: s.card, names: s.names, by: s.name }))))
})
