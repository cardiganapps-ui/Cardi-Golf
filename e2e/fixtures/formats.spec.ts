/**
 * Format parity (STRAT-03). Match play, stroke play and team play are equal
 * choices in the wizard, but the rest of the product spoke Stableford: the
 * feed crowned a leader the board did not have and wrote «+4 pts», the
 * Reglamento described a Day-2 points cut in a one-day match, the team race
 * chart was empty with «?» names, the share card said «pts».
 *
 * Every screen people read or screenshot, on every non-Stableford fixture,
 * the Ceremonia walked step by step included: no «pts», no «Putter», no
 * player shown as «?», and, where the event counts strokes, no «puntos» (the
 * print page's «Los puntos (•)» are stroke dots; match play's points are
 * match points and stay).
 */
import { t } from '../../src/i18n/es-MX'
import { expect, open, test } from './base'

const FORMATS = [
  { name: 'stroke8', strokes: true, team: false },
  { name: 'team8', strokes: true, team: true },
  { name: 'scramble8', strokes: true, team: true },
  { name: 'match8', strokes: false, team: false },
  { name: 'bracket8', strokes: false, team: false },
]
const PAGES = ['', '/tarjeta', '/juegos', '/stats', '/reglamento', '/imprimir', '/tv']
/** The fixtures' team names, as a team player's sheet reads them («2.º con Las Palmas»). */
const WITH_TEAM = /con (Los Compadres|Las Palmas|Los del Fondo|Tres Marías)\b/
/** A figure against par as the boards write it. */
const TO_PAR = /^(E|[+−]\d+)$/

/** The lines that break the rule, so a failure names them. */
function offending(text: string, strokes: boolean): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l === '?' || /\bpts\b/.test(l) || /Putter/.test(l) || /Carrera de puntos/.test(l) || (strokes && /\bpuntos?\b/i.test(l) && !l.includes('(•)')))
}

for (const f of FORMATS) {
  test(`${f.name}: every screen speaks the format's own figure`, async ({ page }) => {
    for (const path of PAGES) {
      await open(page, `/t/_/${f.name}${path}`)
      if (path === '/juegos') {
        // The overview, then the main event's own board (the first game).
        expect(offending(await page.locator('main').first().innerText(), f.strokes), `${f.name} Juegos overview`).toEqual([])
        await page.locator('main button[type="button"]').first().click()
        await page.waitForTimeout(300)
      }
      const text = await page.locator('body').innerText()
      expect(offending(text, f.strokes), `${f.name}${path || ' (En vivo)'}`).toEqual([])
    }
  })

  test(`${f.name}: the player sheet and the share cards`, async ({ page }) => {
    await open(page, `/t/_/${f.name}`)
    await page.evaluate(() => {
      const w = window as unknown as { __cards: string[] }
      w.__cards = []
      new MutationObserver(() => {
        document.querySelectorAll<HTMLElement>('[data-share-card]').forEach((el) => w.__cards.push(el.innerText))
      }).observe(document.body, { childList: true, subtree: true })
    })
    // The leaderboard card.
    await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: t.share.leaderboard }).first().click()])
    // The first row's sheet, and that player's card.
    await page.locator('main button[aria-label]').filter({ hasText: /\S/ }).first().click()
    const sheet = page.getByRole('dialog')
    await expect(sheet).toBeVisible()
    const sheetText = await sheet.innerText()
    expect(offending(sheetText, f.strokes), 'player sheet').toEqual([])
    // A team's row opens its first player: his sheet keeps the team's place.
    if (f.team) expect(sheetText).toMatch(WITH_TEAM)
    await Promise.all([page.waitForEvent('download'), sheet.getByRole('button', { name: t.share.round }).click()])
    const cards = await page.evaluate(() => (window as unknown as { __cards: string[] }).__cards)
    expect(cards.length).toBeGreaterThanOrEqual(2)
    for (const c of cards) expect(offending(c, f.strokes), 'share card').toEqual([])
    if (f.team) expect(cards.at(-1)).toMatch(WITH_TEAM)
    // A hole of his card explained: in the figure the event counts.
    const hole = sheet.locator(`button[aria-label^="${t.player.hole} "]`).first()
    const n = Number((await hole.getAttribute('aria-label'))!.split(' ').at(-1))
    await hole.click()
    const why = page.getByRole('dialog', { name: t.player.whyHole(n) })
    await expect(why).toBeVisible()
    const whyText = await why.innerText()
    expect(offending(whyText, f.strokes), 'hole explanation').toEqual([])
    if (f.strokes) expect(whyText).toMatch(/golpes|neto/)
  })
}

