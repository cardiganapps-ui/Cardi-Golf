// Measure every interactive element's box on the main screens (phone, coarse pointer).
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'
const DIR = path.dirname(new URL(import.meta.url).pathname)
const BASE = 'http://127.0.0.1:4173'
const F = '/t/_/full12-live'
const screens = [
  [F, 'En vivo'],
  [F + '/tarjeta', 'Tarjeta hoyo'],
  [F + '/tarjeta#grid', 'Tarjeta cuadro'],
  [F + '/juegos', 'Juegos'],
  [F + '/juegos#individual', 'Juegos Individual'],
  [F + '/dinero', 'Dinero'],
  [F + '/stats', 'Stats'],
  [F + '/mas', 'Más'],
  [F + '/reglamento', 'Reglamento'],
  [F + '/admin/torneo', 'Comité Torneo'],
  [F + '/admin/jugadores', 'Comité Jugadores'],
  [F + '/admin/grupos', 'Comité Grupos'],
  [F + '/admin/handicaps', 'Comité Hándicaps'],
  [F + '/admin/scores', 'Comité Tarjetas'],
  [F + '/admin/calcutta', 'Comité Calcutta'],
  [F + '/admin/campos', 'Comité Campos'],
  ['/organizer/nuevo/_', 'Wizard 1'],
  ['/p/_/yo', 'Perfil'],
  ['/amigos/_', 'Amigos'],
  ['/ronda/_', 'Ronda rápida'],
  ['/', 'Inicio'],
  ['/entrar', 'Entrar cuenta'],
  ['/organizer/login', 'Login'],
]
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'es-MX' })
const page = await ctx.newPage()
const all = {}
for (const [route, label] of screens) {
  const [p, hash] = route.split('#')
  await page.goto(BASE + p, { waitUntil: 'networkidle' })
  await page.waitForTimeout(700)
  if (hash === 'grid') await page.getByRole('button', { name: /^Ver tarjeta$/ }).click()
  if (hash === 'individual') await page.locator('main h1 ~ div button').first().click()
  await page.waitForTimeout(300)
  const items = await page.evaluate(() => {
    const sel = 'a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=radio], [role=checkbox], [role=switch], summary, [tabindex]:not([tabindex="-1"])'
    const out = []
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || cs.display === 'none') continue
      // Inline links inside running text are exempt from 2.5.8.
      const inline = el.tagName === 'A' && cs.display === 'inline' && el.parentElement && getComputedStyle(el.parentElement).display !== 'flex'
      const name = (el.getAttribute('aria-label') ?? el.textContent ?? el.getAttribute('placeholder') ?? el.type ?? '').trim().replace(/\s+/g, ' ').slice(0, 36)
      out.push({ tag: el.tagName.toLowerCase() + (el.type && el.tagName === 'INPUT' ? `[${el.type}]` : ''), cls: String(el.className).replace(/_[a-z0-9]{5}_\d+/g, '').slice(0, 40), name, w: Math.round(r.width), h: Math.round(r.height), inline })
    }
    return out
  })
  const small = (n) => items.filter((i) => !i.inline && (i.w < n || i.h < n))
  all[label] = { route, total: items.length, under24: small(24), under44: small(44), under48: small(48) }
  console.log(`${label.padEnd(18)} total=${String(items.length).padStart(3)}  <24:${small(24).length}  <44:${small(44).length}  <48:${small(48).length}`)
}
fs.writeFileSync(path.join(DIR, 'targets.json'), JSON.stringify(all, null, 1))
await browser.close()
