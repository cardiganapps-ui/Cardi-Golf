import { chromium } from 'playwright-core'
import fs from 'node:fs'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page)
async function dump(file) {
  const { nodes } = await cdp.send('Accessibility.getFullAXTree')
  const byId = new Map(nodes.map((n) => [n.nodeId, n]))
  const lines = []
  const walk = (id, d) => { const n = byId.get(id); if (!n) return; const role = n.role?.value; const name = n.name?.value ?? ''; const skip = n.ignored || ['none', 'generic', 'InlineTextBox', 'LineBreak'].includes(role)
    const props = (n.properties ?? []).filter((p) => ['checked', 'pressed', 'expanded', 'selected'].includes(p.name)).map((p) => `${p.name}=${p.value?.value}`)
    if (!skip) lines.push(`${'  '.repeat(d)}${role}${name ? ` "${name.slice(0, 100)}"` : ''}${props.length ? ` [${props.join(' ')}]` : ''}`)
    for (const c of n.childIds ?? []) walk(c, skip ? d : d + 1) }
  walk(nodes[0].nodeId, 0)
  fs.writeFileSync(file, lines.join('\n'))
}
await page.goto('http://127.0.0.1:4173/t/_/full12-finished/dinero', { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
await page.getByRole('radio', { name: 'Liquidación' }).click()
await page.waitForTimeout(500)
await dump('ax-dinero-liquidacion.txt')
await page.goto('http://127.0.0.1:4173/t/_/full12-live/juegos', { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
await page.locator('main h1 ~ div button').nth(3).click()
await page.waitForTimeout(500)
await dump('ax-juegos-vibora.txt')
await page.screenshot({ path: '/home/user/Cardi-Golf/docs/review/2026-09-30/shots/t_juegos-full12-live-15pro-light-a11y-vibora.png' })
await browser.close()
