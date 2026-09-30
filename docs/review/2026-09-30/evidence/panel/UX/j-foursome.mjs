// Journey: enter one hole for a foursome on the Tarjeta (fixture full12-live, Día 2, grupo 3, hole 12).
// Three scenarios, each on a fresh page. Counts taps, app response time, thumb zones; optional 4x CPU throttle.
import { launch, phone, BASE, Journey, saveJson, shot, sleep, log } from './lib.mjs'

const throttle = Number(process.argv[2] || 1)
const b = await launch()
const results = []

// Scenario scores for hole 12 (par 4). Order of the group on screen: Camilo, Matías, Fabián, Iván J.
const scenarios = {
  bestCase_allPar: [
    [4, 2],
    [4, 2],
    [4, 2],
    [4, 2],
  ],
  typical_bogeyGolf: [
    [5, 2],
    [5, 2],
    [4, 2],
    [6, 3],
  ],
  badHole_twoThreePutts: [
    [5, 2],
    [6, 3],
    [4, 1],
    [7, 3],
  ],
}

for (const [name, target] of Object.entries(scenarios)) {
  for (let rep = 0; rep < 3; rep++) {
    const ctx = await phone(b, { blockSupabase: true })
    const p = await ctx.newPage()
    if (throttle > 1) {
      const cdp = await ctx.newCDPSession(p)
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle })
    }
    await p.goto(`${BASE}/t/_/full12-live/tarjeta`, { waitUntil: 'networkidle' })
    await p.locator('text=Guardar hoyo').waitFor()
    const j = new Journey(`foursome:${name}`, p)
    const rows = p.locator('[class*="player_"]').filter({ has: p.locator('[role="group"]') })
    const n = await rows.count()
    if (n !== 4) throw new Error('expected 4 player rows, got ' + n)
    for (let i = 0; i < 4; i++) {
      const row = rows.nth(i)
      const [strokes, putts] = target[i]
      const sGroup = row.locator('[role="group"]').nth(0)
      const pGroup = row.locator('[role="group"]').nth(1)
      const valOf = async (g) => Number(await g.locator('[aria-live]').textContent())
      let s = await valOf(sGroup)
      while (s !== strokes) {
        const btn = sGroup.locator('button').nth(s < strokes ? 1 : 0)
        const want = s < strokes ? s + 1 : s - 1
        await j.tap(btn, `row${i + 1} strokes ${s < strokes ? '+' : '-'}`, () => sGroup.locator('[aria-live]', { hasText: String(want) }).waitFor())
        s = want
      }
      let q = await valOf(pGroup)
      while (q !== putts) {
        const btn = pGroup.locator('button').nth(q < putts ? 1 : 0)
        const want = q < putts ? q + 1 : q - 1
        await j.tap(btn, `row${i + 1} putts ${q < putts ? '+' : '-'}`, () => pGroup.locator('[aria-live]', { hasText: String(want) }).waitFor())
        q = want
      }
    }
    const holeNum = p.locator('[class*="holeNum"]')
    // Save; the snake tiebreak sheet may appear.
    let sheet = false
    await j.tap(p.getByRole('button', { name: 'Guardar hoyo' }), 'Guardar hoyo', async () => {
      await Promise.race([holeNum.filter({ hasText: '13' }).waitFor(), p.getByText('¿Quién embocó al último?').waitFor()])
    })
    if (await p.getByText('¿Quién embocó al último?').isVisible().catch(() => false)) {
      sheet = true
      if (rep === 0) await shot(p, `t_tarjeta-full12-live-15pro-light-ux-tiebreak.png`)
      await j.tap(p.getByRole('dialog').getByRole('button', { name: 'Iván J.' }), 'tiebreak: Iván J.', () => holeNum.filter({ hasText: '13' }).waitFor())
    }
    // Toast after save: where is it and how big is its action?
    const toastBox = await p.locator('[aria-live="polite"] >> text=/guardado/i').first().boundingBox().catch(() => null)
    const actionBtn = p.locator('[class*="toastAction"]').first()
    const actionBox = await actionBtn.boundingBox().catch(() => null)
    const actionText = await actionBtn.textContent().catch(() => null)
    const saveBox = await p.getByRole('button', { name: /Guardar hoyo/ }).first().boundingBox().catch(() => null)
    if (rep === 0 && name === 'typical_bogeyGolf') await shot(p, `t_tarjeta-full12-live-15pro-light-ux-after-save.png`)
    const s = j.summary()
    s.rep = rep
    s.throttle = throttle
    s.tiebreakSheet = sheet
    s.toast = { toastBox, actionBox, actionText, saveBox }
    results.push(s)
    log('foursome', `${name} rep${rep} x${throttle}: taps=${s.taps} appMs=${s.appMs} save->next=${s.steps.find((x) => x.label === 'Guardar hoyo')?.ms}ms tiebreak=${sheet} toastAction=${actionText} ${JSON.stringify(actionBox)} save=${JSON.stringify(saveBox)}`)
    await ctx.close()
  }
}
saveJson(`foursome-x${throttle}`, results)
await b.close()
