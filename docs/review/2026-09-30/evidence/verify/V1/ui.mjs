// V1: read the real MoneyScreen on the in-memory fixture (no DB). Every request to Supabase is intercepted:
// set_payment_paid is answered locally with 204 (nothing reaches production), everything else is aborted.
import { chromium } from 'playwright-core'
import { writeFileSync } from 'node:fs'

const DIR = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V1'
const BASE = 'http://127.0.0.1:4201'
const out = {}
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, locale: 'es-MX' })
const page = await ctx.newPage()
const supa = []
await page.route(/supabase\.co/, async (route) => {
  const req = route.request()
  supa.push({ url: req.url().replace(/^https:\/\/[^/]+/, ''), method: req.method(), body: req.postData() })
  if (req.url().includes('/rpc/set_payment_paid')) return route.fulfill({ status: 204, body: '' })
  return route.abort()
})
const dialogs = []
page.on('dialog', async (d) => {
  dialogs.push({ type: d.type(), message: d.message() })
  await d.dismiss()
})

await page.goto(`${BASE}/t/_/full12-finished/dinero`, { waitUntil: 'networkidle' })
await page.getByText('Quién debe qué').waitFor({ timeout: 20000 })

const sectionDump = async () =>
  page.evaluate(() => {
    const txt = (el) => (el?.innerText ?? '').replace(/\s+/g, ' ').trim()
    const main = document.querySelector('main') ?? document.body
    const sections = [...main.querySelectorAll('section')]
    return sections.map((s) => ({
      text: txt(s).slice(0, 4000),
      buttons: [...s.querySelectorAll('button')].map((b) => txt(b)),
      rows: [...s.querySelectorAll('[class*="transfer_"], [class*="transfer "]')].length,
    }))
  })

out.liquidacion = await sectionDump()
await page.screenshot({ path: `${DIR}/liquidacion-full.png`, fullPage: true })

// Sin banco
await page.getByRole('radio', { name: 'Sin banco' }).or(page.getByRole('button', { name: 'Sin banco' })).or(page.getByRole('tab', { name: 'Sin banco' })).first().click()
await page.waitForTimeout(300)
out.sinBanco = (await sectionDump()).slice(-1)

// Back to vía banco, then UX-21: tap the first "Pagado" in Quién debe qué and see what happens.
await page.getByRole('radio', { name: 'Vía banco' }).or(page.getByRole('button', { name: 'Vía banco' })).or(page.getByRole('tab', { name: 'Vía banco' })).first().click()
await page.waitForTimeout(300)
const checklist = page.locator('section', { has: page.getByRole('heading', { name: 'Quién debe qué' }) })
const firstRowText = await checklist.locator('button').first().evaluate((b) => b.parentElement?.innerText.replace(/\s+/g, ' '))
const before = supa.length
await checklist.getByRole('button', { name: 'Pagado' }).first().click()
await page.waitForTimeout(800)
out.ux21 = {
  tappedRow: firstRowText,
  dialogsAfterTap: dialogs.length,
  ariaDialogsVisible: await page.locator('[role="dialog"], dialog[open]').count(),
  requestsAfterTap: supa.slice(before).map((r) => ({ url: r.url.split('?')[0], method: r.method, body: r.body })),
  checklistButtonsLabels: [...new Set(await checklist.locator('button').allInnerTexts())],
}

// Por juego and Si terminara ahora
for (const mode of ['Por juego', 'Si terminara ahora']) {
  await page.getByRole('radio', { name: mode }).or(page.getByRole('button', { name: mode })).or(page.getByRole('tab', { name: mode })).first().click()
  await page.waitForTimeout(400)
  out[mode] = await page.evaluate(() => {
    const txt = (el) => (el?.innerText ?? '').replace(/\s+/g, ' ').trim()
    const main = document.querySelector('main') ?? document.body
    return { text: txt(main).slice(0, 6000), buttons: [...main.querySelectorAll('button')].map((b) => txt(b)).slice(0, 120) }
  })
}
// Expand Camilo in Si terminara ahora
await page.getByRole('button', { name: /Camilo/ }).first().click()
await page.waitForTimeout(300)
out.camiloBreakdown = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button[aria-expanded="true"]')][0]
  const box = btn?.parentElement
  return { text: (box?.innerText ?? '').replace(/\s+/g, ' ').trim(), buttons: [...(box?.querySelectorAll('button') ?? [])].map((b) => b.innerText.replace(/\s+/g, ' ').trim()) }
})
await page.screenshot({ path: `${DIR}/si-terminara-camilo.png`, fullPage: false })
out.supabaseRequests = supa.map((r) => r.url.split('?')[0])
writeFileSync(`${DIR}/ui.out.json`, JSON.stringify(out, null, 1))
await browser.close()
console.log('ok', Object.keys(out))
