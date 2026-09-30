// V8 / PWA-05: system back (history.back) with a sheet open, and with an unsaved hole in the Tarjeta.
import { chromium } from 'playwright-core'
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const B = 'http://127.0.0.1:4208'
const b = await chromium.launch({ executablePath: EXE })
const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
const dialogs = []
page.on('dialog', async (d) => { dialogs.push(d.message()); await d.dismiss() })
const path = () => page.url().replace(B, '')

// 1. Sheet open + back
await page.goto(`${B}/fixture`, { waitUntil: 'networkidle' })
await page.locator('a[href="/t/_/full12-live"]').first().click()
await page.waitForURL('**/t/_/full12-live')
await page.waitForTimeout(500)
const row = page.locator('main button[aria-label]').filter({ hasText: /\d/ }).first()
const rowName = await row.getAttribute('aria-label')
await row.click()
await page.getByRole('dialog').first().waitFor()
console.log(`1a. sheet open from row "${rowName?.slice(0, 40)}…": url=${path()} dialogs=${await page.getByRole('dialog').count()} history.length=${await page.evaluate(() => history.length)}`)
await page.goBack()
await page.waitForTimeout(600)
console.log(`1b. after goBack: url=${path()} dialogs=${await page.getByRole('dialog').count()} native confirm=${dialogs.length}`)

// 2. Unsaved hole + back
await page.goto(`${B}/t/_/full12-live`, { waitUntil: 'networkidle' })
await page.getByRole('link', { name: 'Tarjeta' }).click()
await page.waitForURL('**/tarjeta')
await page.waitForTimeout(500)
const plus = page.getByRole('button', { name: 'Golpes: más' }).first()
const valueOf = async () => (await page.getByRole('group', { name: 'Golpes' }).first().innerText()).replace(/\s+/g, ' ').trim()
const header = async () => (await page.locator('main').innerText()).match(/Hoyo \d+|\b\d{1,2}\b/)?.[0]
const before = await valueOf()
await plus.click(); await plus.click()
const after = await valueOf()
console.log(`2a. Tarjeta first strokes stepper: before="${before}" after two taps="${after}" url=${path()}`)
await page.goBack()
await page.waitForTimeout(600)
console.log(`2b. after goBack: url=${path()} native confirm=${dialogs.length}`)
await page.goForward()
await page.waitForURL('**/tarjeta')
await page.waitForTimeout(600)
console.log(`2c. after goForward: stepper="${await valueOf()}" (draft ${(await valueOf()) === before ? 'LOST' : 'kept'})`)

// 3. For comparison: an in-app swipe to the next hole and back, with an unsaved change
await plus.click(); await plus.click()
const dirty = await valueOf()
const cdp = await ctx.newCDPSession(page)
const swipe = async (x0, x1) => {
  const y = 520
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] })
  for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + ((x1 - x0) * i) / 5, y }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForTimeout(500)
}
const holeText = async () => (await page.locator('main').innerText()).split('\n').slice(0, 6).join(' | ')
const h0 = await holeText()
await swipe(330, 90) // next hole
const h1 = await holeText()
await swipe(90, 330) // previous hole
console.log(`3. in-app swipe: dirty="${dirty}" -> next -> back: stepper="${await valueOf()}" (draft ${(await valueOf()) === before ? 'LOST' : 'kept'}); header before="${h0.slice(0, 80)}" after next="${h1.slice(0, 80)}"`)
await b.close()
