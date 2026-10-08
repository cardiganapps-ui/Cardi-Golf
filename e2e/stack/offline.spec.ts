/**
 * Offline, then back (§2 «works fully offline and syncs later without losing
 * anything», §16 M3 airplane mode; QA-17): Ana's phone loses its signal,
 * saves two holes and corrects the first, all on the phone. Nothing reaches
 * the server meanwhile; when the signal returns, Beto's phone shows both
 * holes with the correction, and the server holds exactly the final values.
 */
import { t } from '../../src/i18n/es-MX'
import { HOLE_1, PLAYERS, ROUND, SLUGS, type HoleEntry } from './field'
import {
  boardAfter,
  boardRows,
  expect,
  expectLive,
  expectedScores,
  keepMetrics,
  openCard,
  row,
  saveHole,
  serverScores,
  shownAt,
  test,
  typeHole,
  watchFor,
} from './phone'

test('two holes saved with no signal reach the other phone when it returns, the correction included', async ({ join }, testInfo) => {
  test.setTimeout(180_000)
  const ana = await join(SLUGS.offline, 'Ana')
  const beto = await join(SLUGS.offline, 'Beto')
  await openCard(ana.page)

  await ana.context.setOffline(true)
  await expect(ana.page.locator('header').getByText(t.sync.offlineShort, { exact: true })).toBeVisible()
  await typeHole(ana.page, 1, HOLE_1)
  await saveHole(ana.page, 1)
  await typeHole(ana.page, 2, ROUND[1]!)
  await saveHole(ana.page, 2)
  // Back to hole 1 (the phone is on the 3rd now): Ana made 4, not 3. The newer value replaces the queued one.
  await ana.page.getByRole('button', { name: t.card.prev, exact: true }).click()
  await ana.page.getByRole('button', { name: t.card.prev, exact: true }).click()
  const fix: HoleEntry = { Ana: { strokes: 4, putts: 1 } }
  await typeHole(ana.page, 1, fix)
  await saveHole(ana.page, 1)

  // The phone says two holes wait on it; the server has none of them, and Beto's board shows nothing yet.
  await expect(ana.page.getByText(t.sync.offlineHoles(2), { exact: true }).first()).toBeVisible()
  expect(serverScores(SLUGS.offline)).toEqual([])
  expect(await boardRows(beto.page)).toEqual(PLAYERS.map((p) => row('T1', p.name, '—', '0')))
  await expectLive(beto.page)

  const final = new Map<number, HoleEntry>([
    [1, { ...HOLE_1, ...fix }],
    [2, ROUND[1]!],
  ])
  await watchFor(beto.page, { board: boardAfter(final, 2) })
  const back = Date.now()
  await ana.context.setOffline(false)
  const ms = Math.round((await shownAt(beto.page, 30_000)) - back)
  console.log(`[e2e-stack] signal back on Ana's phone → both holes on Beto's in ${ms} ms`)
  keepMetrics(testInfo.project.outputDir, 'offline-to-shown', { ms, holes: 2, rows: 8 }, `### Signal back → shown on the other phone (e2e-stack)\n\nTwo holes (8 rows, one corrected offline): **${ms} ms**.`)

  // Ana's card says it is all sent; the server holds the final values, entered by her phone, and nothing else.
  await expect(ana.page.getByText(t.sync.synced, { exact: true })).toBeVisible({ timeout: 20_000 })
  expect(serverScores(SLUGS.offline)).toEqual(expectedScores(final, 'Ana'))
  await expect(ana.page.getByText(t.sync.rejected(1).replace(/^1 /, ''))).toHaveCount(0)
})
