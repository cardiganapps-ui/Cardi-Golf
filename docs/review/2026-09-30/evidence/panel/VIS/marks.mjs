import { open, BASE, settle } from './lib.mjs'
for (const dev of ['se', '15pro']) {
  const { browser, page } = await open(dev)
  await page.goto(BASE + '/t/_/full12-live', { waitUntil: 'networkidle' }); await settle(page)
  await page.locator('button[class*="leaderRow"]').first().click(); await page.waitForTimeout(800)
  const r = await page.evaluate(() => {
    const marks = [...document.querySelectorAll('[class*="_mark_"]')].filter(m => m.querySelector('svg circle, svg rect'))
    const boxes = marks.map(m => m.getBoundingClientRect())
    let touching = 0, overlapping = 0, pairs = 0, minGap = 99
    // compare horizontally adjacent marks in the same row
    const rows = {}
    boxes.forEach(b => { const k = Math.round(b.top); (rows[k] ||= []).push(b) })
    for (const bs of Object.values(rows)) { bs.sort((a, b) => a.left - b.left); for (let i = 1; i < bs.length; i++) { const gap = bs[i].left - bs[i - 1].right; if (gap < 30) { pairs++; minGap = Math.min(minGap, gap); if (gap < 0.5) touching++; if (gap < -0.5) overlapping++ } } }
    const cell = document.querySelector('table[class*="grid"] td:nth-child(2)')?.getBoundingClientRect().width
    return { marks: marks.length, markW: boxes[0]?.width, cellW: cell, adjacentPairs: pairs, touchingOrOverlapping: touching, overlapping, minGap: Math.round(minGap * 10) / 10 }
  })
  console.log(dev, JSON.stringify(r))
  await page.screenshot({ path: `/home/user/Cardi-Golf/docs/review/2026-09-30/shots/t_live-full12-live-${dev}-light-vis-sheet-marks.png` })
  await browser.close()
}
