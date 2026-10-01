/**
 * The fixture browser suite (QA-11): the real screens on the in-memory design
 * fixtures (`/t/_/<fixture>`), built with VITE_DESIGN_ROUTES=1 and served by
 * `vite preview`. No network: every Supabase call is answered locally
 * (e2e/fixtures/base.ts). CI runs it in the `e2e-fixtures` workflow.
 *   npm run e2e:fixtures
 */
import { defineConfig } from '@playwright/test'
import { existsSync } from 'node:fs'

// The sandbox ships its own Chromium; CI installs Playwright's.
const chromium = process.env.CHROMIUM || (!process.env.CI && existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined)
const PORT = 4320

export default defineConfig({
  testDir: 'e2e/fixtures',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    launchOptions: { executablePath: chromium },
    trace: 'retain-on-failure',
    // A phone, as the players hold it.
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  },
  webServer: {
    command: `npm run build:fixtures && npx vite preview --outDir dist-fixtures --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}/fixture`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
})
