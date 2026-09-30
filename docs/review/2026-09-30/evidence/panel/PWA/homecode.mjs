import { launch } from './lib.mjs'
const b = await launch()
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' })
const input = page.locator('#join-code')
await input.waitFor({ timeout: 20000 })
for (const pasted of ['https://golf.cardigan.mx/t/ensayo', 'ensayo', 'golf.cardigan.mx/t/nachos-bachelor']) {
  await input.fill('')
  await input.fill(pasted)
  const v = await input.inputValue()
  const enabled = await page.getByRole('button', { name: 'Entrar' }).last().isEnabled()
  console.log(JSON.stringify(pasted), '→ field shows', JSON.stringify(v), '| Entrar enabled:', enabled, enabled ? `(would open /t/${v})` : '')
}
await b.close()
