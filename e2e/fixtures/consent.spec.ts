/**
 * TRUST-05: where someone gives their data, the terms and the notice are a
 * tap away and on the screen before the action, on a small phone. The real
 * screens on the fixtures; each test failed before its fix.
 *
 * «On the screen» means read, not only present: PR #88's second verifier set
 * the line at 1px, and painted it the colour of the page, and every check
 * still passed (axe files a 1:1 contrast as «incomplete», not as a
 * violation). So each line is checked for readable type, a real box, full
 * opacity and contrast, and its words are held as the reader gets them, not
 * rebuilt from the strings under test.
 */
import AxeBuilder from '@axe-core/playwright'
import type { Locator, Page } from '@playwright/test'
import { t } from '../../src/i18n/es-MX'
import { expect, open, test } from './base'

const C = t.legal.consent
const SMALL_PHONES = [
  [375, 667],
  [320, 568],
] as const

/** Each line with what a screen reader adds after each link. */
const ENTER_LINE = 'Al entrar aceptas los Términos (se abre en otra pestaña) y el Aviso de privacidad (se abre en otra pestaña).'
const CONTINUE_LINE = 'Al continuar aceptas los Términos de uso (se abre en otra pestaña) y el Aviso de privacidad (se abre en otra pestaña).'
const OTHERS_NOTE = /^Lo que captures de cada jugador, salvo su PIN, lo ven todos en el torneo; quién más lo ve está en el Aviso de privacidad/
/** The smallest text the design sets for reading: --fs-xs. */
const MIN_READING_PX = 12
/** WCAG AA for text this size. */
const MIN_CONTRAST = 4.5

/** On the screen as it is: nothing to scroll before reading it. */
async function expectOnScreen(page: Page, el: Locator) {
  await expect(el).toBeVisible()
  const box = (await el.boundingBox())!
  const view = page.viewportSize()!
  expect(box.y, 'top edge').toBeGreaterThanOrEqual(0)
  expect(box.y + box.height, 'bottom edge').toBeLessThanOrEqual(view.height)
}

/** WCAG contrast of the element's text against the first background behind it (white if the page sets none). */
function contrastOf(el: Locator) {
  return el.evaluate((e) => {
    const channels = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number)
    const luminance = ([r, g, b]: number[]) => {
      const linear = (v: number) => {
        const s = v / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * linear(r!) + 0.7152 * linear(g!) + 0.0722 * linear(b!)
    }
    let back = [255, 255, 255]
    for (let n: Element | null = e; n; n = n.parentElement) {
      const c = channels(getComputedStyle(n).backgroundColor)
      if (c.length >= 3 && (c[3] ?? 1) > 0) {
        back = c.slice(0, 3)
        break
      }
    }
    const [hi, lo] = [luminance(channels(getComputedStyle(e).color)), luminance(back)].sort((a, b) => b - a)
    return (hi! + 0.05) / (lo! + 0.05)
  })
}

/** Readable: type at least --fs-xs, a box that holds it (not a 1px or visually hidden one), fully opaque once it settles, and in a colour that stands out from what is behind it. */
async function expectReadable(el: Locator) {
  await expect(el).toBeVisible()
  await expect
    .poll(
      () =>
        el.evaluate((e) => {
          let opacity = 1
          for (let n: Element | null = e; n; n = n.parentElement) opacity *= Number(getComputedStyle(n).opacity)
          return opacity
        }),
      { message: 'opacity, with everything around it' },
    )
    .toBeGreaterThan(0.99)
  const { size, height, width } = await el.evaluate((e) => ({ size: parseFloat(getComputedStyle(e).fontSize), height: e.getBoundingClientRect().height, width: e.getBoundingClientRect().width }))
  expect(size, 'font size').toBeGreaterThanOrEqual(MIN_READING_PX)
  expect(height, 'height').toBeGreaterThanOrEqual(size)
  expect(width, 'width').toBeGreaterThanOrEqual(120)
  expect(await contrastOf(el), 'contrast with what is behind it').toBeGreaterThanOrEqual(MIN_CONTRAST)
}

