// V6 verifier: walk the wizard demo (/organizer/nuevo/_) to the review step and the success screen.
// Own server on :4206 (HEAD design build). No writes anywhere (demo mode never calls createTournament).
import { chromium } from 'playwright-core'
import fs from 'node:fs'
const BASE = 'http://127.0.0.1:4206'
const OUT = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V6'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, locale: 'es-MX' })
const page = await ctx.newPage()
const log = {}
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(BASE + '/organizer/nuevo/_', { waitUntil: 'networkidle' })
await page.fill('input >> nth=0', "Nacho's Bachelor Invitational")
await page.fill('input >> nth=1', 'Los Cabos 2027')
await page.getByRole('button', { name: 'Siguiente' }).click()
await page.waitForTimeout(400)
log.step2Text = (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' / ')
// Choose 2 rounds ("¿Cuántos días (rondas)?" segmented control)
const roundsBtn = page.getByRole('radio', { name: '2', exact: true })
log.roundsRadioCount = await roundsBtn.count()
if (await roundsBtn.count()) await roundsBtn.first().click()
else await page.getByRole('button', { name: '2', exact: true }).first().click()
// Money on
const money = page.getByRole('switch', { name: /dinero/i })
log.moneySwitchCount = await money.count()
if (await money.count()) await money.first().click()
await page.waitForTimeout(300)
await page.getByRole('button', { name: 'Siguiente' }).click()
await page.waitForTimeout(500)
log.step3Text = (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' / ')
log.review = await page.evaluate(() => {
  const label = [...document.querySelectorAll('span.label')].find((s) => /Antes de crear|Revis/i.test(s.textContent || ''))
  const container = label?.nextElementSibling
  if (!container) return { found: false }
  const rows = [...container.children].map((row) => {
    const [k, v] = row.children
    const kb = k.getBoundingClientRect()
    const vb = v.getBoundingClientRect()
    return {
      rowClassAttr: row.getAttribute('class'),
      rowDisplay: getComputedStyle(row).display,
      rowBorderBottom: getComputedStyle(row).borderBottomStyle,
      keyClassAttr: k.getAttribute('class'),
      keyColor: getComputedStyle(k).color,
      innerText: row.innerText,
      keyBox: [Math.round(kb.left), Math.round(kb.top), Math.round(kb.width)],
      valueBox: [Math.round(vb.left), Math.round(vb.top), Math.round(vb.width)],
      sameLine: Math.abs(kb.top - vb.top) < 2,
      gapPx: Math.round(vb.left - (kb.left + kb.width)),
    }
  })
  return { found: true, containerClassAttr: container.getAttribute('class'), containerDisplay: getComputedStyle(container).display, rows }
})
// Which hashed review classes exist in the loaded CSS at all?
log.cssReviewSelectors = await page.evaluate(() => {
  const out = []
  for (const sh of document.styleSheets) {
    let rules
    try { rules = sh.cssRules } catch { continue }
    for (const r of rules) if (r.selectorText && /review/i.test(r.selectorText)) out.push(r.selectorText)
  }
  return out
})
await page.screenshot({ path: `${OUT}/wizard-step3-review-393.png` })
await page.screenshot({ path: `${OUT}/wizard-step3-review-393-full.png`, fullPage: true })
const create = page.getByRole('button', { name: /Crear torneo/ })
log.createEnabled = await create.isEnabled()
if (log.createEnabled) {
  await create.click()
  await page.waitForTimeout(700)
  log.doneText = (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' / ')
  log.doneLinks = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => ({ text: a.textContent?.trim(), href: a.getAttribute('href') })))
  await page.screenshot({ path: `${OUT}/wizard-done-393.png` })
  await page.screenshot({ path: `${OUT}/wizard-done-393-full.png`, fullPage: true })
}
log.pageErrors = errors
fs.writeFileSync(`${OUT}/wizard-walk.json`, JSON.stringify(log, null, 2))
console.log(JSON.stringify(log, null, 2))
await browser.close()
