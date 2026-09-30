// A11Y panel: open states (sheets, sub-tabs, grid, wizard) + focus management checks.
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'

const DIR = path.dirname(new URL(import.meta.url).pathname)
const AXE = path.join(DIR, 'node_modules/axe-core/axe.min.js')
const BASE = 'http://127.0.0.1:4173'
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']
const out = path.join(DIR, 'axe-states.json')
const results = []
const facts = []
const flush = () => fs.writeFileSync(out, JSON.stringify({ results, facts }, null, 1))

async function axe(page, label) {
  if (!(await page.evaluate(() => typeof window.axe !== 'undefined'))) await page.addScriptTag({ path: AXE })
  const r = await page.evaluate(async (runOnly) => {
    const r = await window.axe.run(document, { runOnly, resultTypes: ['violations', 'incomplete'] })
    return {
      violations: r.violations.map((v) => ({ id: v.id, impact: v.impact, count: v.nodes.length, nodes: v.nodes.slice(0, 6).map((n) => ({ target: n.target.join(' '), html: n.html.slice(0, 160), summary: (n.failureSummary || '').slice(0, 260) })) })),
      incomplete: r.incomplete.map((v) => ({ id: v.id, count: v.nodes.length, nodes: v.nodes.slice(0, 3).map((n) => ({ target: n.target.join(' '), html: n.html.slice(0, 120) })) })),
    }
  }, TAGS)
  results.push({ label, url: page.url(), ...r })
  console.log(`[axe] ${label}: ${r.violations.map((v) => `${v.id}(${v.impact[0]}${v.count})`).join(' ') || '-'}`)
  flush()
}
const active = (page) =>
  page.evaluate(() => {
    const a = document.activeElement
    const d = a?.closest?.('[role="dialog"]')
    return { tag: a?.tagName, cls: String(a?.className ?? '').slice(0, 60), text: (a?.getAttribute?.('aria-label') ?? a?.textContent ?? '').trim().slice(0, 60), inDialog: !!d }
  })
const dialogInfo = (page) =>
  page.evaluate(() => {
    const ds = [...document.querySelectorAll('[role="dialog"]')]
    return ds.map((d) => ({ name: d.getAttribute('aria-label') ?? d.getAttribute('aria-labelledby'), modal: d.getAttribute('aria-modal'), buttons: [...d.querySelectorAll('button')].slice(0, 6).map((b) => (b.getAttribute('aria-label') ?? b.textContent).trim().slice(0, 40)), hasClose: [...d.querySelectorAll('button')].some((b) => /cerrar/i.test(b.getAttribute('aria-label') ?? b.textContent)) }))
  })
async function trapTest(page, n = 60) {
  let left = 0
  const seen = []
  for (let i = 0; i < n; i++) {
    await page.keyboard.press('Tab')
    const a = await active(page)
    if (!a.inDialog) {
      left++
      if (seen.length < 4) seen.push(`${a.tag}.${a.cls.slice(0, 25)} "${a.text.slice(0, 30)}"`)
    }
  }
  return { tabs: n, focusOutsideDialog: left, examplesOutside: seen }
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'es-MX' })
const page = await ctx.newPage()
const F = '/t/_/full12-live'

