// Dump Chromium's accessibility tree (what a screen reader gets) for key screens, flattened to lines.
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'
const DIR = path.dirname(new URL(import.meta.url).pathname)
const BASE = 'http://127.0.0.1:4173'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'es-MX' })
const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page)

async function dump(label, file, rootSelector) {
  await cdp.send('Accessibility.enable')
  const { nodes } = await cdp.send('Accessibility.getFullAXTree')
  const byId = new Map(nodes.map((n) => [n.nodeId, n]))
  const lines = []
  const walk = (id, depth) => {
    const n = byId.get(id)
    if (!n) return
    const role = n.role?.value
    const name = n.name?.value ?? ''
    const ignored = n.ignored
    const props = (n.properties ?? []).filter((p) => ['checked', 'pressed', 'expanded', 'selected', 'level', 'live', 'disabled', 'modal', 'focusable'].includes(p.name)).map((p) => `${p.name}=${p.value?.value}`)
    const val = n.value?.value
    if (!ignored && !['none', 'generic', 'InlineTextBox', 'LineBreak'].includes(role)) {
      lines.push(`${'  '.repeat(depth)}${role}${name ? ` "${name.slice(0, 110)}"` : ''}${val != null ? ` value=${val}` : ''}${props.length ? ` [${props.join(' ')}]` : ''}`)
    } else if (!ignored && role === 'generic' && name) {
      lines.push(`${'  '.repeat(depth)}generic(named) "${name.slice(0, 80)}"`)
    }
    for (const c of n.childIds ?? []) walk(c, ignored || ['none', 'generic'].includes(role) ? depth : depth + 1)
  }
  walk(nodes[0].nodeId, 0)
  fs.writeFileSync(path.join(DIR, file), `# ${label}\n` + lines.join('\n'))
  console.log(`${label}: ${lines.length} lines -> ${file}`)
}

const F = '/t/_/full12-live'
await page.goto(BASE + F + '/tarjeta', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
await dump('Tarjeta hole view (full12-live)', 'ax-tarjeta-hole.txt')
await page.getByRole('button', { name: /^Ver tarjeta$/ }).click()
await page.waitForTimeout(500)
await dump('Tarjeta grid view (full12-live)', 'ax-tarjeta-grid.txt')
await page.goto(BASE + F, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
await dump('En vivo (full12-live)', 'ax-live.txt')
await page.locator('button[aria-label*=".º"]').first().click()
await page.waitForTimeout(600)
await dump('Player sheet (full12-live)', 'ax-playersheet.txt')
await page.goto(BASE + F + '/dinero', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
await dump('Dinero (full12-live)', 'ax-dinero.txt')
await page.goto(BASE + F + '/juegos', { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
await dump('Juegos overview', 'ax-juegos.txt')
await page.goto(BASE + '/t/_/stroke8', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
await dump('En vivo stroke8 (to-par)', 'ax-live-stroke8.txt')
await page.goto(BASE + F + '/admin/handicaps', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
await dump('Admin handicaps', 'ax-admin-handicaps.txt')
await page.goto(BASE + F + '/admin/calcutta', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
await dump('Admin calcutta', 'ax-admin-calcutta.txt')
await page.goto(BASE + F + '/tv', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
await dump('TV', 'ax-tv.txt')
await browser.close()
