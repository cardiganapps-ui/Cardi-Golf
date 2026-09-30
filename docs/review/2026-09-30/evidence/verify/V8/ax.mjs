// V8 / A11Y-01 + A11Y-02: Chromium accessibility tree (CDP) for the Tarjeta hole view and the player sheet.
import { chromium } from 'playwright-core'
import { writeFileSync } from 'node:fs'
const B = 'http://127.0.0.1:4208'
const OUT = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/verify/evidence/V8'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page)

async function tree() {
  const { nodes } = await cdp.send('Accessibility.getFullAXTree')
  const byId = new Map(nodes.map((n) => [n.nodeId, n]))
  const val = (n, k) => n[k]?.value ?? ''
  const prop = (n, k) => n.properties?.find((p) => p.name === k)?.value?.value
  const lines = []
  const walk = (n, depth) => {
    if (!n) return
    const role = val(n, 'role'), name = val(n, 'name')
    const skip = n.ignored || role === 'none' || role === 'generic' && !name || role === 'InlineTextBox'
    if (!skip) lines.push(`${'  '.repeat(depth)}${role} "${name}"${prop(n, 'pressed') !== undefined ? ` pressed=${prop(n, 'pressed')}` : ''}${prop(n, 'live') ? ` live=${prop(n, 'live')}` : ''}${prop(n, 'modal') ? ' modal' : ''}${prop(n, 'level') ? ` level=${prop(n, 'level')}` : ''}`)
    for (const c of n.childIds || []) walk(byId.get(c), skip ? depth : depth + 1)
  }
  walk(nodes[0], 0)
  return { nodes, lines, val, prop, byId }
}

// ---- A11Y-01: Tarjeta hole view
await page.goto(`${B}/t/_/full12-live/tarjeta`, { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
let T = await tree()
writeFileSync(`${OUT}/ax-tarjeta.txt`, T.lines.join('\n'))
const buttons = T.nodes.filter((n) => !n.ignored && T.val(n, 'role') === 'button').map((n) => T.val(n, 'name'))
const counts = {}
for (const n of buttons) counts[n] = (counts[n] || 0) + 1
const dup = Object.entries(counts).filter(([, c]) => c > 1)
console.log(`A11Y-01 buttons on the Tarjeta: ${buttons.length}; duplicated names: ${JSON.stringify(dup)}`)
const groups = T.nodes.filter((n) => !n.ignored && T.val(n, 'role') === 'group').map((n) => T.val(n, 'name'))
console.log(`A11Y-01 groups: ${JSON.stringify(groups)}`)
const headings = T.nodes.filter((n) => !n.ignored && T.val(n, 'role') === 'heading').map((n) => `${T.val(n, 'name')} (h${T.prop(n, 'level')})`)
console.log(`A11Y-01 headings on the page: ${JSON.stringify(headings)}`)
const lives = T.nodes.filter((n) => !n.ignored && T.prop(n, 'live')).map((n) => `${T.val(n, 'role')} "${T.val(n, 'name')}" live=${T.prop(n, 'live')}`)
console.log(`A11Y-01 live regions: ${lives.length} e.g. ${JSON.stringify(lives.slice(0, 5))}`)
// Does any ancestor of the first 'Golpes: más' button carry a player's name?
const firstPlus = T.nodes.find((n) => !n.ignored && T.val(n, 'role') === 'button' && T.val(n, 'name') === 'Golpes: más')
const parentOf = new Map(); for (const n of T.nodes) for (const c of n.childIds || []) parentOf.set(c, n.nodeId)
const chain = []
for (let id = firstPlus?.nodeId; id; id = parentOf.get(id)) { const n = T.byId.get(id); if (!n.ignored) chain.push(`${T.val(n, 'role')} "${T.val(n, 'name').slice(0, 40)}"`) }
console.log(`A11Y-01 ancestors of the first 'Golpes: más': ${chain.join(' < ')}`)
// Around the hole number
const idx = T.lines.findIndex((l) => /StaticText "Par \d/.test(l))
console.log(`A11Y-01 hole header in the tree:\n${T.lines.slice(Math.max(0, idx - 4), idx + 2).join('\n')}`)
// After a tap: what does the live region say?
await page.getByRole('button', { name: 'Golpes: más' }).nth(1).click()
await page.waitForTimeout(300)
const secondRow = await page.getByRole('group', { name: 'Golpes' }).nth(1).innerText()
console.log(`A11Y-01 after tapping the 2nd player's 'Golpes: más', its live value reads: "${secondRow.replace(/\s+/g, ' ')}"`)

// ---- A11Y-02: player sheet from the leaderboard
await page.goto(`${B}/t/_/full12-live`, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
await page.locator('main button[aria-label]').filter({ hasText: /\d/ }).first().click()
await page.getByRole('dialog').first().waitFor()
await page.waitForTimeout(400)
T = await tree()
const dlg = T.nodes.filter((n) => !n.ignored && T.val(n, 'role') === 'dialog')
for (const d of dlg) {
  const inside = []
  const walk = (id) => { const n = T.byId.get(id); if (!n) return; if (!n.ignored && ['button', 'link', 'heading'].includes(T.val(n, 'role'))) inside.push(`${T.val(n, 'role')}:${T.val(n, 'name')}`); for (const c of n.childIds || []) walk(c) }
  walk(d.nodeId)
  console.log(`A11Y-02 dialog name="${T.val(d, 'name')}" modal=${T.prop(d, 'modal')} controls=${inside.length}; close-like: ${JSON.stringify(inside.filter((x) => /cerrar|close|volver|atr[aá]s/i.test(x)))}; headings: ${JSON.stringify(inside.filter((x) => x.startsWith('heading')))}; first 8: ${JSON.stringify(inside.slice(0, 8))}`)
}
const backdropRole = await page.evaluate(() => { const d = document.querySelector('[role=dialog]'); const bd = d?.parentElement; return { role: bd?.getAttribute('role'), tabindex: bd?.getAttribute('tabindex'), handleHasHandlers: !!d?.firstElementChild && Object.keys(d.firstElementChild).filter((k) => k.startsWith('__reactProps')).map((k) => Object.keys(d.firstElementChild[k])).flat() } })
console.log(`A11Y-02 backdrop: ${JSON.stringify(backdropRole)}`)
const sheetBox = await page.getByRole('dialog').first().boundingBox()
console.log(`A11Y-02 sheet box: top=${Math.round(sheetBox.y)} height=${Math.round(sheetBox.height)} of 852 -> backdrop strip above = ${Math.round(sheetBox.y)} px`)
await page.screenshot({ path: `${OUT}/playersheet.png` })
// Escape closes it (keyboard) — sanity
await page.keyboard.press('Escape'); await page.waitForTimeout(300)
console.log(`A11Y-02 after Escape: dialogs=${await page.getByRole('dialog').count()}`)
// Count Sheet uses without a title in the source is done separately.
await b.close()
