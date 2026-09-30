// UX-01 scope: the only text field in a Tarjeta sheet (Comité correction on a signed card, autoFocus) — does it keep what is typed?
import { launch, phone, BASE, sleep, logTo, focused, sheetValues } from './lib.mjs'
const log = logTo('ux01-typing.log')
const b = await launch()
const { ctx, page } = await phone(b)
await page.goto(`${BASE}/t/_/full12-finished/tarjeta`, { waitUntil: 'domcontentloaded' })
await sleep(1500)
const hole = await page.locator('[class*=holeNum]').first().textContent()
await page.getByRole('button', { name: /Golpes: más/ }).first().tap()
await sleep(150)
await page.locator('[class*=saveBar] button').first().tap()
await page.locator('[role=dialog]').last().waitFor({ timeout: 5000 })
await sleep(250)
const opened = await focused(page)
for (const ch of 'Error de captura') { await page.keyboard.type(ch); await sleep(150) }
log(JSON.stringify({ name: 'H tarjeta signed-card reason (autofocus)', hole, openedWithFocus: opened, values: await sheetValues(page), focus: await focused(page) }))
await ctx.close()
await b.close()
