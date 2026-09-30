// Journey: a player joins Ensayo by code (from Home) and by link, and claims with PIN.
// One anonymous sign-in per context; two contexts total. Never a wrong PIN except one, immediately followed by the right one.
import { launch, phone, BASE, EV, Journey, saveJson, shot, sleep, log, measureTargets } from './lib.mjs'

const b = await launch()
const out = {}

// ---- A. Join by code, cold device ----
{
  const ctx = await phone(b)
  const p = await ctx.newPage()
  const t0 = performance.now()
  await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await p.locator('#join-code').waitFor({ timeout: 30000 })
  const coldHome = performance.now() - t0
  const j = new Journey('join-by-code', p)
  j.appMs += coldHome
  j.steps.push({ kind: 'load', label: 'open / (cold)', ms: Math.round(coldHome) })
  await shot(p, '_-ensayo-15pro-light-ux-home-cold.png')
  await j.type(p.locator('#join-code'), 'ENSAYO', 'type code')
  await j.tap(p.getByRole('button', { name: 'Entrar', exact: true }), 'Entrar (code)', () => p.getByText('Elige tu nombre').waitFor({ timeout: 30000 }))
  await sleep(300)
  const facesTargets = await measureTargets(p)
  saveJson('targets-entrar-faces-ensayo', facesTargets)
  await shot(p, 't_ensayo-ensayo-15pro-light-ux-entrar-faces.png')
  const nico = p.getByRole('button', { name: /Nico/ })
  const nicoBox = await nico.first().boundingBox()
  await j.tap(nico, 'face: Nico', () => p.getByText('Entrar como Nico').waitFor())
  await sleep(300)
  const pinTargets = await measureTargets(p)
  saveJson('targets-entrar-pin-ensayo', pinTargets)
  const focused = await p.evaluate(() => document.activeElement?.getAttribute('inputmode'))
  await shot(p, 't_ensayo-ensayo-15pro-light-ux-entrar-pin.png')
  // PIN is autofocused; typing needs no extra tap.
  await j.type(p.locator('input[type="password"]'), '1234', 'PIN (auto-submits)', { focus: false })
  const tIn = performance.now()
  await p.locator('nav').getByText('En vivo').first().waitFor({ timeout: 30000 })
  j.appMs += performance.now() - tIn
  j.steps.push({ kind: 'wait', label: 'PIN → En vivo', ms: Math.round(performance.now() - tIn) })
  await sleep(1500)
  await shot(p, 't_ensayo-ensayo-15pro-light-ux-live-after-join.png')
  const s = j.summary()
  s.nicoFaceBox = nicoBox
  s.pinAutofocusInputmode = focused
  out.byCode = s
  log('join', `by code: taps=${s.taps} keys=${s.keystrokes} appMs=${s.appMs}`)
  await ctx.storageState({ path: `${EV}/.ensayo-state.json` })

  // ---- B. Wrong PIN UX (one wrong, then right), via "Cambiar de jugador" in Más ----
  await p.locator('nav').getByText('Más').first().tap()
  await sleep(800)
  await shot(p, 't_ensayo_mas-ensayo-15pro-light-ux.png')
  const moreText = await p.evaluate(() => document.body.innerText)
  const switchBtn = p.getByRole('button', { name: /Cambiar de jugador|No soy yo/ })
  out.moreHasSwitch = await switchBtn.count()
  if (out.moreHasSwitch) {
    const j2 = new Journey('switch-player', p)
    await j2.tap(switchBtn, 'Cambiar de jugador', async () => {
      await Promise.race([p.getByText('Elige tu nombre').waitFor({ timeout: 20000 }), p.getByRole('dialog').waitFor({ timeout: 20000 })])
    })
    const confirmAsked = await p.getByRole('dialog').isVisible().catch(() => false)
    if (confirmAsked) {
      await shot(p, 't_ensayo_mas-ensayo-15pro-light-ux-switch-confirm.png')
      await j2.tap(p.getByRole('dialog').getByRole('button').last(), 'confirm switch', () => p.getByText('Elige tu nombre').waitFor({ timeout: 20000 }))
    }
    await j2.tap(p.getByRole('button', { name: /Nico/ }), 'face: Nico', () => p.getByText('Entrar como Nico').waitFor())
    await j2.type(p.locator('input[type="password"]'), '1233', 'wrong PIN', { focus: false })
    await p.locator('.error').waitFor({ timeout: 20000 })
    const err = await p.locator('.error').textContent()
    const pinVal = await p.locator('input[type="password"]').inputValue()
    const stillFocused = await p.evaluate(() => document.activeElement?.getAttribute('type'))
    await shot(p, 't_ensayo-ensayo-15pro-light-ux-entrar-wrongpin.png')
    await j2.type(p.locator('input[type="password"]'), '1234', 'right PIN', { focus: stillFocused !== 'password' })
    await p.locator('nav').getByText('En vivo').first().waitFor({ timeout: 30000 })
    const s2 = j2.summary()
    s2.confirmAsked = confirmAsked
    s2.wrongPinError = err
    s2.pinClearedAfterWrong = pinVal === ''
    s2.focusKeptAfterWrong = stillFocused === 'password'
    out.switch = s2
    log('join', `switch: taps=${s2.taps} confirm=${confirmAsked} err="${err}" cleared=${s2.pinClearedAfterWrong} focusKept=${s2.focusKeptAfterWrong}`)
  } else {
    out.moreText = moreText.slice(0, 800)
  }
  await ctx.storageState({ path: `${EV}/.ensayo-state.json` })
  await ctx.close()
}

// ---- C. Join by link, cold device (second and last anonymous sign-in) ----
{
  const ctx = await phone(b)
  const p = await ctx.newPage()
  const j = new Journey('join-by-link', p)
  const t0 = performance.now()
  await p.goto(`${BASE}/t/ensayo`, { waitUntil: 'domcontentloaded' })
  await p.getByText('Elige tu nombre').waitFor({ timeout: 30000 })
  const ms = performance.now() - t0
  j.appMs += ms
  j.steps.push({ kind: 'load', label: 'open /t/ensayo (cold, anon sign-in + lookup)', ms: Math.round(ms) })
  await j.tap(p.getByRole('button', { name: /Nico/ }), 'face: Nico', () => p.getByText('Entrar como Nico').waitFor())
  await j.type(p.locator('input[type="password"]'), '1234', 'PIN (auto-submits)', { focus: false })
  const tIn = performance.now()
  await p.locator('nav').getByText('En vivo').first().waitFor({ timeout: 30000 })
  j.appMs += performance.now() - tIn
  j.steps.push({ kind: 'wait', label: 'PIN → En vivo', ms: Math.round(performance.now() - tIn) })
  const s = j.summary()
  out.byLink = s
  log('join', `by link: taps=${s.taps} keys=${s.keystrokes} appMs=${s.appMs}`)
  // Install guide: is it offered on first run (§9.1)?
  out.installGuideOnLive = await p.getByText(/pantalla de inicio/i).count()
  await ctx.close()
}
saveJson('join', out)
await b.close()
