/**
 * «Nuevo torneo», walked on a phone (the design fixture, `/organizer/nuevo/_`).
 *
 * UX-03: the review's label and value ran together («FormatoStableford»): the
 * card read its classes from a stylesheet that had none. UX-04: the review
 * named only the side games, so the Calcutta template read «Ninguno por
 * ahora». UX-05: the system back left the wizard and lost what was typed.
 * Every step keeps the suite's checks: no uncaught error, nothing wider than
 * the screen, no serious or critical axe violation.
 */
import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { t } from '../../src/i18n/es-MX'
import { expect, open, test } from './base'

const W = t.organizer.wizard

async function checks(page: Page, pageErrors: string[]) {
  expect(pageErrors, 'uncaught errors').toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'horizontal scroll (px)').toBeLessThanOrEqual(0)
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.length} × ${v.help}`)).toEqual([])
}

/** Every review line: its label's and its value's boxes and texts. */
function reviewRows(page: Page) {
  return page.locator('dl > div').evaluateAll((rows) =>
    rows.map((row) => {
      const [k, v] = [row.querySelector('dt')!, row.querySelector('dd')!]
      const [kb, vb] = [k.getBoundingClientRect(), v.getBoundingClientRect()]
      return { key: k.textContent, value: v.textContent, keyRight: kb.right, valueLeft: vb.left, ruled: getComputedStyle(row).borderBottomStyle !== 'none' }
    }),
  )
}

/** «Paso 2 de 3, Formato»: which step is on screen. */
const stepText = (n: number) => new RegExp(`^${W.stepOf(n, 3)}`)

for (const width of [375, 393]) {
  test(`every step at ${width}px, and a review laid out as lines (UX-03)`, async ({ page, pageErrors }) => {
    await page.setViewportSize({ width, height: 852 })
    await open(page, '/organizer/nuevo/_')
    await checks(page, pageErrors)
    await page.getByPlaceholder(W.namePlaceholder).fill('Copa de los Compadres')
    await page.getByPlaceholder(W.taglinePlaceholder).fill('Valle de Bravo, noviembre')
    await page.getByRole('button', { name: t.common.next }).click()
    await expect(page.getByText(stepText(2))).toBeVisible()
    await checks(page, pageErrors)
    await page.getByRole('button', { name: t.common.next }).click()
    await expect(page.getByText(stepText(3))).toBeVisible()
    await checks(page, pageErrors)
    const rows = await reviewRows(page)
    expect(rows.find((r) => r.key === W.reviewFormat)?.value).toBe('Stableford, puntos')
    for (const r of rows) {
      // The label's box ends before the value's begins: two columns, not one run of text.
      expect(r.keyRight, `${r.key}`).toBeLessThanOrEqual(r.valueLeft)
      expect(r.ruled, `${r.key} has its rule`).toBe(true)
    }
  })
}

test('the Calcutta template reviews its modules, each with its prize (UX-04)', async ({ page, pageErrors }) => {
  await open(page, '/organizer/nuevo/_')
  await page.getByPlaceholder(W.namePlaceholder).fill('Viaje a Los Cabos')
  await page.getByRole('button', { name: t.common.next }).click()
  await page.getByRole('button', { name: W.templateLink }).click()
  await page.getByRole('radio', { name: /^Viaje con Calcutta/ }).click()
  await page.getByRole('button', { name: t.common.next }).click()
  const rows = new Map((await reviewRows(page)).map((r) => [r.key, r.value]))
  expect(rows.get('La Calcutta')).toContain(W.reviewOwnPot)
  expect(rows.get('Los Matrimonios')).toBe('$3,000$2,000 + $1,000')
  expect(rows.get('Individual')).toMatch(/^\$20,000/)
  expect(rows.get(W.reviewPrizes)).toBe(`$30,000${W.reviewBalanced('$30,000')}`)
  await expect(page.getByText('Ninguno por ahora')).toHaveCount(0)
  await checks(page, pageErrors)
})

test('the system back goes back a step and keeps what was typed; forward returns; a reload and a back off the page keep the draft (UX-05)', async ({ page, pageErrors }) => {
  await open(page, '/fixture')
  await page.goto('/organizer/nuevo/_', { waitUntil: 'networkidle' })
  const name = page.getByPlaceholder(W.namePlaceholder)
  await name.fill('Copa de los Compadres')
  await page.getByRole('button', { name: t.common.next }).click()
  const players = page.getByLabel(W.players)
  await players.fill('14')
  await players.blur()
  await page.getByRole('button', { name: t.common.next }).click()
  await expect(page).toHaveURL(/\?paso=3$/)

  await page.goBack()
  await expect(page.getByText(stepText(2))).toBeVisible()
  await expect(players).toHaveValue('14')
  await page.goBack()
  await expect(page.getByText(stepText(1))).toBeVisible()
  await expect(name).toHaveValue('Copa de los Compadres')
  await page.goForward()
  await expect(page.getByText(stepText(2))).toBeVisible()
  await page.goForward()
  await expect(page.getByText(stepText(3))).toBeVisible()
  await expect(page.locator('dd').filter({ hasText: W.reviewField(14) })).toBeVisible()

  // A reload keeps the step and the draft.
  await page.reload({ waitUntil: 'networkidle' })
  await expect(page.getByText(stepText(3))).toBeVisible()
  await expect(page.locator('dd').filter({ hasText: 'Copa de los Compadres' })).toBeVisible()

  // «Atrás» twice, then the system back off the wizard. /fixture is another document (the wizard
  // was opened by address), which no page can stop without a «beforeunload» prompt: the draft
  // stays in the tab, and forward finds it.
  await page.getByRole('button', { name: t.common.back }).click()
  await page.getByRole('button', { name: t.common.back }).click()
  await expect(name).toHaveValue('Copa de los Compadres')
  await page.goBack()
  await expect(page).toHaveURL(/\/fixture$/)
  await page.goForward()
  await expect(name).toHaveValue('Copa de los Compadres')
  expect(pageErrors, 'uncaught errors').toEqual([])
})

test('leaving the wizard with something typed asks first, by a link or the system forward (UX-05)', async ({ page, pageErrors }) => {
  await open(page, '/organizer/nuevo/_')
  const name = page.getByPlaceholder(W.namePlaceholder)
  const brand = page.locator('a[href="/organizer"]').first()
  const left = /\/organizer(\/login)?$/
  const wizard = /\/organizer\/nuevo\/_$/
  const asked = page.getByRole('heading', { name: W.leaveTitle })
  // Nothing typed: nothing to ask.
  await brand.click()
  await expect(page).toHaveURL(left)
  await page.goBack()
  await name.fill('Copa de los Compadres')
  // The system forward, onto the page left before: asked, and «Seguir aquí» stays with what was typed.
  await page.goForward()
  await expect(asked).toBeVisible()
  await page.getByRole('button', { name: W.leaveStay }).click()
  await expect(asked).toBeHidden()
  await expect(page).toHaveURL(wizard)
  await expect(name).toHaveValue('Copa de los Compadres')
  // A link: asked the same way, and «Salir y borrar» goes.
  await brand.click()
  await expect(asked).toBeVisible()
  await page.getByRole('button', { name: W.leaveConfirm }).click()
  await expect(page).toHaveURL(left)
  // Gone on purpose: the wizard opens blank, and the back leaves no question behind.
  await page.goBack()
  await expect(page).toHaveURL(wizard)
  await expect(name).toHaveValue('')
  await expect(asked).toBeHidden()
  // The forward again, this time to leave.
  await name.fill('Otra copa')
  await page.goForward()
  await expect(asked).toBeVisible()
  await page.getByRole('button', { name: W.leaveConfirm }).click()
  await expect(page).toHaveURL(left)
  await page.goBack()
  await expect(name).toHaveValue('')
  expect(pageErrors, 'uncaught errors').toEqual([])
})
