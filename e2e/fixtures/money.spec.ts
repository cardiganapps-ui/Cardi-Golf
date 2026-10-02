/**
 * Money in columns (VIS-01), and «Marcar pagado» that can be taken back
 * (UX-21), on the real Juegos and Dinero screens. Both failed before their fix.
 */
import type { Page } from '@playwright/test'
import { t } from '../../src/i18n/es-MX'
import { expect, open, test } from './base'

const M = t.moneyScreen

/** A copy line with a count in it («Ya pagaron (11)»), matched for any count. */
const withCount = (copy: (n: number) => string) => new RegExp(`^${copy(999).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('999', '\\d+')}$`)

/**
 * The ragged-row detector. In every visible list row, the cells share one
 * line, the last cell ends on the row's right edge, and each cell after the
 * text ends on the same x in every row of its list. A figure that floats
 * after its label, a staircase down the list, or an amount and its button
 * pushed under the text, fails here with the row and how far off it is.
 */
async function ragged(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = []
    const label = (el: Element) => (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40)
    const lists = new Map<Element, HTMLElement[]>()
    for (const row of Array.from(document.querySelectorAll<HTMLElement>('[class*="_rowLine_"]'))) {
      if (!row.checkVisibility() || !row.parentElement) continue
      lists.set(row.parentElement, [...(lists.get(row.parentElement) ?? []), row])
    }
    for (const rows of lists.values()) {
      const edges = new Map<number, Array<{ x: number; row: string }>>()
      for (const row of rows) {
        const cells = Array.from(row.children).filter((c) => c.getBoundingClientRect().width > 0)
        if (cells.length < 2) continue
        // One line: every cell overlaps every other vertically.
        const boxes = cells.map((c) => c.getBoundingClientRect())
        const gap = Math.max(...boxes.map((b) => b.top)) - Math.min(...boxes.map((b) => b.bottom))
        if (gap > 1) out.push(`«${label(row)}»: its cells are stacked, not on one line (${Math.round(gap)}px apart)`)
        const edge = row.getBoundingClientRect().right - parseFloat(getComputedStyle(row).paddingRight)
        const short = Math.round(edge - cells.at(-1)!.getBoundingClientRect().right)
        if (Math.abs(short) > 1) out.push(`«${label(row)}»: its last cell ends ${short}px short of the row's edge`)
        cells.slice(1).forEach((c, i) => edges.set(i, [...(edges.get(i) ?? []), { x: c.getBoundingClientRect().right, row: label(row) }]))
      }
      for (const [i, xs] of edges) {
        const min = Math.min(...xs.map((e) => e.x))
        const max = Math.max(...xs.map((e) => e.x))
        if (max - min > 1) out.push(`cell ${i + 1} after the text ends anywhere from x=${Math.round(min)} to x=${Math.round(max)} down one list (e.g. «${xs[0]!.row}»)`)
      }
    }
    return out
  })
}

for (const width of [375, 393]) {
  test.describe(`at ${width}px`, () => {
    test.beforeEach(({ page }) => page.setViewportSize({ width, height: 852 }))

    test('Juegos › La Calcutta: what each slot pays and each owner holds, in one column (VIS-01)', async ({ page }) => {
      await open(page, '/t/_/full12-live/juegos')
      await page.getByRole('button', { name: /La Calcutta/ }).first().click()
      await expect(page.getByRole('heading', { level: 3, name: t.games.owners })).toBeVisible()
      expect(await ragged(page)).toEqual([])
    })

    test('Juegos › Los Matrimonios: each pair\'s points in a column of their own (VIS-01)', async ({ page }) => {
      await open(page, '/t/_/full12-live/juegos')
      await page.getByRole('button', { name: /Los Matrimonios/ }).first().click()
      await expect(page.getByRole('heading', { level: 3, name: t.games.headToHead })).toBeVisible()
      expect(await ragged(page)).toEqual([])
      // Inside the figures, the first pair's points and the second's are two columns.
      const columns = () =>
        page.evaluate(() => {
          const byIndex: number[][] = []
          for (const row of Array.from(document.querySelectorAll('[class*="_figures_"]'))) Array.from(row.children).forEach((c, i) => (byIndex[i] ??= []).push(Math.round(c.getBoundingClientRect().right)))
          return byIndex.map((xs) => [...new Set(xs)])
        })
      expect(await columns()).toHaveLength(2)
      for (const xs of await columns()) expect(xs).toHaveLength(1)
      // A pair on one digit (a bad day) keeps both columns: the second pair of the first group gets 7 points.
      await page.locator('[class*="_figures_"] > :last-child').first().evaluate((el) => (el.textContent = '7'))
      for (const xs of await columns()) expect(xs, 'a one-digit pair score').toHaveLength(1)
      expect(await ragged(page), 'a one-digit pair score').toEqual([])
    })

    test('Dinero › Liquidación: every amount and every button in a column, live and once final (VIS-01)', async ({ page }) => {
      await open(page, '/t/_/full12-live/dinero')
      await page.getByRole('radio', { name: M.final }).click()
      expect(await ragged(page), 'Quién debe qué and vía banco').toEqual([])
      await page.getByRole('radio', { name: M.p2p }).click()
      expect(await ragged(page), 'sin banco').toEqual([])
      await openPaid(page)
      expect(await ragged(page), 'Ya pagaron, open').toEqual([])

      await open(page, '/t/_/full12-finished/dinero')
      await page.getByRole('radio', { name: M.final }).click()
      expect(await ragged(page), 'final: vía banco').toEqual([])
      // A line with a prize still provisional has no button, and keeps its slot: take the
      // button off every other line, as a pending tiebreak would, and the amounts stay in one column.
      await page.evaluate(() => document.querySelectorAll('[data-money-list] [class*="_action_"]').forEach((slot, i) => i % 2 && slot.replaceChildren()))
      expect(await ragged(page), 'final: vía banco, some lines without a button').toEqual([])
      await open(page, '/t/_/full12-finished/dinero')
      await page.getByRole('radio', { name: M.final }).click()
      await page.locator('summary').filter({ hasText: M.recordPaid }).click()
      await openPaid(page)
      expect(await ragged(page), 'final: Registrar and Ya pagaron, open').toEqual([])
    })

    test('Dinero › Liquidación without the Comité: no buttons, the amounts on the edge (VIS-01)', async ({ page }) => {
      await open(page, '/t/_/full12-live/dinero?as=platform-locked')
      await page.getByRole('radio', { name: M.final }).click()
      await expect(page.getByRole('button', { name: new RegExp(`^${M.markPaid}`) })).toHaveCount(0)
      expect(await ragged(page), 'Quién debe qué and vía banco').toEqual([])
      await openPaid(page)
      await expect(page.getByRole('button', { name: new RegExp(`^${M.paid}`) })).toHaveCount(0)
      expect(await ragged(page), 'Ya pagaron, open').toEqual([])
    })
  })
}

