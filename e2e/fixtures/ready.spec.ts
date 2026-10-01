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
})
