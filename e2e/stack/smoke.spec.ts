/**
 * The smoke test, without tautologies (QA-12): a player enters one hole and
 * the leaderboard changes to exactly what the seed says it must, from a
 * board that was exactly something else before. The hole is read back from
 * the database, and the board again on a second phone that has no copy and no
 * outbox of its own: what it shows can only have come from the server.
 */
import { t } from '../../src/i18n/es-MX'
import { netScoreName } from '../../src/engine/core/stableford'
import { HOLE_1, PLAYERS, SLUGS } from './field'
import { boardRows, expect, expectedScores, openCard, row, saveHole, serverScores, tab, test, typeHole } from './phone'

const NAMES = PLAYERS.map((p) => p.name)

test('a hole entered on the Tarjeta changes the leaderboard to exactly what the seed gives', async ({ join }) => {
  const ana = await join(SLUGS.smoke, 'Ana')
  const page = ana.page

  // The page names the live round, and nobody has played: all eight share 1st, no figure, through 0.
  await expect(page.getByText(`${t.round.day(1)}, ${t.roundStatus.live.toLowerCase()}`, { exact: true })).toBeVisible()
  expect(await boardRows(page)).toEqual(NAMES.map((n) => row('T1', n, '—', '0')))

  await openCard(page)
  await expect(page.getByText(t.card.groupLine(1, 1), { exact: true })).toBeVisible()
  await typeHole(page, 1, HOLE_1)
  // Before the save the card scores each player from the seed (par 4, stroke index 7; field.ts works it out).
  for (const [name, pts] of [['Ana', 3], ['Beto', 2], ['Caro', 3], ['Dani', 0]] as const) {
    await expect(page.getByRole('group', { name, exact: true }).getByText(t.card.ptsLine(pts, pts > 0 ? netScoreName(pts) : null), { exact: true })).toBeVisible()
  }
  await saveHole(page, 1)

  // On the server, not only on the phone: the four rows as typed, entered by Ana's phone.
  await expect.poll(() => serverScores(SLUGS.smoke)).toEqual(expectedScores(new Map([[1, HOLE_1]]), 'Ana'))
  await expect(page.getByText(t.sync.synced, { exact: true })).toBeVisible({ timeout: 15_000 })

  // The board: Ana and Caro tie for 1st on 3 (equal all the way down the countback), Beto 3rd on 2,
  // Dani 4th on 0 (a card with a hole beats no card), group 2 shares 5th with nothing yet.
  const after = [
    row('T1', 'Ana', '3', '1', '3'),
    row('T1', 'Caro', '3', '1', '3'),
    row('3', 'Beto', '2', '1', '2'),
    row('4', 'Dani', '0', '1', '0'),
    ...['Eli', 'Fede', 'Gabi', 'Hugo'].map((n) => row('T5', n, '—', '0')),
  ]
  await tab(page, t.nav.live).click()
  await expect.poll(() => boardRows(page)).toEqual(after)

  // A second phone, with nothing of its own, reads the same board.
  const beto = await join(SLUGS.smoke, 'Beto')
  await expect.poll(() => boardRows(beto.page)).toEqual(after)
})
