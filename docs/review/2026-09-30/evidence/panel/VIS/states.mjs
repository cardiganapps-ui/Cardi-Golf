import { chromium } from 'playwright-core'
import { EXE, BASE, DEV } from './lib.mjs'
const SH = '/home/user/Cardi-Golf/docs/review/2026-09-30/shots'
const browser = await chromium.launch({ executablePath: EXE })
async function ctx() { return browser.newContext({ ...DEV['15pro'], locale: 'es-MX', timezoneId: 'America/Mazatlan', colorScheme: 'light', reducedMotion: 'reduce' }) }
const report = []
// 1) Skeleton while a lazy screen loads: delay the Games chunk
{
  const c = await ctx(); const p = await c.newPage()
  await p.goto(BASE + '/t/_/full12-live', { waitUntil: 'networkidle' }); await p.evaluate(() => document.fonts.ready)
  await c.route(/\/assets\/(GamesScreen|MoneyScreen|StatsScreen)[^/]*\.js$/, async (r) => { await new Promise((ok) => setTimeout(ok, 4000)); await r.continue() })
  await p.getByRole('link', { name: 'Juegos' }).click()
  await p.waitForTimeout(700)
  await p.screenshot({ path: `${SH}/t_juegos-full12-live-15pro-light-vis-skeleton.png` })
  report.push('skeleton: ' + (await p.evaluate(() => document.querySelector('[role=status]')?.outerHTML.slice(0, 200))))
  await c.close()
}
// 2) Real tournament route with the API blocked: error state
{
  const c = await ctx(); const p = await c.newPage()
  await c.route('**/rest/v1/**', (r) => r.abort('failed'))
  await c.route('**/auth/v1/**', (r) => r.abort('failed'))
  await p.goto(BASE + '/t/ensayo', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(9500)
  await p.screenshot({ path: `${SH}/t_ensayo-ensayo-15pro-light-vis-api-down.png` })
  report.push('api-down text: ' + (await p.evaluate(() => document.body.innerText.slice(0, 300).replace(/\n/g, ' | '))))
  await c.close()
}
// 3) 404
{
  const c = await ctx(); const p = await c.newPage()
  await p.goto(BASE + '/esto-no-existe', { waitUntil: 'networkidle' }); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(400)
  await p.screenshot({ path: `${SH}/notfound-none-15pro-light-vis.png` })
  report.push('404 text: ' + (await p.evaluate(() => document.body.innerText.slice(0, 200).replace(/\n/g, ' | '))))
  await c.close()
}
// 4) Offline on a fixture
{
  const c = await ctx(); const p = await c.newPage()
  await p.goto(BASE + '/t/_/full12-live', { waitUntil: 'networkidle' }); await p.evaluate(() => document.fonts.ready)
  await c.setOffline(true); await p.evaluate(() => window.dispatchEvent(new Event('offline'))); await p.waitForTimeout(800)
  await p.screenshot({ path: `${SH}/t_live-full12-live-15pro-light-vis-offline.png` })
  report.push('offline text: ' + (await p.evaluate(() => document.body.innerText.slice(0, 200).replace(/\n/g, ' | '))))
  await c.close()
}
// 5) Boot failure: main bundle blocked
{
  const c = await ctx(); const p = await c.newPage()
  await c.route(/\/assets\/index-[^/]*\.js$/, (r) => r.abort('failed'))
  await p.goto(BASE + '/t/_/full12-live', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(3000)
  await p.screenshot({ path: `${SH}/t_live-full12-live-15pro-light-vis-bootfail.png` })
  report.push('bootfail text: ' + (await p.evaluate(() => document.body.innerText.slice(0, 200).replace(/\n/g, ' | '))))
  await c.close()
}
console.log(report.join('\n'))
await browser.close()
