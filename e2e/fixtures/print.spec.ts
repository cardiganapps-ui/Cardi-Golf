/**
 * VIS-25: the printed fallback card, the one players add up by hand when the app is down. It had one Total column
 * and no Ida or Vuelta, each card filled half its landscape page, the names wrapped to three or four lines, and the
 * putts rows were grey. Now each group is one landscape page at full width: holes in play order with each nine's
 * subtotal and the total, score rows 12 mm or taller, the handicap and pair on one line under the name, stroke dots
 * large enough for the sun, ink on white only.
 */
import { expect, open, test } from './base'

// A Letter page in landscape at 96 px per inch, less the @page margins (10 mm a side).
const MM = 96 / 25.4
const PAGE = { width: Math.round(11 * 96 - 20 * MM), height: Math.round(8.5 * 96 - 20 * MM) }

test('one group to a landscape page, with Ida, Vuelta and Total, rows of 12 mm, ink on white (VIS-25)', async ({ page }) => {
  await page.setViewportSize(PAGE)
  await open(page, '/t/_/full12-live/imprimir')
  await page.emulateMedia({ media: 'print' })
  const cards = page.locator('section[class*="_card_"]')
  const n = await cards.count()
  expect(n, 'one card per group').toBeGreaterThanOrEqual(3)
  const report = await cards.evaluateAll((els, mm) =>
    els.map((el) => {
      const r = el.getBoundingClientRect()
      const heads = Array.from(el.querySelectorAll('thead tr:first-child th')).map((th) => th.textContent.trim())
      const scoreRows = Array.from(el.querySelectorAll('tr[class*="_player_"]')).map((tr) => tr.getBoundingClientRect().height / mm)
      const names = Array.from(el.querySelectorAll('tr[class*="_player_"] td:first-child')).map((td) => {
        const sub = td.querySelector('[class*="_playerSub_"]')!
        const lh = parseFloat(getComputedStyle(sub).lineHeight) || parseFloat(getComputedStyle(sub).fontSize) * 1.3
        return { subLines: Math.round(sub.getBoundingClientRect().height / lh), name: td.querySelector('strong')!.getBoundingClientRect().height }
      })
      const dots = Array.from(el.querySelectorAll('[class*="_dots_"]')).map((d) => parseFloat(getComputedStyle(d).fontSize))
      const fills = Array.from(el.querySelectorAll('*'))
        .map((x) => getComputedStyle(x).backgroundColor)
        .filter((c) => c !== 'rgba(0, 0, 0, 0)' && c !== 'rgb(255, 255, 255)')
      const greys = Array.from(el.querySelectorAll('td, th, span, strong'))
        .map((x) => getComputedStyle(x).color)
        .filter((c) => !/^rgb\(27, 33, 29\)$/.test(c))
      return { width: r.width, height: r.height, heads, scoreRows, names, dots, fills, greys }
    }),
  MM)
  for (const c of report) {
    expect(c.heads).toEqual(expect.arrayContaining(['Ida', 'Vuelta', 'Total']))
    expect(c.heads.indexOf('Ida')).toBeLessThan(c.heads.indexOf('Total'))
    expect(c.width, 'the card is the page wide').toBeGreaterThanOrEqual(PAGE.width * 0.97)
    expect(c.height, 'the card fits its page').toBeLessThanOrEqual(PAGE.height)
    expect(c.height, 'the card fills most of its page').toBeGreaterThanOrEqual(PAGE.height * 0.6)
    for (const h of c.scoreRows) expect(h, 'a score row in mm').toBeGreaterThanOrEqual(12)
    for (const x of c.names) expect(x.subLines, 'handicap and pair on one line').toBe(1)
    for (const d of c.dots) expect(d, 'the stroke dots in px').toBeGreaterThanOrEqual(16)
    expect(c.fills, 'fills other than white').toEqual([])
    expect(c.greys, 'text in anything but ink').toEqual([])
  }
  // One group to a sheet: the PDF has as many pages as groups.
  await page.emulateMedia({ media: 'screen' })
  const pdf = await page.pdf({ format: 'Letter', landscape: true, printBackground: true })
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length
  expect(pages).toBe(n)
})