test('Every Juegos tab, every Dinero mode and the Comité inbox, wherever there is money: no ragged row (VIS-01)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 852 })
  for (const fixture of ['full12-live', 'full12-finished', 'friends8', 'minimal4-live']) {
    await open(page, `/t/_/${fixture}/juegos`)
    await page.locator('[class*="_gameRow_"]').first().click()
    expect(await ragged(page), `${fixture}, Juegos, first game`).toEqual([])
    for (const tab of await page.getByRole('tablist', { name: t.nav.games }).getByRole('tab').all()) {
      await tab.click()
      expect(await ragged(page), `${fixture}, Juegos, ${await tab.textContent()}`).toEqual([])
    }
    await open(page, `/t/_/${fixture}/dinero`)
    for (const mode of [M.live, M.byGame, M.final]) {
      await page.getByRole('radio', { name: mode }).click()
      for (const summary of await page.locator('summary').all()) await summary.click()
      expect(await ragged(page), `${fixture}, Dinero, ${mode}`).toEqual([])
    }
  }
  await open(page, '/t/_/full12-live/admin/scores')
  expect(await ragged(page), 'Comité, Tarjetas').toEqual([])
})

/** Every `set_payment_paid` the page sends, as the server would receive it. */
function recordWrites(page: Page) {
  const writes: Array<Record<string, unknown>> = []
  page.on('request', (r) => {
    if (r.url().includes('/rpc/set_payment_paid')) writes.push(JSON.parse(r.postData() ?? '{}'))
  })
  return writes
}
/** The rows of one list on Dinero, as text: what the banker reads. */
const owedRows = (page: Page) => page.locator('section').filter({ has: page.getByRole('heading', { name: M.checklist }) }).locator('[class*="_transfer_"]').allInnerTexts()
const settlementRows = (page: Page) => page.locator('section').filter({ has: page.getByRole('radio', { name: M.viaBank }) }).locator('[class*="_transfer_"]').allInnerTexts()
const paidList = (page: Page) => page.locator('details').filter({ has: page.locator('summary').filter({ hasText: withCount(M.paidTitle) }) })

/** «Ya pagaron», open. Before UX-21 there was no such list: a payment marked by mistake had no way back. */
async function openPaid(page: Page) {
  const list = paidList(page)
  await expect(list.locator('summary'), '«Ya pagaron»').toBeVisible()
  if (!(await list.evaluate((d: HTMLDetailsElement) => d.open))) await list.locator('summary').click()
  return list
}

