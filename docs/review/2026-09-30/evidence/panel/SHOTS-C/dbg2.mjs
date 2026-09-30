import { chromium } from 'playwright-core'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
const p = await ctx.newPage()
for (const path of ['/privacidad', '/terminos', '/entrar', '/', '/esto-no-existe', '/organizer/login']) {
  await p.goto('http://127.0.0.1:4173' + path, { waitUntil: 'domcontentloaded' })
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(700)
  console.log(path, await p.evaluate(() => JSON.stringify({
    lang: document.documentElement.lang,
    mailto: [...document.querySelectorAll('a[href^="mailto:"]')].length,
    emailsInText: (document.body.innerText.match(/[\w.]+@[\w.]+/g) || []).length,
    wordmarkLink: !!document.querySelector('a [class*="wordmark" i], a[class*="brand" i], a[aria-label*="Polo"]'),
    firstLinks: [...document.querySelectorAll('a')].slice(0, 6).map(a => `${a.getAttribute('href')}:${(a.innerText || a.getAttribute('aria-label') || '').trim().slice(0, 20)}`),
    h: [...document.querySelectorAll('h1,h2,h3')].map(h => h.tagName + ':' + h.textContent.trim().slice(0, 25)).slice(0, 6),
    doorsTap: [...document.querySelectorAll('nav a')].map(a => { const r = a.getBoundingClientRect(); return `${a.innerText.trim()} ${Math.round(r.width)}x${Math.round(r.height)}` }),
  })))
}
await b.close()
