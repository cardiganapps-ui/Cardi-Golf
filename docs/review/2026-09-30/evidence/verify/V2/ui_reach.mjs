// V2: UI reachability checks on my own preview (:4202, HEAD build with fixture routes).
import { chromium } from 'playwright-core'
import { writeFileSync } from 'node:fs'

const E = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V2'
const BASE = 'http://127.0.0.1:4202'
const out = {}
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
page.setDefaultTimeout(15000)

// A) Comité › Rondas: the round editor offers 9 holes, on an existing (live) round.
try {
  await page.goto(`${BASE}/t/_/minimal4-live/admin/rondas`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Editar' }).first().click()
  await page.waitForTimeout(500)
  const selects = await page.locator('select').evaluateAll((els) => els.map((e) => ({ value: e.value, options: [...e.options].map((o) => o.textContent) })))
  out.rondas = { selects }
  await page.screenshot({ path: `${E}/rondas-edit-sheet.png` })
} catch (e) {
  out.rondasError = String(e)
}

// B) Wizard demo: template "Viaje con Calcutta" then format "Por equipos" → review → Crear enabled.
try {
  await page.goto(`${BASE}/organizer/nuevo/_`, { waitUntil: 'networkidle' })
  await page.locator('input').first().fill('Scramble con Calcutta')
  await page.getByRole('button', { name: 'Siguiente' }).click()
  await page.getByRole('button', { name: '¿Prefieres empezar de una plantilla?' }).click()
  await page.getByRole('radio', { name: /Viaje con Calcutta/ }).click()
  await page.waitForTimeout(300)
  await page.getByRole('radio', { name: /Por equipos/ }).click()
  await page.waitForTimeout(300)
  const teamChecked = await page.getByRole('radio', { name: /Por equipos/ }).getAttribute('aria-checked')
  await page.screenshot({ path: `${E}/wizard-team-after-calcutta-template.png`, fullPage: true })
  await page.getByRole('button', { name: 'Siguiente' }).click()
  await page.waitForTimeout(300)
  const review = await page.locator('main, body').first().innerText()
  const create = page.getByRole('button', { name: /Crear/ })
  const createEnabled = await create.isEnabled()
  await page.screenshot({ path: `${E}/wizard-team-calcutta-review.png`, fullPage: true })
  await create.click()
  await page.waitForTimeout(500)
  const afterCreate = (await page.locator('body').innerText()).slice(0, 300)
  out.wizard = { teamChecked, createEnabled, review: review.slice(0, 900), afterCreate }
} catch (e) {
  out.wizardError = String(e)
}

// C) Comité › Torneo › Juegos on the team fixture: the Calcutta module toggle is there and switchable.
try {
  await page.goto(`${BASE}/t/_/team8/admin/torneo`, { waitUntil: 'networkidle' })
  await page.getByRole('tab', { name: 'Juegos' }).click().catch(async () => page.getByText('Juegos', { exact: true }).first().click())
  await page.waitForTimeout(300)
  const sw = page.getByRole('switch', { name: 'La Calcutta' }).or(page.getByRole('checkbox', { name: 'La Calcutta' }))
  const before = await sw.first().isChecked().catch(() => null)
  await sw.first().click()
  await page.waitForTimeout(300)
  const after = await sw.first().isChecked().catch(() => null)
  const save = page.getByRole('button', { name: /Guardar/ }).first()
  const saveEnabled = await save.isEnabled().catch(() => null)
  const errors = await page.locator('[class*=error]').allInnerTexts().catch(() => [])
  await page.screenshot({ path: `${E}/team8-torneo-juegos-calcutta-on.png`, fullPage: true })
  out.team8 = { before, after, saveEnabled, errors }
} catch (e) {
  out.team8Error = String(e)
}

writeFileSync(`${E}/ui_reach.result.json`, JSON.stringify(out, null, 1))
console.log(JSON.stringify(out, null, 1))
await browser.close()
