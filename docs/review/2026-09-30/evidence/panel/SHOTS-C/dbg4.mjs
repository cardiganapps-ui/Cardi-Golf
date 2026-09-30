import { chromium } from 'playwright-core'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
const p = await ctx.newPage()
for (const n of ['nuevo', 'yo']) {
  await p.goto('http://127.0.0.1:4173/p/_/' + n, { waitUntil: 'domcontentloaded' })
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(700)
  console.log(n, await p.evaluate(() => JSON.stringify([...document.querySelectorAll('button, a.btn')].filter(e => /Editar perfil|Amigos|Copiar enlace|Compartir/.test(e.textContent)).map(e => { const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); return `${e.textContent.trim()}: ${cs.fontSize} ${Math.round(r.width)}x${Math.round(r.height)} cls=${e.className.replace(/_([A-Za-z]+)_[a-z0-9]+_\d+/g, '$1')}` }))))
}
// Home legal link sizes and wizard review
await b.close()
