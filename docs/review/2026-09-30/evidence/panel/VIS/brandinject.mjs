import { chromium } from 'playwright-core'
import fs from 'node:fs'
import { EXE, BASE, DEV } from './lib.mjs'
const E = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/panel/evidence/VIS'
export async function injected(device, { logo = null, accent = null, route, out, full = false, wait = 900, click = null }) {
  const browser = await chromium.launch({ executablePath: EXE })
  const ctx = await browser.newContext({ ...DEV[device], locale: 'es-MX', timezoneId: 'America/Mazatlan', colorScheme: 'light', reducedMotion: 'reduce' })
  const logoUrl = logo ? 'data:image/png;base64,' + fs.readFileSync(`${E}/${logo}-256.b64`, 'utf8') : null
  await ctx.addInitScript(({ logoUrl, accent }) => {
    const orig = window.structuredClone
    window.structuredClone = (v, o) => { const c = orig(v, o); try { if (c && c.tournament && c.tournament.id && Array.isArray(c.players)) { if (logoUrl) c.tournament.logoUrl = logoUrl; if (accent) c.tournament.accentColor = accent } } catch {} return c }
  }, { logoUrl, accent })
  const page = await ctx.newPage()
  await page.goto(BASE + route, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(wait)
  if (click) { for (const c of click) { await page.getByRole('button', { name: new RegExp(c) }).first().click().catch(() => {}); await page.waitForTimeout(500) } }
  await page.screenshot({ path: out, fullPage: full })
  await browser.close()
}
if (process.argv[2]) {
  const [device, route, out, logo, accent] = process.argv.slice(2)
  await injected(device, { route, out, logo: logo === '-' ? null : logo, accent: accent === '-' ? null : accent })
  console.log('ok', out)
}
