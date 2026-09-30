import { chromium } from 'playwright-core'
import { EXE, BASE, DEV } from './lib.mjs'
const SH = '/home/user/Cardi-Golf/docs/review/2026-09-30/shots'
const browser = await chromium.launch({ executablePath: EXE })
const c = await browser.newContext({ ...DEV['15pro'], locale: 'es-MX', reducedMotion: 'reduce', serviceWorkers: 'block' })
const p = await c.newPage()
await p.goto(BASE + '/t/_/full12-live', { waitUntil: 'networkidle' }); await p.evaluate(() => document.fonts.ready)
let held = 0
await c.route(/\/assets\/(StatsScreen|AdminTournament|Admin)[^/]*\.js$/, async (r) => { held++; await new Promise((ok) => setTimeout(ok, 5000)); await r.continue() })
await p.getByRole('link', { name: 'Más' }).click(); await p.waitForTimeout(300); await p.getByRole('link', { name: /Estad/ }).first().click()
await p.waitForTimeout(1500)
await p.screenshot({ path: `${SH}/t_stats-full12-live-15pro-light-vis-skeleton.png` })
console.log('held', held, await p.evaluate(() => [...document.querySelectorAll('[role=status]')].map(e => e.getAttribute('aria-label') + ':' + e.children.length).join(',')))
await browser.close()
