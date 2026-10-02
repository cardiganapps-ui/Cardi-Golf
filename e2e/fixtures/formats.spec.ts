/**
 * Format parity (STRAT-03). Match play, stroke play and team play are equal
 * choices in the wizard, but the rest of the product spoke Stableford: the
 * feed crowned a leader the board did not have and wrote «+4 pts», the
 * Reglamento described a Day-2 points cut in a one-day match, the team race
 * chart was empty with «?» names, the share card said «pts».
 *
 * Every screen people read or screenshot, on every non-Stableford fixture:
 * no «pts», no «Putter», no player shown as «?», and, where the event counts
 * strokes, no «puntos» (the print page's «Los puntos (•)» are stroke dots;
 * match play's points are match points and stay).
 */
import { t } from '../../src/i18n/es-MX'
import { expect, open, test } from './base'

const FORMATS = [
  { name: 'stroke8', strokes: true },
  { name: 'team8', strokes: true },
  { name: 'scramble8', strokes: true },
  { name: 'match8', strokes: false },
  { name: 'bracket8', strokes: false },
]
const PAGES = ['', '/juegos', '/stats', '/reglamento', '/imprimir', '/tv']

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
    expect(offending(await sheet.innerText(), f.strokes), 'player sheet').toEqual([])
    await Promise.all([page.waitForEvent('download'), sheet.getByRole('button', { name: t.share.round }).click()])
    const cards = await page.evaluate(() => (window as unknown as { __cards: string[] }).__cards)
    expect(cards.length).toBeGreaterThanOrEqual(2)
    for (const c of cards) expect(offending(c, f.strokes), 'share card').toEqual([])
  })
}

test('match play: a decided match reads the same for both sides, and says who won it', async ({ page }) => {
  await open(page, '/t/_/match8')
  const rows = page.locator('main button[aria-label]')
  const labels = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''))
  expect(labels.some((l) => /ganó \d+&\d+/.test(l))).toBe(true)
  expect(labels.some((l) => /perdió \d+&\d+/.test(l))).toBe(true)
})
