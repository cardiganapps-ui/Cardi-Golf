import { launch, phone, BASE, shot, sleep } from './lib.mjs'
const b = await launch()
const ctx = await phone(b, { blockSupabase: true })
const p = await ctx.newPage()
await p.goto(`${BASE}/t/_/full12-live/admin/jugadores`, { waitUntil: 'networkidle' })
await p.locator('[class*="rowBtn"]').nth(2).tap()
const dlg = p.getByRole('dialog')
await dlg.getByRole('tab', { name: /Estimar/ }).tap()
await sleep(300)
const read = async (label) => {
  const v = await dlg.evaluate((el) => {
    const secs = [...el.querySelectorAll('strong')].map((s) => s.textContent)
    const figs = [...el.querySelectorAll('[class*="fig"]')].map((f) => f.className + '=' + f.textContent)
    const prev = [...el.querySelectorAll('*')].find((n) => /Juega con|juega con/i.test(n.textContent || '') && n.children.length === 0)
    return { figs, prev: prev?.textContent }
  })
  console.log(label, JSON.stringify(v))
}
await read('before')
const est = dlg.locator('input:not([type=file])')
for (const [i, v] of [[2, '88'], [6, '95'], [10, '104'], [4, '71.2'], [5, '128']]) {
  await est.nth(i).tap(); await est.nth(i).fill(''); await est.nth(i).pressSequentially(v)
}
await p.keyboard.press('Tab')
await sleep(400)
await read('after')
const el = dlg.locator('[class*="figLg"]').first()
await el.scrollIntoViewIfNeeded()
await sleep(200)
console.log(await shot(p, 't_admin_jugadores-full12-live-15pro-light-ux-estimate-preview.png'))
await b.close()
