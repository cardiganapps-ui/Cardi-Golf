/**
 * QA-16: a deploy that arrives while a hole is half-entered (PWA-03). An update that reloaded on its own once
 * threw away the steppers on the course, and nothing tested the real service worker. Here the fixtures build's
 * own worker runs, on a server of this spec's own (a copy of the build, so changing it touches no other test).
 * A new worker is deployed and found while a stepper on the Tarjeta is moved: nothing reloads, the typed value
 * stays, and the bar waits. Once the hole is saved the bar offers «Actualizar», and the tap loads the new worker.
 */
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import { t } from '../../src/i18n/es-MX'
import type { Page } from '@playwright/test'
import { expect, test } from './base'

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
}
let dir = ''
let origin = ''
let server: Server

test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'polo-update-'))
  cpSync(join(process.cwd(), 'dist-fixtures'), dir, { recursive: true })
  // As Vercel serves it: a file when there is one, else the app's page.
  server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname)
    let file = join(dir, path)
    if (!file.startsWith(dir) || !existsSync(file) || statSync(file).isDirectory()) file = join(dir, 'index.html')
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' })
    res.end(readFileSync(file))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  origin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
})
test.afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
  rmSync(dir, { recursive: true, force: true })
})

type Marked = Window & { stayed?: boolean }
const page_ = (path = '/t/_/full12-live/tarjeta') => `${origin}${path}`
/** This build's worker serves the page. */
const served = (page: Page) => page.evaluate(async () => !!(await navigator.serviceWorker.ready).active && !!navigator.serviceWorker.controller)
/** A deploy: a new worker on the server, found by the next check (the app makes one on resume and every 30 minutes). */
async function deploy(page: Page) {
  writeFileSync(join(dir, 'sw.js'), `${readFileSync(join(dir, 'sw.js'), 'utf8')}\n// the next deploy\n`)
  await page.evaluate(async () => void (await (await navigator.serviceWorker.getRegistration())?.update()))
  await expect.poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting), { timeout: 30_000 }).toBe(true)
}
/** «Actualizar» on the bar: the page loads again, and the new worker serves it, none left waiting. */
async function update(page: Page) {
  const bar = page.getByRole('status').filter({ hasText: t.sync.newVersion })
  await expect(bar).toBeVisible()
  await bar.getByRole('button', { name: t.sync.update }).click()
  await expect.poll(() => page.evaluate(() => (window as Marked).stayed ?? false).catch(() => true), { timeout: 30_000 }).toBe(false)
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const r = await navigator.serviceWorker.getRegistration()
          return !!r?.active && !r.waiting && !!navigator.serviceWorker.controller
        }),
      { timeout: 30_000 },
    )
    .toBe(true)
}

test('a deploy found mid-hole waits for the hole, and «Actualizar» loads it, on the phone’s first visit too (QA-16, PWA-03)', async ({ page, pageErrors }) => {
  test.setTimeout(90_000)
  // A first visit: no worker when the page opened, then this build's took it (clientsClaim). vite-plugin-pwa
  // reloads only a page that had a worker when it opened, so this is the case the app reloads by itself.
  await page.goto(page_(), { waitUntil: 'networkidle' })
  await expect.poll(() => served(page), { timeout: 30_000 }).toBe(true)

  // A hole half-entered: one more stroke for the second player.
  const strokes = page.locator(`[role="group"][aria-label^="${t.card.strokesOf('')}"]`).nth(1)
  const shown = () => strokes.locator('[class*="stepValue"]').textContent()
  const before = await shown()
  await strokes.getByRole('button').last().click()
  const typed = await shown()
  expect(typed).not.toBe(before)
  await page.evaluate(() => void ((window as Marked).stayed = true))
  await deploy(page)

  // Nothing reloaded, the typed value is there, and the bar waits for the hole.
  await page.waitForTimeout(500)
  expect(await page.evaluate(() => (window as Marked).stayed)).toBe(true)
  expect(await shown()).toBe(typed)
  await expect(page.getByText(t.sync.newVersion)).toHaveCount(0)

  // The hole saved, the bar offers the update; the tap loads the new worker.
  await page.waitForTimeout(800) // past the double-tap guard
  await page.getByRole('button', { name: new RegExp(`^(${t.card.save}|${t.card.saveLast})$`) }).click()
  await update(page)
  expect(pageErrors, 'uncaught errors').toEqual([])
})

test('a page the worker served from the start loads the update once, the same way', async ({ page, pageErrors }) => {
  test.setTimeout(90_000)
  await page.goto(page_('/t/_/full12-live'), { waitUntil: 'networkidle' })
  await expect.poll(() => served(page), { timeout: 30_000 }).toBe(true)
  // Opened again: the worker serves it from the start, so vite-plugin-pwa reloads it too.
  await page.reload({ waitUntil: 'networkidle' })
  await expect.poll(() => served(page), { timeout: 30_000 }).toBe(true)
  let loads = 0
  page.on('load', () => void loads++)
  await page.evaluate(() => void ((window as Marked).stayed = true))
  await deploy(page)
  await update(page)
  // One load, not two: the app's own reload and vite-plugin-pwa's are one.
  await page.waitForTimeout(1_000)
  expect(loads).toBe(1)
  expect(pageErrors, 'uncaught errors').toEqual([])
})
