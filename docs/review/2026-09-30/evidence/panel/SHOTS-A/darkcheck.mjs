// Does anything respond to prefers-color-scheme: dark? Render the four main routes on
// full12-live in light and dark and compare raw pixels. Output stays in scratch.
import { chromium } from 'playwright-core'
import sharp from 'sharp'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const shoot = async (scheme, path) => {
  const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce', colorScheme: scheme, serviceWorkers: 'block' })
  const p = await ctx.newPage()
  await p.goto(`http://127.0.0.1:4173/t/_/full12-live${path}`, { waitUntil: 'domcontentloaded' })
  await p.evaluate(() => document.fonts.ready)
  await p.waitForTimeout(900)
  const info = await p.evaluate(() => ({ dark: matchMedia('(prefers-color-scheme: dark)').matches, bg: getComputedStyle(document.body).backgroundColor, ink: getComputedStyle(document.body).color }))
  const buf = await p.screenshot({ animations: 'disabled' })
  await ctx.close()
  return { buf, info }
}
for (const path of ['', '/tarjeta', '/juegos', '/dinero']) {
  const l = await shoot('light', path)
  const d = await shoot('dark', path)
  const a = await sharp(l.buf).raw().toBuffer()
  const c = await sharp(d.buf).raw().toBuffer()
  let diff = 0
  for (let i = 0; i < Math.min(a.length, c.length); i++) if (a[i] !== c[i]) diff++
  console.log(JSON.stringify({ route: path || '/', lightMedia: l.info, darkMedia: d.info, differingBytes: diff, totalBytes: a.length }))
}
await b.close()
