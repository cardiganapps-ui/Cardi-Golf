/**
 * Every fixture test runs with no network (Supabase is answered locally with
 * an empty result) and collects the page's uncaught errors.
 */
import { test as base, expect } from '@playwright/test'

export const test = base.extend<{ pageErrors: string[]; cspViolations: string[] }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      await page.route(/supabase\.co|\/rest\/v1\/|\/auth\/v1\//, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
      await use(errors)
    },
    { auto: true },
  ],
  // SEC-01: the build is served with production's headers (playwright.config.ts), and nothing on any
  // screen may need what the Content-Security-Policy refuses.
  cspViolations: [
    async ({ page }, use) => {
      const violations: string[] = []
      page.on('console', (m) => {
        if (/Content Security Policy/i.test(m.text())) violations.push(m.text())
      })
      await use(violations)
      expect(violations, 'Content-Security-Policy violations').toEqual([])
    },
    { auto: true },
  ],
})
export { expect }

/** Open a fixture route and wait until it has rendered. */
export async function open(page: import('@playwright/test').Page, path: string) {
  await page.goto(path, { waitUntil: 'networkidle' })
  await page.locator('main').first().waitFor()
  await page.waitForTimeout(300)
}
