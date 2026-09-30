import { open, BASE, settle } from './lib.mjs'
const SH = '/home/user/Cardi-Golf/docs/review/2026-09-30/shots'
for (const fx of ['large60', 'full12-finished']) {
  const { browser, page } = await open('15pro')
  await page.goto(BASE + `/t/_/${fx}/stats`, { waitUntil: 'networkidle' }); await settle(page, 1500)
  const chart = page.locator('.recharts-wrapper').first()
  if (await chart.count()) {
    await chart.scrollIntoViewIfNeeded(); await page.waitForTimeout(3000)
    const box = await chart.boundingBox()
    const sect = await page.evaluate(() => { const w = document.querySelector('.recharts-wrapper'); let s = w.parentElement; for (let i = 0; i < 3 && s && s.tagName !== 'SECTION'; i++) s = s.parentElement; const b = (s || w).getBoundingClientRect(); return { top: b.top + scrollY, h: b.height } })
    await page.screenshot({ path: `${SH}/t_stats-${fx}-15pro-light-vis-race.png`, fullPage: true, clip: { x: 0, y: Math.max(0, sect.top - 60), width: 393, height: Math.min(1200, sect.h + 120) } })
    const legend = await page.evaluate(() => { const l = document.querySelectorAll('.recharts-legend-item, [class*=legend] li, [class*=legend] span'); return l.length })
    console.log(fx, 'chart box', JSON.stringify(box), 'legend items', legend, 'lines', await page.locator('.recharts-line').count())
  } else console.log(fx, 'no chart')
  await browser.close()
}
