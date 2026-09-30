import { chromium } from 'playwright-core'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce', colorScheme: 'light' })
const p = await ctx.newPage()
const log = []
p.on('console', (m) => log.push(`console.${m.type()}: ${m.text().slice(0, 200)}`))
p.on('pageerror', (e) => log.push(`pageerror: ${e.message}`))
p.on('response', (r) => { const u = new URL(r.url()); if (!u.host.includes('127.0.0.1')) log.push(`resp ${r.status()} ${r.request().method()} ${u.host}${u.pathname}`) })
p.on('requestfailed', (r) => log.push(`reqfailed ${r.url().split('?')[0]} ${r.failure()?.errorText}`))
for (const path of ['/t/_/full12-live/admin/torneo', '/t/_/full12-live/admin/campos', '/t/_/full12-live/admin/historial', '/t/_/full12-live/admin/jugadores']) {
  log.push('== ' + path)
  await p.goto('http://127.0.0.1:4173' + path, { waitUntil: 'domcontentloaded' })
  await p.evaluate(() => document.fonts.ready)
  await p.waitForTimeout(1500)
  const info = await p.evaluate(() => ({ sh: document.documentElement.scrollHeight, sw: document.documentElement.scrollWidth, iw: innerWidth, text: document.body.innerText.slice(0, 300) }))
  log.push(JSON.stringify(info))
  await p.screenshot({ path: `probe/${path.split('/').pop()}.png` })
}
console.log(log.join('\n'))
await b.close()
