/**
 * The keyboard and a screen reader, at 393 px (A11Y-03, A11Y-12, A11Y-13).
 *
 * A11Y-03: Tab walked out of an open sheet into the page and the tab bar
 * behind it (23 of 80 presses on the player sheet). A11Y-12: opening a game in
 * Juegos and each step of Nuevo torneo dropped focus to <body>. A11Y-13: every
 * page was titled «Polo», and changing page said nothing. Each check here is
 * the real build's, in Chromium, whose `inert` is the real one.
 */
import type { Page } from '@playwright/test'
import { t } from '../../src/i18n/es-MX'
import { expect, open, test } from './base'

/** Where focus is: inside an open sheet, on the tab bar, or neither. */
const focusPlace = (page: Page) =>
  page.evaluate(() => {
    const a = document.activeElement
    return {
      inDialog: !!a?.closest('[role="dialog"]'),
      inTabBar: !!a?.closest('nav'),
      tag: a?.tagName ?? null,
      text: (a?.textContent ?? '').trim().slice(0, 40),
    }
  })

test('an open sheet keeps Tab inside it, Escape closes it and focus goes back to the row that opened it (A11Y-03)', async ({
  page,
}) => {
  await open(page, '/t/_/full12-live')
  const row = page.locator('button[class*="leaderRow"]').first()
  await row.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await expect.poll(async () => (await focusPlace(page)).inDialog).toBe(true)
  const seen = new Set<string>()
  for (let i = 0; i < 50; i++) {
    await page.keyboard.press('Tab')
    const at = await focusPlace(page)
    expect(at.inDialog, `Tab ${i + 1} left the sheet for ${at.tag} «${at.text}»`).toBe(true)
    expect(at.inTabBar).toBe(false)
    seen.add(at.text)
  }
  // It went round: more than one stop, and it came back to them.
  expect(seen.size).toBeGreaterThan(1)
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Shift+Tab')
    expect((await focusPlace(page)).inDialog, `Shift+Tab ${i + 1} left the sheet`).toBe(true)
  }
  // The page behind is inert, the tab bar included.
  expect(await page.evaluate(() => !!document.querySelector('nav')?.closest('[inert]'))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // At once nothing of the page is inert; the sheet itself, inert while its exit plays (MOT-09), then goes too.
  expect(
    await page.evaluate(() =>
      Array.from(document.querySelectorAll('[inert]')).every((el) => el.querySelector('[role="dialog"]')),
    ),
  ).toBe(true)
  await expect.poll(() => page.evaluate(() => document.querySelectorAll('[inert]').length)).toBe(0)
  await expect(row).toBeFocused()
})

test('a sheet inside a sheet: Escape closes only the top one, and Tab stays in the one left (A11Y-03)', async ({
  page,
}) => {
  await open(page, '/t/_/full12-live')
  await page.locator('button[class*="leaderRow"]').first().click()
  const how = page.getByRole('dialog').getByRole('button', { name: t.money.howCalculated }).first()
  await how.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toHaveCount(2)
  const top = page.getByRole('dialog').last()
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab')
    expect(await top.evaluate((d) => d.contains(document.activeElement))).toBe(true)
  }
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await expect(how).toBeFocused()
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab')
    expect((await focusPlace(page)).inDialog).toBe(true)
  }
})

test('each page has its own title, and a tab of the bar says the new page while keeping focus (A11Y-13)', async ({
  page,
}) => {
  await open(page, '/t/_/full12-live')
  const name = await page.evaluate(() => document.querySelector('header')?.textContent ?? '')
  const title = await page.title()
  expect(title).toMatch(new RegExp(`^${t.nav.live}, .+ — Polo$`))
  expect(name).toContain(title.slice(`${t.nav.live}, `.length, -' — Polo'.length))
  const tab = page
    .getByRole('navigation', { name: t.common.sections })
    .getByRole('link', { name: new RegExp(`^${t.nav.games}`) })
  await tab.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/juegos$/)
  await expect(page).toHaveTitle(new RegExp(`^${t.nav.games}, .+ — Polo$`))
  await expect(page.locator('p[aria-live="polite"]').filter({ hasText: new RegExp(`^${t.nav.games}, `) })).toHaveCount(
    1,
  )
  await expect(tab).toBeFocused()
})

test('Juegos: a game opened takes focus at its heading, and back returns it to the game’s line (A11Y-12)', async ({
  page,
}) => {
  await open(page, '/t/_/full12-live/juegos')
  const line = page.locator('button[data-game]').first()
  const label = (await line.getAttribute('data-game'))!
  await line.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('h1[data-view-heading]')).toBeFocused()
  await page.getByRole('button', { name: t.common.back }).focus()
  await page.keyboard.press('Enter')
  await expect(page.locator(`button[data-game="${label}"]`)).toBeFocused()
})

test('Nuevo torneo: each step takes focus where it says which step it is (A11Y-12)', async ({ page }) => {
  await open(page, '/organizer/nuevo/_')
  await page.getByPlaceholder(t.organizer.wizard.namePlaceholder).fill('Copa del teclado')
  await page.getByRole('button', { name: t.common.next }).focus()
  await page.keyboard.press('Enter')
  // The step moves focus once its view has rendered, a frame after the key: wait for it, as a screen reader does.
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.textContent ?? ''))
    .toBe(`${t.organizer.wizard.stepOf(2, 3)}, ${t.organizer.wizard.step2}`)
  // The wizard is its own page.
  await expect(page).toHaveTitle(`${t.titles.newTournament} — Polo`)
})
