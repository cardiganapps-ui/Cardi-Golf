/**
 * VIS-27: the Admin de Polo panel in the product's own language. It brought back what the redesign took out: carded
 * KPI tiles under tracked uppercase eyebrows, round filter pills, coloured status chips, raw ISO dates; and the
 * actions that undo something («Quitar protección», «Quitar del Comité») were the same green text as «Agregar al
 * Comité». Now: ruled rows with the figures at their right edge, sentence-case labels, dates in words, and every
 * destructive action in the danger treatment (and it still asks first, ReasonSheet).
 */
import type { Page } from '@playwright/test'
import { expect, open, test } from './base'

test.use({ isMobile: false, hasTouch: false })

/** What the panel's main column shows that the product's language does not use. */
const strays = (page: Page) =>
  page.evaluate(() => {
    const out: string[] = []
    const main = document.querySelector('main')!
    for (const el of Array.from(main.querySelectorAll<HTMLElement>('*'))) {
      const s = getComputedStyle(el)
      if (s.display === 'none' || el.closest('[hidden], [aria-hidden="true"]')) continue
      const own = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent!.trim()).join(' ')
      if (own && s.textTransform === 'uppercase') out.push(`uppercase: ${own.slice(0, 30)}`)
      if (/\b\d{4}-\d{2}-\d{2}\b/.test(own)) out.push(`ISO date: ${own.slice(0, 40)}`)
      if (own.includes('·')) out.push(`middle dot: ${own.slice(0, 40)}`)
      const radius = parseFloat(s.borderTopLeftRadius)
      const round = el.matches('.avatar, .avatar *, [class*="dot"], [class*="Dot"], img') || el.getBoundingClientRect().width <= 24
      if (!round && radius > 4 && s.backgroundColor !== 'rgba(0, 0, 0, 0)') out.push(`rounded fill (${radius}px): ${(el.className || el.tagName).toString().slice(0, 40)}`)
      if (el.classList.contains('chip') && /chip--(teal|sun|coral)/.test(el.className)) out.push(`coloured chip: ${own}`)
    }
    return out
  })

for (const [width, height] of [
  [1440, 900],
  [393, 852],
] as const) {
  test(`Resumen is ruled rows with right-aligned figures at ${width}px (VIS-27)`, async ({ page, pageErrors }) => {
    await page.setViewportSize({ width, height })
    await open(page, '/admin/_/resumen')
    expect(await strays(page)).toEqual([])
    const kpis = page.locator('[data-kpi]')
    expect(await kpis.count()).toBeGreaterThanOrEqual(6)
    const off = await kpis.evaluateAll((els) =>
      els.filter((el) => {
        const fig = el.querySelector('[data-kpi-value]')!.getBoundingClientRect()
        return Math.abs(fig.right - el.getBoundingClientRect().right) > 1
      }).length,
    )
    expect(off, 'figures that do not end at their row’s right edge').toBe(0)
    expect(pageErrors).toEqual([])
  })

  test(`a tournament's detail: dates in words, the undoing actions in danger at ${width}px (VIS-27)`, async ({ page, pageErrors }) => {
    await page.setViewportSize({ width, height })
    await open(page, '/admin/_/torneos/f-nacho')
    await expect(page.getByRole('heading', { name: "Nacho's Bachelor Invitational" })).toBeVisible()
    expect(await strays(page)).toEqual([])
    for (const name of [/^Quitar protección/, /^Quitar del Comité/]) {
      const b = page.getByRole('button', { name }).first()
      await expect(b).toHaveClass(/btn--danger/)
    }
    await expect(page.getByRole('button', { name: /^Agregar al Comité/ })).not.toHaveClass(/btn--danger/)
    // Still asks first.
    await page.getByRole('button', { name: /^Quitar protección/ }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    expect(pageErrors).toEqual([])
  })
}
