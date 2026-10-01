/**
 * UX-06: after «Crear torneo» nothing guided the organizer. The wizard now
 * leads with what comes next, and Comité › Torneo lists what is missing, each
 * line opening its section; the Torneo tab counts it.
 */
import { t } from '../../src/i18n/es-MX'
import { expect, open, test } from './base'

const R = t.admin.ready
const W = t.organizer.wizard

test('a new tournament: «Para empezar» lists what is missing, and a line opens its section', async ({ page }) => {
  await open(page, '/t/_/new-setup/admin/torneo')
  await expect(page.getByRole('heading', { name: R.title })).toBeVisible()
  // The Torneo tab counts what is missing: the players and the rounds' course and date.
  await expect(page.getByRole('link', { name: new RegExp(`^${t.admin.sections.tournament}`) })).toContainText('2')
  await page.getByRole('link', { name: `${R.todoLabel}: ${R.roundSetupMissing('día 1 y día 2')}` }).click()
  await expect(page).toHaveURL(/\/admin\/rondas$/)
})

test('the wizard leads with what comes next; the code waits for the players', async ({ page }) => {
  await open(page, '/organizer/nuevo/_')
  await page.getByPlaceholder(W.namePlaceholder).fill('Viaje a Valle')
  await page.getByRole('button', { name: t.common.next }).click()
  await page.getByRole('button', { name: t.common.next }).click()
  await page.getByRole('button', { name: W.create }).click()
  await expect(page.getByRole('link', { name: W.goAdmin })).toBeVisible()
  // Behind a closed disclosure, until asked for.
  await expect(page.getByText('EJEMPL', { exact: true })).toBeHidden()
  await page.getByText(W.shareLater).click()
  await expect(page.getByText('EJEMPL', { exact: true })).toBeVisible()
})

test('under way, the card prepares the next day, and its groups line opens Grupos on that day', async ({ page }) => {
  await open(page, '/t/_/bracket8/admin/torneo')
  await expect(page.getByRole('heading', { name: R.titleNext(2) })).toBeVisible()
  await page.getByRole('link', { name: `${R.todoLabel}: ${R.groupsMissing(2)}` }).click()
  await expect(page).toHaveURL(/\/admin\/grupos\?ronda=r2$/)
  // Grupos starts on the current round (day 1) unless told otherwise.
  await expect(page.getByRole('tab', { name: t.round.day(2) })).toHaveAttribute('aria-selected', 'true')
  // Another day: the address follows, in place, so Back returns to Torneo and not to day 2 (N9).
  await page.getByRole('tab', { name: t.round.day(1) }).click()
  await expect(page).toHaveURL(/\/admin\/grupos\?ronda=r1$/)
  await page.goBack()
  await expect(page).toHaveURL(/\/admin\/torneo$/)
})

test('a design fixture asks no server: everything done reads «Listo para jugar», and the tab counts nothing (N4)', async ({ page }) => {
  const asked: string[] = []
  page.on('request', (r) => {
    if (/players_with_pin|tournament_profiles/.test(r.url())) asked.push(r.url())
  })
  await open(page, '/t/_/minimal4-setup/admin/torneo')
  await expect(page.getByText(R.allSet('jugadores, PIN, rondas, campo y grupos'))).toBeVisible()
  await expect(page.getByRole('link', { name: t.admin.sections.tournament, exact: true })).toBeVisible()
  expect(asked).toEqual([])
})

test('a knockout that needs more days than the tournament has: the line opens Torneo on Reglas, where the days are (N7)', async ({ page }) => {
  await open(page, '/t/_/match8/admin/torneo')
  await page.getByRole('link', { name: `${R.todoLabel}: ${R.bracketDays(3, 1)}` }).click()
  // The tab is opened and the address put back, so the same line works again.
  await expect(page.getByRole('tab', { name: t.admin.tournament.tabs.rules })).toHaveAttribute('aria-selected', 'true')
  await expect(page).toHaveURL(/\/admin\/torneo$/)
  await expect(page.getByRole('group', { name: W.rounds })).toBeVisible()
})
