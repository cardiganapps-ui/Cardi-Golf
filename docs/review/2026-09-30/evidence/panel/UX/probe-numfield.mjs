import { launch, phone, BASE, sleep } from './lib.mjs'
const b = await launch()
const ctx = await phone(b, { blockSupabase: true })
const p = await ctx.newPage()
await p.goto(`${BASE}/t/_/full12-live/admin/jugadores`, { waitUntil: 'networkidle' })
await p.locator('[class*="rowBtn"]').nth(2).tap()
const dlg = p.getByRole('dialog')
await dlg.getByRole('tab', { name: /Estimar/ }).tap()
await sleep(300)
const est = dlg.locator('input:not([type=file])')
const state = async (tag) => {
  const s = await p.evaluate(() => {
    const ins = [...document.querySelectorAll('[role=dialog] input:not([type=file])')]
    const a = document.activeElement
    return { active: ins.indexOf(a), vals: ins.slice(2, 14).map((i) => i.value) }
  })
  console.log(tag, JSON.stringify(s))
}
await state('start')
for (const [i, v] of [[2, '88'], [6, '95'], [10, '104']]) {
  await est.nth(i).tap()
  await state(`tapped ${i}`)
  await est.nth(i).selectText()
  for (const ch of v) {
    await p.keyboard.type(ch, { delay: 80 })
    await state(`  typed ${ch} into ${i}`)
  }
}
await b.close()
