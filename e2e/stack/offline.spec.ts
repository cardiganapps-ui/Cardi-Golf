/**
 * Offline, then back (§2 «works fully offline and syncs later without losing
 * anything», §16 M3 airplane mode; QA-17): Ana's phone loses its signal,
 * saves two holes and corrects the first, all on the phone. Nothing reaches
 * the server meanwhile; when the signal returns, Beto's phone shows both
 * holes with the correction, and the server holds exactly the final values.
 *
 * Then the same while the phone is still sending (QA-17): three holes saved
 * with no signal, and two of them corrected after it returns, while the
 * first hole's call is held on its way. One correction is of the hole being
 * sent (it waits behind it, ARCH-01), one of a hole still waiting (it merges
 * into it). Both land as corrected, and nobody is asked about anything.
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
  await typeHole(ana.page, 2, ROUND[1])
  await saveHole(ana.page, 2)
  // Back to hole 1 (the phone is on the 3rd now): Ana made 4, not 3. The newer value replaces the queued one.
  await ana.page.getByRole('button', { name: t.card.prev, exact: true }).click()
  await ana.page.getByRole('button', { name: t.card.prev, exact: true }).click()
  const fix: HoleEntry = { Ana: { strokes: 4, putts: 1 } }
  await typeHole(ana.page, 1, fix)
  await saveHole(ana.page, 1)

  // The phone says two holes wait on it (the Tarjeta's line; only the header says «Sin señal», REL-21); the
  // server has none of them, and Beto's board shows nothing yet.
  await expect(ana.page.locator('header').getByText(t.sync.offlineShort, { exact: true })).toBeVisible()
  await expect(ana.page.getByText(t.sync.pendingHoles(2), { exact: true }).first()).toBeVisible()
  expect(serverScores(SLUGS.offline)).toEqual([])
  expect(await boardRows(beto.page)).toEqual(PLAYERS.map((p) => row('T1', p.name, '—', '0')))
  await expectLive(beto.page)

  const final = new Map<number, HoleEntry>([
    [1, { ...HOLE_1, ...fix }],
    [2, ROUND[1]],
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

test('holes corrected while the phone is still sending them land as corrected, and nobody is asked (QA-17)', async ({ join }) => {
  test.setTimeout(180_000)
  const slug = SLUGS.drain
  const ana = await join(slug, 'Ana')
  const beto = await join(slug, 'Beto')
  await openCard(ana.page)

  // Three holes with no signal.
  await ana.context.setOffline(true)
  await expect(ana.page.locator('header').getByText(t.sync.offlineShort, { exact: true })).toBeVisible()
  for (const hole of [1, 2, 3]) {
    await typeHole(ana.page, hole, ROUND[hole - 1])
    await saveHole(ana.page, hole)
  }
  await expect(ana.page.getByText(t.sync.pendingHoles(3), { exact: true }).first()).toBeVisible()

  // The signal returns, and the first call out (hole 1) is held on its way: the phone is still sending.
  let release!: () => void
  const held = new Promise<void>((resolve) => (release = resolve))
  let leftFirst!: () => void
  const firstOut = new Promise<void>((resolve) => (leftFirst = resolve))
  let calls = 0
  await ana.context.route('**/rest/v1/rpc/save_hole', async (route) => {
    if (calls++ === 0) {
      leftFirst()
      await held
    }
    // A call the phone gave up on meanwhile (its 10 s timeout) is nobody's to continue.
    await route.continue().catch(() => undefined)
  })
  await ana.context.setOffline(false)
  await firstOut

  // Ana corrects hole 1 (the one on its way) and hole 2 (still waiting), from the card's grid.
  const fixes: Array<{ hole: number; entry: HoleEntry }> = [
    { hole: 1, entry: { Ana: { strokes: 4, putts: 2 } } },
    { hole: 2, entry: { Beto: { strokes: 6, putts: 3 } } },
  ]
  for (const fix of fixes) {
    const toGrid = ana.page.getByRole('button', { name: t.card.grid, exact: true })
    if (await toGrid.isVisible()) await toGrid.click()
    await ana.page.getByRole('button', { name: `${t.player.hole} ${fix.hole}`, exact: true }).click()
    await typeHole(ana.page, fix.hole, fix.entry)
    await saveHole(ana.page, fix.hole)
  }
  const final = new Map<number, HoleEntry>([1, 2, 3].map((hole) => [hole, { ...ROUND[hole - 1] }]))
  for (const fix of fixes) final.set(fix.hole, { ...final.get(fix.hole)!, ...fix.entry })

  // Released: everything goes out, and Beto's board ends on the corrected holes.
  await watchFor(beto.page, { board: boardAfter(final, 3) })
  release()
  await shownAt(beto.page, 30_000)
  await expect(ana.page.getByText(t.sync.synced, { exact: true })).toBeVisible({ timeout: 20_000 })
  expect(calls, 'the held call and the ones behind it').toBeGreaterThan(1)

  // The server holds exactly the corrected card, entered by Ana's phone; her own correction was never a question to her.
  expect(serverScores(slug)).toEqual(expectedScores(final, 'Ana'))
  await expect(ana.page.getByRole('button', { name: t.card.keepMine, exact: true })).toHaveCount(0)
  await expect(ana.page.getByText(t.sync.rejected(1).replace(/^1 /, ''))).toHaveCount(0)
})