for (const f of FORMATS) {
  test(`${f.name}: the Ceremonia, every step revealed`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 1920, height: 1080 })
    await open(page, `/t/_/${f.name}/ceremonia`)
    const seen: string[] = []
    for (let i = 0; i < 80; i++) {
      await page.keyboard.press('ArrowRight')
      await page.waitForTimeout(250)
      const text = await page.locator('main').first().innerText()
      seen.push(text)
      if (text.includes(t.ceremony.done)) break
    }
    expect(seen.at(-1)).toContain(t.ceremony.done)
    expect(offending(seen.join('\n'), f.strokes), `${f.name} Ceremonia`).toEqual([])
    // The champion's line names no trophy the tournament did not set.
    expect(seen.join('\n')).not.toMatch(/Se lleva/)
  })
}

test('match play: a decided match reads the same for both sides, and says who won it', async ({ page }) => {
  await open(page, '/t/_/match8')
  const rows = page.locator('main button[aria-label]')
  // Each row's day, read off its third column from the end (day, thru, total).
  const days = await rows.evaluateAll((els) =>
    els.map((e) => ({ label: e.getAttribute('aria-label') ?? '', color: e.children.length >= 3 ? getComputedStyle(e.children[e.children.length - 3]!).color : '' })),
  )
  const won = days.filter((d) => /ganó \d+&\d+/.test(d.label)).map((d) => d.color)
  const lost = days.filter((d) => /perdió \d+&\d+/.test(d.label)).map((d) => d.color)
  expect(won.length).toBeGreaterThan(0)
  expect(lost.length).toBeGreaterThan(0)
  // The winner's day in one colour, the loser's in another.
  expect(new Set(won).size).toBe(1)
  expect(new Set(lost).size).toBe(1)
  expect(won[0]).not.toBe(lost[0])
})

for (const f of FORMATS.filter((x) => x.strokes)) {
  test(`${f.name}: the TV's totals are the board's figures against par`, async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await open(page, `/t/_/${f.name}/tv`)
    const rows = page.locator('[data-player]')
    await expect(rows.first()).toBeVisible()
    const totals = await rows.evaluateAll((els) => els.map((e) => e.lastElementChild?.textContent?.trim() ?? ''))
    for (const x of totals) expect(x).toMatch(TO_PAR)
  })
}

test('team play: the stats table lists every player of every team', async ({ page }) => {
  await open(page, '/t/_/team8/stats')
  const table = page.locator('section').filter({ has: page.getByRole('heading', { name: t.stats.perPlayer }) })
  await expect(table.locator('tbody tr')).toHaveCount(8)
})

test('stroke play: the race reads best on top, the fewest strokes against par', async ({ page }) => {
  await open(page, '/t/_/stroke8/stats')
  // Recharts 3 draws the ticks in their own layer: the Y axis's are the ones written against par.
  const ticks = page.locator('.recharts-cartesian-axis-tick-value')
  await expect(ticks.first()).toBeVisible()
  const read = await ticks.evaluateAll((els) => els.map((e) => ({ y: Number(e.getAttribute('y')), text: (e.textContent ?? '').trim() })))
  const values = read
    .filter((v) => TO_PAR.test(v.text))
    .sort((a, b) => a.y - b.y)
    .map((v) => (v.text === 'E' ? 0 : Number(v.text.replace('−', '-'))))
  expect(values.length).toBeGreaterThan(2)
  expect(values.every((v) => Number.isFinite(v))).toBe(true)
  expect(values).toEqual([...values].sort((a, b) => a - b))
})

test("stroke play: the honoree's card and his holes in the feed, in strokes", async ({ page }) => {
  await open(page, '/t/_/stroke8')
  const main = page.locator('main').first()
  // His spotlight card says where he stands, on the board's own figure («3.º con −2, …»).
  const card = main.getByRole('button').filter({ hasText: /\d\.º con (E|[+−]\d+)/ })
  await expect(card).toHaveCount(1)
  expect(offending(await card.innerText(), true)).toEqual([])
  // His own holes are named on the score the event counts («bogey neto»), never in points.
  const text = await main.innerText()
  expect(offending(text, true)).toEqual([])
  expect(text).toMatch(/en el \d+: (levantó|(par|bogey|doble bogey|triple bogey|\d+ sobre par)( neto)?)\./)
})
