// Last two steps (Calcutta payouts, money summary): list font size, row count visible, overflow.
import { chromium } from 'playwright-core'
const OUT = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V12'
const [W, H] = (process.env.VP || '1920x1080').split('x').map(Number)
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await browser.newContext({ viewport: { width: W, height: H }, locale: 'es-MX', reducedMotion: 'reduce' })
const page = await ctx.newPage()
await page.goto('http://127.0.0.1:4212/t/_/full12-finished/ceremonia', { waitUntil: 'networkidle' })
await page.evaluate(() => document.fonts.ready)
await page.getByRole('button', { name: /Empezar/ }).click(); await page.waitForTimeout(500)
for (let i = 0; i < 30; i++) {
  const title = await page.evaluate(() => document.querySelector('[class*="_stepTitle_"]')?.textContent)
  const prog = await page.evaluate(() => document.querySelector('[class*="_progress_"]')?.textContent)
  const rev = page.getByRole('button', { name: /Revelar/ })
  if (await rev.count()) { await rev.click(); await page.waitForTimeout(700) }
  const r = await page.evaluate(() => {
    const list = document.querySelector('[class*="_list_"]'); const body = document.querySelector('[class*="_body_"]')
    if (!list) return null
    const rows = [...list.querySelectorAll('[class*="_listRow_"]')]; const bb = body.getBoundingClientRect()
    return { fs: parseFloat(getComputedStyle(list).fontSize), rows: rows.length, fullyVisible: rows.filter((x) => { const b = x.getBoundingClientRect(); return b.top >= bb.top - 0.5 && b.bottom <= bb.bottom + 0.5 }).length, bodyScrollable: body.scrollHeight > body.clientHeight + 1, listW: Math.round(list.getBoundingClientRect().width) }
  })
  if (r) { console.log(`${prog} «${title}»: list ${r.fs}px, ${r.rows} rows, ${r.fullyVisible} fully visible, body scrolls: ${r.bodyScrollable}, list width ${r.listW}px of ${W}`); await page.screenshot({ path: `${OUT}/v06-list-${W}x${H}-${prog.replace(/\W+/g, '_')}.png` }) }
  if (/12 \/ 12/.test(prog || '')) break
  await page.getByRole('button', { name: /Siguiente/ }).click(); await page.waitForTimeout(500)
}
await browser.close()
