/**
 * Every fixture test runs with no network (Supabase is answered locally with
 * an empty result) and collects the page's uncaught errors.
 */
import { test as base, expect } from '@playwright/test'

export const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      await page.route(/supabase\.co|\/rest\/v1\/|\/auth\/v1\//, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
      await use(errors)
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
