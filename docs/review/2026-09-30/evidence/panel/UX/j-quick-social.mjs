// Ronda rápida from a cold start, and the social surfaces (friends, versus/rivalry, crews, inbox), on fixtures.
import { launch, phone, BASE, Journey, saveJson, shot, sleep, log, measureTargets } from './lib.mjs'
const b = await launch()
const out = {}

// A. Ronda rápida: me + 3 friends + 1 guest, skins + closest, money $200, Empezar.
{
  const ctx = await phone(b, { blockSupabase: true })
  const p = await ctx.newPage()
  await p.goto(`${BASE}/ronda/_`, { waitUntil: 'networkidle' })
  await sleep(600)
  await shot(p, 'ronda_-quick-15pro-light-ux.png')
  await shot(p, 'ronda_-quick-15pro-light-ux-full.png', { fullPage: true })
  out.quickHeight = await p.evaluate(() => document.documentElement.scrollHeight)
  out.quickText = (await p.evaluate(() => document.body.innerText)).slice(0, 1500)
  const j = new Journey('ronda-rapida', p)
  const selects = p.locator('select')
  out.courseDefault = await selects.first().evaluate((s) => s.options[s.selectedIndex]?.text)
  // choose the second course (a native picker: tap + choose = 2 taps)
  const opts = await selects.first().evaluate((s) => [...s.options].map((o) => o.value))
  if (opts.length > 1) {
    await j.tap(selects.first(), 'course select (opens OS picker)')
    await selects.first().selectOption(opts[1])
    j.taps++
    j.steps.push({ kind: 'tap', label: 'choose course in OS picker' })
  }
  await sleep(400)
  const checks = p.locator('input[type="checkbox"]')
  const nFriends = await checks.count()
  out.friendsListed = nFriends
  for (let i = 0; i < Math.min(3, nFriends); i++) {
    const label = p.locator('label').filter({ has: checks.nth(i) })
    await j.tap((await label.count()) ? label.first() : checks.nth(i), `friend ${i + 1}`)
  }
  await j.type(p.getByRole('textbox', { name: /invitado|Nombre del invitado/i }).or(p.getByPlaceholder(/invitado/i)).first(), 'Toño', 'guest name')
  await j.tap(p.getByRole('button', { name: /Agregar/ }).first(), 'Agregar invitado')
  const idx = p.getByRole('textbox', { name: /Toño/ }).or(p.locator('input[inputmode="decimal"]').last())
  await j.type(idx.first(), '18.4', 'guest index')
  const pick = p.locator('[aria-pressed]')
  out.gameChips = await pick.allTextContents()
  const closest = pick.filter({ hasText: /cerca/i })
  if (await closest.count()) await j.tap(closest.first(), 'Más cerca chip')
  await j.tap(p.locator('label.toggle').first(), 'money on')
  j.scroll('scroll to Empezar')
  const start = p.getByRole('button', { name: /Empezar/ })
  out.startEnabled = await start.isEnabled()
  if (out.startEnabled) await j.tap(start, 'Empezar', () => sleep(300))
  out.quick = j.summary()
  log('quick', `taps=${out.quick.taps} keys=${out.quick.keystrokes} height=${out.quickHeight} friends=${nFriends} courseDefault=${out.courseDefault} startEnabled=${out.startEnabled}`)
  await ctx.close()
}

// B. Social surfaces: screenshots + text + small targets
const pages = [
  ['amigos/_', 'amigos_-social-15pro-light-ux.png'],
  ['avisos/_', 'avisos_-social-15pro-light-ux.png'],
  ['c/_', 'c_-crew-15pro-light-ux.png'],
  ['p/_/yo', 'p_yo-profile-15pro-light-ux.png'],
]
out.social = {}
for (const [path, file] of pages) {
  const ctx = await phone(b, { blockSupabase: true })
  const p = await ctx.newPage()
  await p.goto(`${BASE}/${path}`, { waitUntil: 'networkidle' })
  await sleep(700)
  await shot(p, file)
  const t = await measureTargets(p)
  out.social[path] = { height: await p.evaluate(() => document.documentElement.scrollHeight), text: (await p.evaluate(() => document.body.innerText)).slice(0, 900), small: t.filter((x) => x.small).map((x) => `${x.name} ${x.w}x${x.h}`).slice(0, 20) }
  await ctx.close()
}
saveJson('quick-social', out)
log('quick', JSON.stringify(Object.fromEntries(Object.entries(out.social).map(([k, v]) => [k, v.small.length]))))
await b.close()