test('Dinero: an entry fee and a Calcutta purchase marked by mistake come back from «Ya pagaron» exactly (UX-21)', async ({ page }) => {
  const writes = recordWrites(page)
  await open(page, '/t/_/full12-live/dinero')
  await page.getByRole('radio', { name: M.final }).click()
  const owedBefore = await owedRows(page)
  const settlementBefore = await settlementRows(page)

  for (const [kind, who, detail, amount] of [
    ['entry', 'Leonel', M.owesEntry, '$2,500'],
    ['calcutta', 'Camilo', M.owesLots([1]), '$3,000'],
  ] as const) {
    writes.length = 0
    // The action says what it does, and its name says which debt; the row leaves the list.
    const row = page.locator('section').filter({ has: page.getByRole('heading', { name: M.checklist }) }).locator('[class*="_transfer_"]').filter({ hasText: who }).filter({ hasText: detail })
    const mark = row.getByRole('button', { name: new RegExp(`^${M.markPaid}`) })
    await expect(mark).toHaveAccessibleName(`${M.markPaid}: ${who} ${M.paysTo} ${M.bank}, ${detail}: ${amount}`)
    await mark.click()
    await expect(page.getByRole('status').filter({ hasText: M.markedPaid }).last()).toBeVisible()
    await expect.poll(() => owedRows(page)).toHaveLength(owedBefore.length - 1)

    // In «Ya pagaron» the state reads «Pagado», pressed, and a tap takes it back.
    const toggle = (await openPaid(page)).getByRole('button', { name: `${M.paid}: ${who} ${M.paidTo} ${M.bank}, ${detail}: ${amount}`, exact: true })
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await toggle.click()
    await expect(page.getByRole('status').filter({ hasText: M.unmarkedPaid }).last()).toBeVisible()

    // The same row, written back with paid false: same key, same amount, nothing else.
    await expect.poll(() => writes.length).toBe(2)
    expect(writes[1]).toEqual({ ...writes[0], p_paid: false })
    expect(writes[0]).toMatchObject({ p_kind: kind, p_paid: true })
    await expect.poll(() => owedRows(page)).toEqual(owedBefore)
    await expect.poll(() => settlementRows(page)).toEqual(settlementBefore)
  }
})

test('Dinero: «Deshacer» puts a payment back the way it was, both ways (UX-21)', async ({ page }) => {
  const writes = recordWrites(page)
  await open(page, '/t/_/full12-live/dinero')
  await page.getByRole('radio', { name: M.final }).click()
  const owedBefore = await owedRows(page)

  // A wrong «Marcar pagado», undone from the toast.
  const camilo = page.locator('section').filter({ has: page.getByRole('heading', { name: M.checklist }) }).locator('[class*="_transfer_"]').filter({ hasText: 'Camilo' }).filter({ hasText: M.owesLots([1]) })
  await camilo.getByRole('button', { name: new RegExp(`^${M.markPaid}`) }).click()
  // The list follows the server's answer: wait for it rather than read it once.
  await expect.poll(() => owedRows(page)).toHaveLength(owedBefore.length - 1)
  await page.getByRole('status').filter({ hasText: M.markedPaid }).last().getByRole('button', { name: t.common.undo }).click()
  await expect(page.getByRole('status').filter({ hasText: M.markedPaid })).toHaveCount(0)
  await expect.poll(() => owedRows(page)).toEqual(owedBefore)

  // A payment taken back by mistake (Arturo's entry was paid), undone from the toast: paid again.
  const paid = await openPaid(page)
  const paidBefore = await paid.locator('[class*="_transfer_"]').allInnerTexts()
  writes.length = 0
  await paid.getByRole('button', { name: `${M.paid}: Arturo ${M.paidTo} ${M.bank}, ${M.owesEntry}: $2,500`, exact: true }).click()
  await expect.poll(() => owedRows(page)).toHaveLength(owedBefore.length + 1)
  await page.getByRole('status').filter({ hasText: M.unmarkedPaid }).last().getByRole('button', { name: t.common.undo }).click()
  await expect(page.getByRole('status').filter({ hasText: M.unmarkedPaid })).toHaveCount(0)
  await expect.poll(() => owedRows(page)).toEqual(owedBefore)
  await expect.poll(() => paid.locator('[class*="_transfer_"]').allInnerTexts()).toEqual(paidBefore)
  await expect.poll(() => writes.length).toBe(2)
  expect(writes).toEqual([
    { p_tournament_id: 'fx-full', p_kind: 'entry', p_from: 'p1', p_to: null, p_amount: 2500, p_paid: false, p_note: null },
    { p_tournament_id: 'fx-full', p_kind: 'entry', p_from: 'p1', p_to: null, p_amount: 2500, p_paid: true, p_note: null },
  ])
})

test('Dinero once final: a vía-banco line marked by mistake comes back from «Ya pagaron» (UX-21)', async ({ page }) => {
  await open(page, '/t/_/full12-finished/dinero')
  await page.getByRole('radio', { name: M.final }).click()
  const before = await settlementRows(page)
  const line = page.locator('[class*="_transfer_"]').filter({ hasText: /Banco\s+paga a\s+Camilo/ })
  await expect(line).toContainText('$10,200')
  await line.getByRole('button', { name: new RegExp(`^${M.markPaid}`) }).click()
  await expect(line).toHaveCount(0)
  // The line closed two accounts, his prizes and his lot: each is on record, and each comes back.
  const paid = await openPaid(page)
  for (const name of [`${M.paid}: ${M.bank} ${M.paidTo} Camilo, ${M.prizes}`, `${M.paid}: Camilo ${M.paidTo} ${M.bank}, ${M.owesLots([1])}`]) {
    await paid.getByRole('button', { name: new RegExp(`^${name}: `) }).click()
  }
  await expect(line).toContainText('$10,200')
  await expect.poll(() => settlementRows(page)).toEqual(before)
})
