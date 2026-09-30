import { chromium } from 'playwright-core'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
await page.goto('http://127.0.0.1:4173/t/_/full12-live/stats', { waitUntil: 'networkidle' })
await page.waitForTimeout(900)
const chart = await page.evaluate(() => { const s = document.querySelector('.recharts-wrapper svg, svg.recharts-surface'); return s ? { role: s.getAttribute('role'), label: s.getAttribute('aria-label'), title: s.querySelector('title')?.textContent ?? null, desc: s.querySelector('desc')?.textContent ?? null, tabindex: s.getAttribute('tabindex'), lines: s.querySelectorAll('.recharts-line').length } : null })
const bars = await page.evaluate(() => [...document.querySelectorAll('[title^="Hoyo"]')].slice(0, 3).map(b => ({ title: b.getAttribute('title'), text: b.textContent.trim(), role: b.getAttribute('role') })))
const snap = null
const find = (n, out = []) => { if (!n) return out; if (/Carrera|carrera|race/i.test(n.name ?? '') || n.role === 'application' || n.role === 'img' || n.role === 'figure') out.push({ role: n.role, name: (n.name ?? '').slice(0, 80) }); for (const c of n.children ?? []) find(c, out); return out }
console.log(JSON.stringify({ chart, bars, axHits: find(snap).slice(0, 10) }, null, 1))
await browser.close()
