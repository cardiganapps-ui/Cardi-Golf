/**
 * REL-08: Comité › Tarjetas, «Pendientes de revisar», on a phone. The holes
 * the server kept for the Comité (the fixture's five) are listed with their
 * two actions; «Aplicar» opens the sheet that asks for the reason. The open
 * sheet, like the screen, has no horizontal scroll and no serious axe
 * violation. pages.spec.ts checks the screen itself at both widths.
 */
import AxeBuilder from '@axe-core/playwright'
import { t } from '../../src/i18n/es-MX'
import { expect, open, test } from './base'

const SI = t.admin.serverInbox

for (const width of [375, 393]) {
  test(`Tarjetas: «Pendientes de revisar» lists the kept holes, and «Aplicar» asks why, at ${width}px`, async ({ page, pageErrors }) => {
    await page.setViewportSize({ width, height: 852 })
    await open(page, '/t/_/full12-live/admin/scores')
    const inbox = page.getByRole('region', { name: SI.title })
    await expect(inbox.locator('[data-server-inbox] > div')).toHaveCount(5)
    await expect(inbox.getByRole('button', { name: SI.dismissMatching(2) })).toBeVisible()
    await inbox.getByRole('button', { name: `${SI.apply}: Damián, día 2, hoyo 4` }).click()
    const sheet = page.getByRole('dialog')
    await expect(sheet.getByText(SI.applyBody('Damián, día 2, hoyo 4', '3 golpes, 2 putts'))).toBeVisible()
    await expect(sheet.getByRole('textbox')).toBeVisible()
    expect(pageErrors, 'uncaught errors').toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'horizontal scroll (px)').toBeLessThanOrEqual(0)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.length} × ${v.help}`)).toEqual([])
  })
}