/** `a` comes before `b` in reading and keyboard order. */
async function expectBefore(a: Locator, b: Locator) {
  const other = await b.elementHandle()
  expect(await a.evaluate((x, y) => !!(x.compareDocumentPosition(y!) & Node.DOCUMENT_POSITION_FOLLOWING), other)).toBe(true)
}

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  return results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.length} × ${v.help}`)
}

for (const [width, height] of SMALL_PHONES) {
  test(`face grid, 12 players at ${width}×${height}: «${C.enterStart}…» on the first screen and on the PIN step`, async ({ page, pageErrors }) => {
    await page.setViewportSize({ width, height })
    await open(page, '/t/_/full12-live?as=new-phone')
    const faces = page.locator('button[class*="_face_"]')
    await expect(faces).toHaveCount(12)
    const line = page.locator('[data-legal-consent]')
    await expect(line).toHaveCount(1)
    await expectOnScreen(page, line)
    await expectReadable(line)
    await expectBefore(line, faces.first())
    await expect(line).toHaveText(ENTER_LINE)
    await expect(line.getByRole('link', { name: new RegExp(`^${C.termsShort}`) })).toHaveAttribute('href', /^\/terminos(\?|$)/)
    await expect(line.getByRole('link', { name: new RegExp(`^${C.privacy}`) })).toHaveAttribute('href', /^\/privacidad(\?|$)/)
    expect(await seriousViolations(page)).toEqual([])

    // The PIN step: claim_player runs on the fourth digit, so the line is above the field.
    await faces.first().click()
    const pin = page.getByLabel(t.enter.pin, { exact: true })
    await expect(pin).toBeFocused()
    await expect(line).toHaveCount(1)
    await expectOnScreen(page, line)
    await expectReadable(line)
    await expectBefore(line, pin)
    // The field takes focus as the step opens: a screen reader hears the line with it.
    await expect(pin).toHaveAccessibleDescription(/Al entrar aceptas los Términos/)
    expect(await seriousViolations(page)).toEqual([])
    expect(pageErrors, 'uncaught errors').toEqual([])
  })
}

test('face grid, 60 players at 320×568 (dense, with its name filter): the line first, on the first screen', async ({ page, pageErrors }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await open(page, '/t/_/large60?as=new-phone')
  const faces = page.locator('button[class*="_face_"]')
  await expect(faces).toHaveCount(60)
  const line = page.locator('[data-legal-consent]')
  await expect(line).toHaveCount(1)
  await expect(line).toHaveText(ENTER_LINE)
  await expectOnScreen(page, line)
  await expectReadable(line)
  await expectBefore(line, page.getByRole('searchbox', { name: t.enter.search }))
  await expectBefore(line, faces.first())
  expect(pageErrors, 'uncaught errors').toEqual([])
})

test('Comité › Campos (and /campos, the same screen): who reads a scorecard photo, before «Subir tarjeta»', async ({ page, pageErrors }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await open(page, '/t/_/full12-live/admin/campos')
  const note = page.locator('[data-legal-consent]')
  await expect(note).toHaveCount(1)
  await expect(note).toHaveText(
    'Foto o PDF de la tarjeta del campo: se la mandamos a Anthropic para que Claude la lea, y tú revisas todo antes de guardar. Más en el Aviso de privacidad (se abre en otra pestaña).',
  )
  await expect(note.getByRole('link', { name: new RegExp(`^${t.legal.scorecardNote.privacy}`) })).toHaveAttribute('href', /^\/privacidad(\?|$)/)
  const upload = page.getByRole('button', { name: t.admin.courses.photo, exact: true })
  await expectOnScreen(page, note)
  await expectReadable(note)
  await expectBefore(note, upload)
  await expect(upload).toHaveAccessibleDescription(/Anthropic/)
  expect(await seriousViolations(page)).toEqual([])
  expect(pageErrors, 'uncaught errors').toEqual([])
})

for (const [width, height] of SMALL_PHONES) {
  test(`/entrar with Google at ${width}×${height}: the line on the first screen, before Google and the email (P3)`, async ({ page, pageErrors }) => {
    await page.setViewportSize({ width, height })
    // Registered after the fixture's catch-all, so it answers first: Google sign-in is on.
    await page.route(/\/auth\/v1\/settings/, (r) => r.fulfill({ json: { external: { google: true, email: true } } }))
    await open(page, '/entrar')
    const google = page.getByRole('button', { name: new RegExp(t.account.google) })
    await expect(google).toBeVisible()
    const line = page.locator('[data-legal-consent]')
    await expect(line).toHaveCount(1)
    await expect(line).toHaveText(CONTINUE_LINE)
    await expectOnScreen(page, line)
    await expectReadable(line)
    await expectBefore(line, google)
    await expectBefore(line, page.getByLabel(t.account.email))
    await expectBefore(line, page.getByRole('button', { name: t.account.sendCode }))
    // Keyboard order too: the line's two links come before the first way in.
    await page.keyboard.press('Tab')
    const order: string[] = []
    for (let i = 0; i < 6; i++) {
      order.push(await page.evaluate(() => document.activeElement?.getAttribute('href') ?? document.activeElement?.textContent?.trim() ?? ''))
      await page.keyboard.press('Tab')
    }
    const google_ = order.findIndex((x) => x.includes(t.account.google))
    expect(order.findIndex((x) => x.startsWith('/terminos')), order.join(' | ')).toBeLessThan(google_)
    expect(order.findIndex((x) => x.startsWith('/privacidad')), order.join(' | ')).toBeLessThan(google_)
    expect(await seriousViolations(page)).toEqual([])
    expect(pageErrors, 'uncaught errors').toEqual([])
  })
}

for (const mode of ['in', 'up'] as const) {
  test(`organizer ${mode === 'in' ? 'sign-in' : 'sign-up'} at 320×568: the line on the first screen, before the button`, async ({ page, pageErrors }) => {
    await page.setViewportSize({ width: 320, height: 568 })
    await open(page, '/organizer/login')
    if (mode === 'up') await page.getByRole('button', { name: t.auth.toggleToSignUp }).click()
    const line = page.locator('[data-legal-consent]')
    await expect(line).toHaveCount(1)
    await expect(line).toHaveText(CONTINUE_LINE)
    await expectOnScreen(page, line)
    await expectReadable(line)
    await expectBefore(line, page.getByRole('button', { name: mode === 'in' ? t.auth.signIn : t.auth.signUp, exact: true }))
    expect(pageErrors, 'uncaught errors').toEqual([])
  })
}

test('Ronda rápida at 320×568: wherever «Empezar» is on the screen, the line is too, above it', async ({ page, pageErrors }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await open(page, '/ronda/_')
  const start = page.getByRole('button', { name: t.quick.start, exact: true })
  await expect(start).toBeEnabled()
  await start.scrollIntoViewIfNeeded()
  const line = page.locator('[data-legal-consent]')
  await expect(line).toHaveCount(1)
  await expect(line).toHaveText(CONTINUE_LINE)
  await expectOnScreen(page, start)
  await expectOnScreen(page, line)
  await expectReadable(line)
  await expectBefore(line, start)
  expect(pageErrors, 'uncaught errors').toEqual([])
})

test('Comité, a new player: the field that takes focus is described by the notice above it (P3)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await open(page, '/t/_/full12-live/admin/jugadores')
  await page.getByRole('button', { name: t.admin.players.add }).click()
  const name = page.getByRole('dialog').getByLabel(t.admin.players.fullName)
  await expect(name).toBeFocused()
  await expect(name).toHaveAccessibleDescription(OTHERS_NOTE)
  const note = page.getByRole('dialog').locator('[data-legal-consent]')
  await expectOnScreen(page, note)
  await expectReadable(note)
})

test('Comité, an existing player: the notice on screen, and the name field described by it', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await open(page, '/t/_/full12-live/admin/jugadores')
  await page.getByRole('button').filter({ hasText: 'Arturo' }).first().click()
  const note = page.getByRole('dialog').locator('[data-legal-consent]')
  await expectOnScreen(page, note)
  await expectReadable(note)
  await expect(page.getByRole('dialog').getByLabel(t.admin.players.fullName)).toHaveAccessibleDescription(OTHERS_NOTE)
})

test('a page opened from a consent link offers to close its tab, and closing it leaves the form as it was (P3)', async ({ page, pageErrors }) => {
  // The new tab is a page of its own: answer its Supabase calls too.
  await page.context().route(/supabase\.co|\/rest\/v1\/|\/auth\/v1\//, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await open(page, '/entrar')
  const email = page.getByLabel(t.account.email)
  await email.fill('medio@escri')
  const [tab] = await Promise.all([page.waitForEvent('popup'), page.locator('[data-legal-consent]').getByRole('link', { name: new RegExp(`^${C.privacy}`) }).click()])
  await expect(tab.getByRole('heading', { level: 1, name: t.legal.privacy.title })).toBeVisible()
  await expect(tab.getByRole('link', { name: t.legal.back })).toHaveCount(0)
  // Across to the terms, still in that tab: it replaces the page, so the tab stays one page long and can still close.
  await tab.getByRole('link', { name: t.legal.terms.title }).click()
  await expect(tab.getByRole('heading', { level: 1, name: t.legal.terms.title })).toBeVisible()
  expect(await tab.evaluate(() => history.length)).toBe(1)
  // The tab closes inside the click, so the click may find its page already gone: the close event is the proof.
  await Promise.all([tab.waitForEvent('close'), tab.getByRole('button', { name: t.legal.close }).click().catch(() => undefined)])
  await expect(email).toHaveValue('medio@escri')
  expect(pageErrors, 'uncaught errors').toEqual([])
})

test('a page with the marker that the browser will not close says so and offers «Volver a Polo» (P3)', async ({ page, pageErrors }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  // Reached by hand in a tab with history behind it: no browser lets a page close that tab.
  await open(page, '/entrar')
  await page.goto('/privacidad?desde=formulario', { waitUntil: 'networkidle' })
  await expect(page.getByRole('heading', { level: 1, name: t.legal.privacy.title })).toBeVisible()
  await expect(page.getByRole('link', { name: t.legal.back })).toHaveCount(0)
  await page.getByRole('button', { name: t.legal.close }).click()
  await expect(page.getByRole('status').filter({ hasText: 'navegador' })).toHaveText('Este navegador no deja cerrar la pestaña desde aquí: ciérrala tú y vuelve a la de Polo.')
  const back = page.getByRole('link', { name: t.legal.back })
  await expect(back).toBeVisible()
  await back.click()
  await expect(page).toHaveURL(/\/$/)
  expect(pageErrors, 'uncaught errors').toEqual([])
})

for (const path of ['/privacidad', '/terminos?desde=formulario']) {
  test(`${path} at 320×568: the whole text fits a small phone and passes axe`, async ({ page, pageErrors }) => {
    await page.setViewportSize({ width: 320, height: 568 })
    await open(page, path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'horizontal scroll (px)').toBeLessThanOrEqual(0)
    expect(await seriousViolations(page)).toEqual([])
    expect(pageErrors, 'uncaught errors').toEqual([])
  })
}
