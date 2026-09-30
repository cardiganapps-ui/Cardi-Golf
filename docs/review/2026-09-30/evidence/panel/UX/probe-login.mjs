import { launch, phone, BASE, sleep, shot, measureTargets } from './lib.mjs'
const b = await launch()
const ctx = await phone(b, { blockSupabase: true })
const p = await ctx.newPage()
await p.goto(`${BASE}/organizer/login`, { waitUntil: 'domcontentloaded' })
await sleep(1500)
await shot(p, 'organizer_login-none-15pro-light-ux.png')
console.log((await p.evaluate(() => document.body.innerText)).replace(/\n/g, ' | ').slice(0, 900))
const btns = await p.getByRole('button').allTextContents()
console.log('buttons', JSON.stringify(btns))
const sw = p.getByRole('button', { name: /Crear una cuenta/ })
if (await sw.count()) { await sw.first().tap(); await sleep(500); console.log('after switch:', (await p.evaluate(() => document.body.innerText)).replace(/\n/g, ' | ').slice(0, 700)); await shot(p, 'organizer_login-none-15pro-light-ux-signup.png') }
console.log('inputs', await p.locator('input').count())
await b.close()
