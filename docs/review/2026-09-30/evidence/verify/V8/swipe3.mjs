import { chromium } from 'playwright-core'
const B = 'http://127.0.0.1:4208'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
async function run(label, css) {
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  await page.goto(`${B}/t/_/full12-live`, { waitUntil: 'networkidle' })
  await page.getByRole('link', { name: 'Tarjeta' }).click(); await page.waitForURL('**/tarjeta'); await page.waitForTimeout(500)
  if (css) await page.addStyleTag({ content: css })
  const cdp = await ctx.newCDPSession(page)
  const swipe = async (x0, x1, y = 400) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] })
    for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + ((x1 - x0) * i) / 5, y }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await page.waitForTimeout(800)
  }
  const state = async () => {
    const p = page.url().replace(B, '')
    if (!p.endsWith('/tarjeta')) return `url=${p}`
    const txt = (await page.locator('main').innerText()).split('\n').filter(Boolean)
    const hole = txt[txt.findIndex((l) => /^Par \d/.test(l)) - 1]
    const v = (await page.getByRole('group', { name: 'Golpes' }).first().innerText()).replace(/\s+/g, ' ')
    return `url=${p} hole=${hole} firstStrokes=${v}`
  }
  const plus = page.getByRole('button', { name: 'Golpes: más' }).first()
  await plus.click(); await plus.click()
  const s0 = await state()
  await swipe(330, 90)           // next hole (leftward)
  const s1 = await state()
  await swipe(150, 390)          // previous hole (rightward, starting mid-screen)
  const s2 = await state()
  console.log(`[${label}] dirty: ${s0} -> swipe next: ${s1} -> swipe previous (from x=150): ${s2}`)
  await ctx.close()
}
await run('as built', null)
await run('with overscroll-behavior-x:none injected', 'html,body{overscroll-behavior-x:none}')
await b.close()
