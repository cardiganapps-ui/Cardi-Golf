import { chromium } from 'playwright-core'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await b.newContext({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
const p = await ctx.newPage()
await p.goto('http://127.0.0.1:4173/p/_/yo', { waitUntil: 'domcontentloaded' })
await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(800)
console.log(await p.evaluate(() => {
  const out = []
  for (const el of document.querySelectorAll('*')) {
    if ([...el.childNodes].some(n => n.nodeType === 3 && n.textContent.includes('Rey del Birdie'))) {
      const cs = getComputedStyle(el)
      out.push({ tag: el.tagName, cls: el.className, sw: el.scrollWidth, cw: el.clientWidth, ox: cs.overflowX, to: cs.textOverflow, ws: cs.whiteSpace, disp: cs.display, text: el.textContent.slice(0, 60) })
      let a = el.parentElement; for (let i = 0; i < 3 && a; i++, a = a.parentElement) { const c = getComputedStyle(a); out.push({ up: i, tag: a.tagName, cls: a.className, sw: a.scrollWidth, cw: a.clientWidth, ox: c.overflowX, to: c.textOverflow, ws: c.whiteSpace }) }
    }
  }
  // Also check select elements: text width vs box
  const sel = [...document.querySelectorAll('select')].map(s => ({ w: s.clientWidth, sw: s.scrollWidth }))
  return JSON.stringify({ out, sel }, null, 1)
}))
// the ronda select
await p.goto('http://127.0.0.1:4173/ronda/_', { waitUntil: 'domcontentloaded' })
await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(1200)
console.log(await p.evaluate(() => JSON.stringify([...document.querySelectorAll('select')].map(s => { const cs = getComputedStyle(s); const c = document.createElement('canvas').getContext('2d'); c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`; const txt = s.options[s.selectedIndex]?.text ?? ''; return { txt, textW: Math.round(c.measureText(txt).width), box: s.clientWidth, padL: cs.paddingLeft, padR: cs.paddingRight } }))))
await b.close()