// 1. Player sheet from the live board
await page.goto(BASE + F, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
const firstRow = page.locator('button[aria-label*=".º"]').first()
const rowName = await firstRow.getAttribute('aria-label')
await firstRow.focus()
await page.keyboard.press('Enter')
await page.waitForTimeout(500)
facts.push({ state: 'player sheet opened by keyboard from row', row: rowName, activeAfterOpen: await active(page), dialogs: await dialogInfo(page) })
await axe(page, 'live: player sheet open')
facts.push({ state: 'player sheet tab trap', ...(await trapTest(page, 80)) })
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
facts.push({ state: 'player sheet after Escape', dialogsLeft: (await dialogInfo(page)).length, activeAfterClose: await active(page) })
flush()

// 2. Explanation sheet nested inside the player sheet (HowCalculated)
await firstRow.click()
await page.waitForTimeout(400)
const how = page.locator('[role="dialog"] button', { hasText: /cómo se calculó/i }).first()
if (await how.count()) {
  await how.click()
  await page.waitForTimeout(400)
  facts.push({ state: 'nested explanation sheet', dialogs: await dialogInfo(page), active: await active(page) })
  await axe(page, 'live: player sheet + explanation sheet')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  facts.push({ state: 'after one Escape (nested)', dialogsLeft: (await dialogInfo(page)).length, active: await active(page) })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
}
flush()

// 3. Tarjeta: grid view, weird-value confirm, tiebreak
await page.goto(BASE + F + '/tarjeta', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
const stepperGroups = await page.evaluate(() => [...document.querySelectorAll('[role="group"]')].map((g) => g.getAttribute('aria-label')))
const stepButtons = await page.evaluate(() => [...document.querySelectorAll('[role="group"] button')].map((b) => b.getAttribute('aria-label')))
const pickupNames = await page.evaluate(() => [...document.querySelectorAll('button[aria-pressed]')].map((b) => b.textContent.trim()))
facts.push({ state: 'tarjeta hole view names', stepperGroups, stepButtons, pickupNames })
await page.getByRole('button', { name: /^Ver tarjeta$/ }).first().click().catch(() => undefined)
await page.waitForTimeout(500)
await axe(page, 'tarjeta: grid view')
const gridFacts = await page.evaluate(() => {
  const tbl = document.querySelector('table')
  if (!tbl) return null
  const ths = [...tbl.querySelectorAll('thead th')].map((th) => th.textContent.trim())
  const rowHeaders = [...tbl.querySelectorAll('tbody th')].length
  const firstCell = tbl.querySelector('tbody tr td:nth-child(4)')
  return { headers: ths, rowHeaderCount: rowHeaders, firstPlayerCellHTML: firstCell?.innerHTML.slice(0, 400) }
})
facts.push({ state: 'tarjeta grid table semantics', gridFacts })
flush()
await page.getByRole('button', { name: /^Ver hoyo$/ }).first().click().catch(() => undefined)
await page.waitForTimeout(300)
// weird value: +6 strokes on the first player
const plus = page.locator('[role="group"] button[aria-label$="más"]').first()
for (let i = 0; i < 7; i++) await plus.click()
await page.getByRole('button', { name: /^Guardar hoyo|^Guardar y ver/ }).first().click()
await page.waitForTimeout(400)
facts.push({ state: 'weird confirm sheet', dialogs: await dialogInfo(page), active: await active(page) })
await axe(page, 'tarjeta: weird-values confirm sheet')
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
flush()

// 4. Juegos: every sub-tab
await page.goto(BASE + F + '/juegos', { waitUntil: 'networkidle' })
await page.waitForTimeout(700)
const games = await page.evaluate(() => [...document.querySelectorAll('main button')].map((b) => b.textContent.trim().slice(0, 30)))
const count = await page.locator('main h1 ~ div button').count()
for (let i = 0; i < count; i++) {
  await page.goto(BASE + F + '/juegos', { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  const b = page.locator('main h1 ~ div button').nth(i)
  const label = (await b.textContent()).trim().slice(0, 24)
  await b.click()
  await page.waitForTimeout(500)
  await axe(page, `juegos: ${label}`)
  if (i === 0) {
    const tabs = await page.evaluate(() => {
      const tl = document.querySelector('[role="tablist"]')
      if (!tl) return null
      const t = [...tl.querySelectorAll('[role="tab"]')]
      return { count: t.length, controls: t.filter((x) => x.hasAttribute('aria-controls')).length, tabindexMinus: t.filter((x) => x.getAttribute('tabindex') === '-1').length, panels: document.querySelectorAll('[role="tabpanel"]').length }
    })
    facts.push({ state: 'juegos tablist semantics', tabs })
  }
}
facts.push({ state: 'juegos overview buttons', games })
flush()

// 5. Dinero: expand a person
await page.goto(BASE + F + '/dinero', { waitUntil: 'networkidle' })
await page.waitForTimeout(700)
await page.locator('button[aria-expanded="false"]').first().click().catch(() => undefined)
await page.waitForTimeout(400)
await axe(page, 'dinero: person expanded')

// 6. Stats, Mas sheets
await page.goto(BASE + F + '/mas', { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
const masButtons = await page.evaluate(() => [...document.querySelectorAll('main button, main a')].map((b) => (b.getAttribute('aria-label') ?? b.textContent).trim().slice(0, 40)))
facts.push({ state: 'mas controls', masButtons })

// 7. Wizard steps
await page.goto(BASE + '/organizer/nuevo/_', { waitUntil: 'networkidle' })
await page.waitForTimeout(700)
const nameInput = page.locator('input').first()
await nameInput.fill('Copa de prueba')
for (let step = 2; step <= 4; step++) {
  const next = page.getByRole('button', { name: /siguiente|continuar|crear/i }).last()
  if (!(await next.count())) break
  await next.click().catch(() => undefined)
  await page.waitForTimeout(700)
  await axe(page, `wizard step ${step}`)
}
flush()

// 8. Admin sheets
await page.goto(BASE + F + '/admin/jugadores', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
await page.getByRole('button', { name: /agregar/i }).first().click().catch(() => undefined)
await page.waitForTimeout(500)
facts.push({ state: 'admin add player sheet', dialogs: await dialogInfo(page), active: await active(page) })
await axe(page, 'admin jugadores: add sheet')
await page.keyboard.press('Escape')

await page.goto(BASE + F + '/admin/calcutta', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
await axe(page, 'admin calcutta (live lot)')

await browser.close()
console.log(JSON.stringify(facts, null, 1))
