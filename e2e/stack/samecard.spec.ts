/**
 * Two phones on one card at the same hole (REL-05, PLAN §5.1): the hole goes
 * out as one save_hole call, with what each phone saw. Ana's phone has no
 * signal while both phones capture hole 1, so neither sees the other's save
 * before its own; when the signal returns:
 * - each keeping the other pair (Tarjeta cruzada), both phones' typed values
 *   stand, and the other phone's untouched defaults never hold them up;
 * - both typing the same player, the first value stays and Ana's phone asks;
 *   «Guardar el mío» puts hers over it, flagged as a discrepancy.
 * The server is read back directly; Beto's phone must show it.
 */
import { t } from '../../src/i18n/es-MX'
import { SLUGS, type HoleEntry } from './field'
import { boardAfter, boardRows, expect, expectLive, openCard, saveHole, serverScores, tab, test, typeHole } from './phone'

test('each phone keeping the other pair: both land, and nobody is asked', async ({ join }) => {
  test.setTimeout(180_000)
  const ana = await join(SLUGS.sameCard, 'Ana')
  const beto = await join(SLUGS.sameCard, 'Beto')
  await openCard(ana.page)
  await openCard(beto.page)

  // Ana's phone keeps Caro and Dani; with no signal, it has not seen Beto's save.
  await ana.context.setOffline(true)
  await expect(ana.page.locator('header').getByText(t.sync.offlineShort, { exact: true })).toBeVisible()
  const anas: HoleEntry = { Caro: { strokes: 6, putts: 2 }, Dani: { strokes: 7, putts: 3 } }
  await typeHole(ana.page, 1, anas)
  await saveHole(ana.page, 1)

  // Beto's phone keeps Ana and Beto, and saves Caro and Dani at par as nobody touched them there.
  const betos: HoleEntry = { Ana: { strokes: 3, putts: 1 }, Beto: { strokes: 5, putts: 2 } }
  await typeHole(beto.page, 1, betos)
  await saveHole(beto.page, 1)
  await expect.poll(() => serverScores(SLUGS.sameCard).map((s) => `${s.name} ${s.strokes}/${s.putts} ${s.by}`)).toEqual(['Ana 3/1 Beto', 'Beto 5/2 Beto', 'Caro 4/2 Beto', 'Dani 4/2 Beto'])

  await ana.context.setOffline(false)
  // Each phone's typed values stand; Beto's untouched par for Caro and Dani is kept as the discrepancy's old value.
  await expect
    .poll(() => serverScores(SLUGS.sameCard), { timeout: 20_000 })
    .toEqual([
      { hole: 1, name: 'Ana', strokes: 3, putts: 1, by: 'Beto', disputed: false },
      { hole: 1, name: 'Beto', strokes: 5, putts: 2, by: 'Beto', disputed: false },
      { hole: 1, name: 'Caro', strokes: 6, putts: 2, by: 'Ana', disputed: true },
      { hole: 1, name: 'Dani', strokes: 7, putts: 3, by: 'Ana', disputed: true },
    ])
  await expect(ana.page.getByText(t.sync.synced, { exact: true })).toBeVisible({ timeout: 20_000 })
  await expect(ana.page.getByText(t.card.conflictTitle, { exact: true })).toHaveCount(0)
  await expect(beto.page.getByText(t.card.conflictTitle, { exact: true })).toHaveCount(0)

  // Beto's phone shows the whole hole as the server holds it.
  await tab(beto.page, t.nav.live).click()
  await expectLive(beto.page)
  const want = boardAfter(new Map([[1, { ...betos, ...anas }]]), 1)
  await expect
    .poll(
      async () => {
        const rows = await boardRows(beto.page)
        return want.filter((w) => !rows.some((r) => r === w || r.endsWith(`, ${w}`)))
      },
      { timeout: 15_000, message: 'rows Beto’s board does not show' },
    )
    .toEqual([])
})

test('both typing the same player: the first value stays, the second phone is asked, and «Guardar el mío» puts it over', async ({ join }) => {
  test.setTimeout(180_000)
  const ana = await join(SLUGS.conflict, 'Ana')
  const beto = await join(SLUGS.conflict, 'Beto')
  await openCard(ana.page)
  await openCard(beto.page)

  await ana.context.setOffline(true)
  await expect(ana.page.locator('header').getByText(t.sync.offlineShort, { exact: true })).toBeVisible()
  await typeHole(ana.page, 1, { Caro: { strokes: 6, putts: 2 } })
  await saveHole(ana.page, 1)

  await typeHole(beto.page, 1, { Caro: { strokes: 5, putts: 1 } })
  await saveHole(beto.page, 1)
  await expect.poll(() => serverScores(SLUGS.conflict).find((s) => s.name === 'Caro')).toMatchObject({ strokes: 5, putts: 1, by: 'Beto' })

  await ana.context.setOffline(false)
  const line = t.card.conflictLine(1, 'Beto', 'Caro', t.card.conflictValue(5, 1, false, true, false), t.card.conflictValue(6, 2, false, true, false), false)
  await expect(ana.page.getByText(line, { exact: true })).toBeVisible({ timeout: 20_000 })
  // Beto's 5 stands on the server, and on Ana's phone.
  expect(serverScores(SLUGS.conflict).find((s) => s.name === 'Caro')).toMatchObject({ strokes: 5, putts: 1, by: 'Beto', disputed: false })

  await ana.page.getByRole('button', { name: t.card.conflictAction(t.card.keepMine, 1, 'Caro'), exact: true }).click()
  await expect
    .poll(() => serverScores(SLUGS.conflict).find((s) => s.name === 'Caro'), { timeout: 20_000 })
    .toMatchObject({ strokes: 6, putts: 2, by: 'Ana', disputed: true })
  await expect(ana.page.getByText(line, { exact: true })).toHaveCount(0)
  await expect(ana.page.getByText(t.sync.synced, { exact: true })).toBeVisible({ timeout: 20_000 })
})
