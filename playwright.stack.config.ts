/**
 * The stack suite (e2e-stack, QA-17): the real app against a real local
 * Supabase (`supabase start`: Postgres with every migration, Auth, PostgREST,
 * Realtime), in Chromium. Two browser contexts are two phones: separate
 * storage, outbox and anonymous session. CI runs it in the `e2e-stack`
 * workflow. On a machine with Docker:
 *   supabase start -x studio,postgres-meta,imgproxy,storage-api,edge-runtime,logflare,vector,mailpit,supavisor
 *   eval "$(supabase status -o env | grep -E '^(API_URL|PUBLISHABLE_KEY|DB_URL)=' | sed 's/^/export /')"
 *   VITE_SUPABASE_URL=$API_URL VITE_SUPABASE_ANON_KEY=$PUBLISHABLE_KEY E2E_DB_URL=$DB_URL npm run e2e:stack
 * It refuses any Supabase or database that is not on this machine
 * (e2e/stack/env.ts), and seeds its own throwaway tournaments before every
 * run (e2e/stack/seed.sql). One worker: the latency numbers are measured
 * with nothing else running.
 */
import { defineConfig } from '@playwright/test'
import { existsSync } from 'node:fs'
import { assertLocal, BASE_URL, PORT } from './e2e/stack/env'
import { PHONE } from './e2e/stack/phone'

// Before anything is built against it: the app below is built for this API.
assertLocal()

// The sandbox ships its own Chromium; CI installs Playwright's.
const chromium = process.env.CHROMIUM || (!process.env.CI && existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined)

export default defineConfig({
  testDir: 'e2e/stack',
  globalSetup: './e2e/stack/global-setup.ts',
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  outputDir: 'test-results-stack',
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-stack' }]] : 'list',
  use: {
    ...PHONE,
    launchOptions: { executablePath: chromium },
    trace: 'retain-on-failure',
  },
  webServer: {
    // Bound to 127.0.0.1 on purpose, as in playwright.config.ts (the CI runner resolves `localhost` to ::1 only).
    command: `npm run build:stack && npx vite preview --outDir dist-stack --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `${BASE_URL}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
})
