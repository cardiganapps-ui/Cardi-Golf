/**
 * PWA-02: in the installed iPhone app the page drew under a translucent status
 * bar (white icons on cream), and once you scrolled the sticky header slid up
 * under the clock. Now the app asks for the default bar (content below it,
 * dark icons), and wherever a top inset remains, the header sticks below it
 * with a band of paper behind the bar.
 */
import { t } from '../../src/i18n/es-MX'
import { expect, open, test } from './base'

test('the app asks iOS for the default status bar (PWA-02)', async ({ page }) => {
  await open(page, '/t/_/full12-live')
  await expect(page.locator('meta[name="apple-mobile-web-app-status-bar-style"]')).toHaveAttribute('content', 'default')
})

for (const path of ['', 'tarjeta', 'juegos', 'dinero', 'mas']) {
  test(`with a 59 px top inset, nothing scrolls under the status bar: ${path || 'envivo'} (PWA-02)`, async ({ page }) => {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 59, bottom: 34 } })
    await open(page, `/t/_/full12-live/${path}`)
    const header = page.locator('[class*="_top_"]').first()
    await expect(header).toBeVisible()
    await page.evaluate(() => window.scrollTo(0, 600))
    await page.waitForTimeout(200)
    const box = (await header.boundingBox())!
    expect(Math.round(box.y), 'header top after scrolling').toBeGreaterThanOrEqual(59)
    // The band behind the bar: fixed, 59 px of paper over whatever scrolls.
    const band = await page.evaluate(() => {
      const s = getComputedStyle(document.querySelector('[class*="_shell_"]')!, '::before')
      return { position: s.position, height: s.height, background: s.backgroundColor, z: Number(s.zIndex) }
    })
    expect(band).toMatchObject({ position: 'fixed', height: '59px' })
    expect(band.background).toBe(await page.evaluate(() => getComputedStyle(document.body).backgroundColor))
    expect(band.z).toBeGreaterThan(5)
    // The tab bar still sits above the home indicator.
    await expect(page.getByRole('navigation', { name: t.common.sections })).toBeVisible()
  })
}
