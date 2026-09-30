// For every tappable element on core screens: does forcing :active change anything visible?
import { launch, ctx, BASE } from './lib.mjs'
import { writeFileSync } from 'node:fs'
const SCREENS = [
  ['En vivo', '/t/_/full12-live'],
  ['Tarjeta', '/t/_/full12-live/tarjeta'],
  ['Juegos', '/t/_/full12-live/juegos'],
  ['Dinero', '/t/_/full12-live/dinero'],
  ['Más', '/t/_/full12-live/mas'],
  ['Mi Polo (fixture profile)', '/p/_/yo'],
]
const PROPS = ['background-color', 'color', 'transform', 'filter', 'opacity', 'box-shadow', 'border-top-color', 'outline-style', 'text-decoration-line']
const b = await launch()
const out = {}
for (const [name, path] of SCREENS) {
  const c = await ctx(b, '15pro')
  const p = await c.newPage()
  await p.goto(BASE + path, { waitUntil: 'networkidle' })
  await p.waitForTimeout(1000)
  const n = await p.evaluate(() => {
    const els = [...document.querySelectorAll('button, a[href], [role="button"], summary, label.toggle, input[type="checkbox"]')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.disabled })
    els.forEach((e, i) => e.setAttribute('data-mot-i', String(i)))
    return els.length
  })
  const cdp = await c.newCDPSession(p)
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable')
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 })
  const rows = []
  for (let i = 0; i < n; i++) {
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: `[data-mot-i="${i}"]` })
    if (!nodeId) continue
    const read = () => p.evaluate(([i, props]) => { const e = document.querySelector(`[data-mot-i="${i}"]`); const cs = getComputedStyle(e); return props.map((k) => cs.getPropertyValue(k)) }, [i, PROPS])
    const rest = await read()
    await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['active'] })
    await p.waitForTimeout(170) // let 150 ms transitions finish
    const act = await read()
    await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] })
    const diff = PROPS.filter((k, j) => rest[j] !== act[j])
    const label = await p.evaluate((i) => { const e = document.querySelector(`[data-mot-i="${i}"]`); return (e.tagName.toLowerCase() + '.' + (e.className?.toString?.().split(' ')[0] || '')).slice(0, 40) + ' «' + (e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30) + '»' }, i)
    rows.push({ label, diff })
  }
  const none = rows.filter((r) => r.diff.length === 0)
  out[name] = { total: rows.length, noPressedState: none.length, examples: none.slice(0, 40).map((r) => r.label) }
  console.log(name, 'tappables', rows.length, 'with NO :active change', none.length)
  // group the no-change ones by class
  const byCls = {}
  for (const r of none) { const k = r.label.split(' «')[0]; byCls[k] = (byCls[k] ?? 0) + 1 }
  console.log('   ', JSON.stringify(byCls))
  await c.close()
}
writeFileSync('pressed.json', JSON.stringify(out, null, 1))
await b.close()
