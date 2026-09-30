// Real Entrar screen on /t/ensayo (read-only: no PIN is typed). One context, one anonymous sign-in.
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'
const DIR = path.dirname(new URL(import.meta.url).pathname)
const AXE = path.join(DIR, 'node_modules/axe-core/axe.min.js')
const BASE = 'http://127.0.0.1:4173'
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']
const STATE = path.join(DIR, 'ensayo-state.json')
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-MX', ...(fs.existsSync(STATE) ? { storageState: STATE } : {}) })
const page = await ctx.newPage()
const out = []
async function axe(label) {
  if (!(await page.evaluate(() => typeof window.axe !== 'undefined'))) await page.addScriptTag({ path: AXE })
  const r = await page.evaluate(async (runOnly) => {
    const r = await window.axe.run(document, { runOnly, resultTypes: ['violations', 'incomplete'] })
    return { violations: r.violations.map((v) => ({ id: v.id, impact: v.impact, count: v.nodes.length, nodes: v.nodes.slice(0, 5).map((n) => ({ target: n.target.join(' '), html: n.html.slice(0, 160), summary: (n.failureSummary || '').slice(0, 240) })) })), incomplete: r.incomplete.map((v) => ({ id: v.id, count: v.nodes.length })) }
  }, TAGS)
  out.push({ label, url: page.url(), ...r })
  console.log(`[axe] ${label}: ${r.violations.map((v) => `${v.id}(${v.impact[0]}${v.count})`).join(' ') || '-'}  incomplete: ${r.incomplete.map((v) => `${v.id}(${v.count})`).join(' ')}`)
}
await page.goto(BASE + '/t/ensayo', { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(2500)
await ctx.storageState({ path: STATE })
const shot = '/home/user/Cardi-Golf/docs/review/2026-09-30/shots/'
await page.screenshot({ path: shot + 't_ensayo-ensayo-15pro-light-a11y-entrar.png' })
await axe('/t/ensayo Entrar (faces)')
const faces = await page.evaluate(() => [...document.querySelectorAll('main button')].slice(0, 20).map((b) => ({ name: (b.getAttribute('aria-label') ?? b.textContent).trim(), w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height) })))
console.log('faces', JSON.stringify(faces))
const headings = await page.evaluate(() => [...document.querySelectorAll('h1,h2,h3')].map((h) => `${h.tagName} ${h.textContent.trim()}`))
console.log('headings', JSON.stringify(headings))
// Open the PIN step for the first face (no digits typed).
const face = page.locator('main button').first()
await face.click()
await page.waitForTimeout(800)
const act = await page.evaluate(() => ({ tag: document.activeElement?.tagName, type: document.activeElement?.getAttribute('type'), label: document.activeElement?.closest('label')?.textContent?.trim().slice(0, 40), describedby: document.activeElement?.getAttribute('aria-describedby'), invalid: document.activeElement?.getAttribute('aria-invalid') }))
console.log('pin step focus', JSON.stringify(act))
await page.screenshot({ path: shot + 't_ensayo-ensayo-15pro-light-a11y-pin.png' })
await axe('/t/ensayo PIN step (no digits typed)')
// Back out without typing anything.
await page.getByRole('button', { name: /no soy yo/i }).click().catch(() => undefined)
await page.waitForTimeout(500)
const afterBack = await page.evaluate(() => ({ tag: document.activeElement?.tagName, text: document.activeElement?.textContent?.trim().slice(0, 40) }))
console.log('focus after "No soy yo"', JSON.stringify(afterBack))
fs.writeFileSync(path.join(DIR, 'axe-ensayo.json'), JSON.stringify(out, null, 1))
await browser.close()
