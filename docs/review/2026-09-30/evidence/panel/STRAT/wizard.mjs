import { chromium } from 'playwright-core'
const BASE = 'http://127.0.0.1:4173'
const OUT = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/panel/evidence/STRAT/walk'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, locale: 'es-MX' })
const page = await ctx.newPage()
let taps = 0
const tap = async (loc) => { await loc.click(); taps++; await page.waitForTimeout(300) }
const count = () => page.evaluate(() => {
  const vis = (el) => { const s = getComputedStyle(el); const b = el.getBoundingClientRect(); return s.visibility !== 'hidden' && s.display !== 'none' && b.width > 0 && b.height > 0 }
  return { controls: [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=switch], [role=radio], [role=checkbox]')].filter(vis).length, height: document.documentElement.scrollHeight, text: document.body.innerText }
})
await page.goto(BASE + '/organizer/nuevo/_', { waitUntil: 'networkidle' })
await page.fill('input >> nth=0', 'Copa de Otoño')
taps++
await tap(page.getByRole('button', { name: 'Siguiente' }))
let c = await count(); console.log('STEP2 controls', c.controls, 'height', c.height); console.log(c.text.replace(/\n+/g, ' / ').slice(0, 3000))
await page.screenshot({ path: `${OUT}/wizard-step2-full.png`, fullPage: true })
await tap(page.getByRole('button', { name: 'Siguiente' }))
c = await count(); console.log('\nSTEP3 controls', c.controls, 'height', c.height); console.log(c.text.replace(/\n+/g, ' / ').slice(0, 2000))
await page.screenshot({ path: `${OUT}/wizard-step3-full.png`, fullPage: true })
const create = page.getByRole('button', { name: /Crear/ })
console.log('create enabled?', await create.isEnabled())
if (await create.isEnabled()) { await tap(create); c = await count(); console.log('\nDONE controls', c.controls); console.log(c.text.replace(/\n+/g, ' / ').slice(0, 1500)); await page.screenshot({ path: `${OUT}/wizard-done.png` }) }
console.log('taps (incl typing name as 1)', taps)
await browser.close()
