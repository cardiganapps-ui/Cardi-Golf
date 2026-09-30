// V8 / A11Y-04: computed colours of the Ceremonia footer buttons and their WCAG contrast.
import { chromium } from 'playwright-core'
const B = 'http://127.0.0.1:4208'
const OUT = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V8'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const measure = (page) => page.evaluate(() => {
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r, g, b, a } }
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
  const effBg = (el) => { for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0) return { c, from: e === el ? 'self' : e.className.toString().slice(0, 24) || e.tagName } } return { c: { r: 255, g: 255, b: 255, a: 1 }, from: 'canvas' } }
  const hex = ({ r, g, b }) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
  return [...document.querySelectorAll('footer button')].map((btn) => {
    const cs = getComputedStyle(btn)
    const fg = parse(cs.color), bg = effBg(btn), stage = effBg(btn.parentElement)
    const border = parse(cs.borderTopColor)
    return { text: btn.textContent.trim(), cls: btn.className, disabled: btn.disabled, fg: hex(fg), bg: hex(bg.c), bgFrom: bg.from, textContrast: +ratio(fg, bg.c).toFixed(2), stageBg: hex(stage.c), buttonVsStage: +ratio(bg.c, stage.c).toFixed(2), border: hex(border), fontSize: cs.fontSize, fontWeight: cs.fontWeight }
  })
})
for (const [w, h, tag] of [[393, 852, '15pro'], [1920, 1080, 'tv']]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: w < 1000, hasTouch: w < 1000 })
  const page = await ctx.newPage()
  await page.goto(`${B}/t/_/full12-live/ceremonia`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  console.log(`[${tag}] start:`, JSON.stringify(await measure(page)))
  await page.getByRole('button', { name: /comenzar|empezar/i }).first().click().catch(() => {})
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: /revelar/i }).first().click().catch(() => {})
  await page.waitForTimeout(1500)
  const m = await measure(page)
  console.log(`[${tag}] after a reveal:`, JSON.stringify(m))
  await page.getByRole('button', { name: 'Siguiente' }).focus()
  await page.waitForTimeout(200)
  console.log(`[${tag}] focused:`, JSON.stringify((await measure(page)).find((x) => x.text === 'Siguiente')))
  await page.screenshot({ path: `${OUT}/ceremonia-${tag}-after-reveal.png` })
  await ctx.close()
}
await b.close()
