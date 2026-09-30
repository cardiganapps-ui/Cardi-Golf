import { open, BASE, settle } from './lib.mjs'
const routes = process.argv.slice(2)
const { browser, page } = await open('15pro')
const detect = () => {
  const out = []
  const rows = [...document.querySelectorAll('[class*="_rowLine_"]')].filter(r => getComputedStyle(r).display === 'flex' && r.offsetParent)
  for (const r of rows) {
    const kids = [...r.children].filter(k => k.offsetWidth > 0)
    if (kids.length < 2) continue
    const rb = r.getBoundingClientRect(); const last = kids[kids.length - 1].getBoundingClientRect()
    const gap = Math.round(rb.right - parseFloat(getComputedStyle(r).paddingRight) - last.right)
    if (gap > 4) out.push({ gap, text: r.textContent.trim().replace(/\s+/g, ' ').slice(0, 60), cls: r.className.split(' ')[0] })
  }
  return { total: rows.length, ragged: out }
}
for (const route of routes) {
  const [path, click] = route.split('#')
  await page.goto(BASE + path, { waitUntil: 'networkidle' })
  await settle(page, 500)
  if (click) { for (const c of click.split('>')) { await page.getByRole('button', { name: new RegExp(c) }).first().click().catch(() => page.getByText(new RegExp(c)).first().click()); await settle(page, 400) } }
  const r = await page.evaluate(detect)
  console.log(`${route}: ${r.ragged.length}/${r.total} rows ragged`)
  const bycls = {}
  for (const x of r.ragged) { (bycls[x.cls] ||= []).push(x) }
  for (const [c, xs] of Object.entries(bycls)) console.log(`   ${c} ×${xs.length}  e.g. gap ${xs[0].gap}px "${xs[0].text}"`)
}
await browser.close()
