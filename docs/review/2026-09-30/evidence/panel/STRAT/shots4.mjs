import { chromium } from 'playwright-core'
const BASE = 'http://127.0.0.1:4173'
const SHOTS = '/home/user/Cardi-Golf/docs/review/2026-09-30/shots'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, locale: 'es-MX' })
const page = await ctx.newPage()
const go = async (p) => { await page.goto(BASE + p, { waitUntil: 'networkidle' }); await page.waitForTimeout(900) }
const out = []
const shot = async (n) => { await page.screenshot({ path: `${SHOTS}/${n}` }); out.push(n) }
await go('/'); await shot('home-none-15pro-light-strat-logged-out.png')
await go('/t/_/minimal4-setup'); await shot('t-minimal4-setup-15pro-light-strat-pre-event.png')
await go('/t/_/minimal4-setup/admin'); await shot('t_admin_torneo-minimal4-setup-15pro-light-strat-landing.png')
await go('/organizer/nuevo/_'); await page.fill('input >> nth=0', 'Copa de Otoño')
await page.getByRole('button', { name: 'Siguiente' }).click(); await page.waitForTimeout(400)
await page.getByRole('button', { name: 'Siguiente' }).click(); await page.waitForTimeout(400)
await page.getByRole('button', { name: /Crear torneo/ }).click(); await page.waitForTimeout(900)
await shot('organizer_nuevo-demo-15pro-light-strat-created.png')
// Ceremony end on the finished first tournament
await go('/t/_/full12-finished/ceremonia')
await page.getByRole('button', { name: /Empezar/ }).click(); await page.waitForTimeout(500)
for (let i = 0; i < 40; i++) { const nx = page.getByRole('button', { name: /^Siguiente$/ }); if (!(await nx.isEnabled().catch(() => false))) break; await nx.click(); await page.waitForTimeout(350) }
await page.waitForTimeout(1200)
console.log((await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' / ').slice(0, 400))
await shot('t_ceremonia-full12-finished-15pro-light-strat-end.png')
console.log(out.join('\n'))
await browser.close()
