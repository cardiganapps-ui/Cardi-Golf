/**
 * PERF-16 and PERF-01: a tournament's logo, uploaded the way the Comité does
 * it, in a real browser. The first tournament's patch (a 591×640 PNG of
 * 889 KB on a transparent ground) used to come out as a JPEG on a black
 * square, and a logo stored whole shipped at full size to a 28 px header.
 * Now it goes up as one rendition: transparent where the file was, at most
 * 40 KB, its size in its name, and every <img> of it gets that size.
 * Storage is answered here; the service worker is kept out so every read
 * reaches these routes.
 */
import AxeBuilder from '@axe-core/playwright'
import { readFile } from 'node:fs/promises'
import type { Page, Request } from '@playwright/test'
import { t } from '../../src/i18n/es-MX'
import { expect, open, test } from './base'

test.use({ serviceWorkers: 'block' })

const CORS = { 'access-control-allow-origin': '*' }

/** The file and the fields of a Storage upload (supabase-js sends a Blob as multipart). */
function upload(req: Request): { path: string; type: string; bytes: Buffer; cacheControl: string } {
  const boundary = /boundary=(.+)$/.exec(req.headers()['content-type'] ?? '')![1]!
  const body = req.postDataBuffer()!
  const sep = Buffer.from(`--${boundary}`)
  const parts: Buffer[] = []
  for (let at = body.indexOf(sep); at >= 0; ) {
    const next = body.indexOf(sep, at + sep.length)
    if (next < 0) break
    parts.push(body.subarray(at + sep.length + 2, next - 2))
    at = next
  }
  let file: { type: string; bytes: Buffer } | null = null
  let cacheControl = ''
  for (const p of parts) {
    const end = p.indexOf('\r\n\r\n')
    const head = p.subarray(0, end).toString()
    const content = p.subarray(end + 4)
    if (/name="cacheControl"/.test(head)) cacheControl = content.toString()
    const type = /content-type:\s*(\S+)/i.exec(head)?.[1]
    if (type) file = { type, bytes: Buffer.from(content) }
  }
  const path = decodeURIComponent(new URL(req.url()).pathname.replace(/^.*\/object\/tournament-assets\//, ''))
  return { path, ...file!, cacheControl }
}

/** Decoded in the page: its size and the alpha of its top-left pixel. */
function decode(page: Page, bytes: Buffer, type: string) {
  return page.evaluate(
    async ({ b64, type }) => {
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      const bitmap = await createImageBitmap(new Blob([bin], { type }))
      const c = document.createElement('canvas')
      c.width = bitmap.width
      c.height = bitmap.height
      const ctx = c.getContext('2d')!
      ctx.drawImage(bitmap, 0, 0)
      const corner = Array.from(ctx.getImageData(0, 0, 1, 1).data)
      const middle = Array.from(ctx.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data)
      return { width: bitmap.width, height: bitmap.height, corner, middle }
    },
    { b64: bytes.toString('base64'), type },
  )
}

async function pageChecks(page: Page, pageErrors: string[]) {
  expect(pageErrors, 'uncaught errors').toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'horizontal scroll (px)').toBeLessThanOrEqual(0)
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.help}`)).toEqual([])
}

const PATCH = new URL('../../assets/nacho-logo.png', import.meta.url)

/** Storage, answered here: what each upload sent, and the files to serve back, by path. A file this browser can't draw is served as the patch: the logo «stored whole». */
async function storage(page: Page) {
  const patch = await readFile(PATCH)
  const stored = new Map<string, { type: string; bytes: Buffer }>()
  const uploads: ReturnType<typeof upload>[] = []
  await page.route(/\/storage\/v1\/object\/tournament-assets\//, async (r) => {
    const u = upload(r.request())
    uploads.push(u)
    stored.set(u.path, u.type === 'image/heic' ? { type: 'image/png', bytes: patch } : u)
    await r.fulfill({ status: 200, headers: CORS, json: { Key: `tournament-assets/${u.path}`, Id: String(uploads.length) } })
  })
  await page.route(/\/storage\/v1\/object\/public\/tournament-assets\//, async (r) => {
    const path = decodeURIComponent(new URL(r.request().url()).pathname.replace(/^.*\/public\/tournament-assets\//, ''))
    const file = stored.get(path)
    await (file ? r.fulfill({ status: 200, headers: CORS, contentType: file.type, body: file.bytes }) : r.fulfill({ status: 404, headers: CORS, body: '' }))
  })
  return uploads
}

for (const width of [375, 393]) {
  test(`at ${width} px, a transparent PNG logo goes up as a small rendition that stays transparent, and an old one can be optimized`, async ({ page, pageErrors }) => {
    await page.setViewportSize({ width, height: 852 })
    const uploads = await storage(page)
    await open(page, '/t/_/full12-live/admin/torneo')
    const input = page.locator('input[type="file"]')

    // 1. A file this browser can't draw goes up as it came, with no size: the logo «stored whole».
    await input.setInputFiles({ name: 'logo.heic', mimeType: 'image/heic', buffer: Buffer.from('not an image the browser can draw') })
    await expect.poll(() => uploads.length).toBe(1)
    expect(uploads[0]!.path).toMatch(/\/logo-\d+\.jpg$/)
    const optimize = page.getByRole('button', { name: t.admin.tournament.optimizeLogo })
    await expect(optimize).toBeVisible()
    await expect(page.getByText(t.admin.tournament.logoHeavy)).toBeVisible()
    await pageChecks(page, pageErrors)

    // 2. «Optimizar logo» reads it back (here: the 889 KB patch) and stores its rendition.
    await optimize.click()
    await expect.poll(() => uploads.length).toBe(2)
    const r = uploads[1]!
    expect(r.type, 'Chromium encodes WebP').toBe('image/webp')
    expect(r.bytes.length, 'bytes').toBeLessThanOrEqual(40_000)
    expect(r.path).toMatch(/\/logo-222x240-\d+\.webp$/)
    expect(r.cacheControl, 'a new name each time, so a year of cache').toBe('31536000')
    const out = await decode(page, r.bytes, r.type)
    expect({ width: out.width, height: out.height }).toEqual({ width: 222, height: 240 })
    expect(out.corner[3], 'the transparent corner stays transparent').toBe(0)
    expect(out.middle[3], 'the patch itself stays opaque').toBe(255)
    await expect(optimize).toHaveCount(0)

    // 3. The preview and En vivo's header use the rendition at its size, and the header box holds it.
    const preview = page.locator('main img[width="222"][height="240"]').first()
    await expect(preview).toBeVisible()
    expect(await preview.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(222)
    await pageChecks(page, pageErrors)
    await page.getByRole('link', { name: t.nav.live }).first().click()
    const header = page.locator('header img').first()
    await expect(header).toHaveAttribute('width', '222')
    await expect(header).toHaveAttribute('height', '240')
    expect(await header.evaluate((img) => [img.getBoundingClientRect().width, img.getBoundingClientRect().height])).toEqual([28, 28])
    await pageChecks(page, pageErrors)

    // 4. A share card inlines the WebP rendition (a CORS read), not the empty pixel it uses for a file it can't read.
    await page.evaluate(() => {
      const seen: string[] = []
      ;(window as unknown as { __logoSrcs: string[] }).__logoSrcs = seen
      new MutationObserver((ms) => {
        for (const m of ms) {
          const img = m.target as HTMLImageElement
          if (img.tagName === 'IMG' && img.closest('[data-share-card]')) seen.push(img.getAttribute('src')!.slice(0, 22))
        }
      }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['src'] })
    })
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: t.share.leaderboard }).first().click()])
    expect(await download.path()).toBeTruthy()
    expect(await page.evaluate(() => (window as unknown as { __logoSrcs: string[] }).__logoSrcs)).toContain('data:image/webp;base64')
    expect(pageErrors).toEqual([])
  })
}

test('where the browser cannot encode WebP (Safari gives a PNG), the logo is a PNG that keeps its transparency, made smaller toward its budget', async ({ page, pageErrors }) => {
  // Safari's canvas: asked for WebP, it hands back a PNG.
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.toBlob
    HTMLCanvasElement.prototype.toBlob = function (cb, type, quality) {
      return original.call(this, cb, type === 'image/webp' ? 'image/png' : type, quality)
    }
  })
  const uploads = await storage(page)
  await open(page, '/t/_/full12-live/admin/torneo')
  await page.locator('input[type="file"]').setInputFiles(PATCH.pathname)
  await expect.poll(() => uploads.length).toBe(1)
  const r = uploads[0]!
  expect(r.type).toBe('image/png')
  const out = await decode(page, r.bytes, r.type)
  const longer = Math.max(out.width, out.height)
  expect(r.path).toMatch(new RegExp(`/logo-${out.width}x${out.height}-\\d+\\.png$`))
  // Redrawn smaller until it fits 64 KB or reaches the smallest side it may have (the patch stops there, at 66 KB of 889).
  expect(longer, 'never under the smallest side').toBeGreaterThanOrEqual(160)
  expect(r.bytes.length <= 64_000 || longer === 160, `${r.bytes.length} bytes at ${longer} px`).toBe(true)
  expect(r.bytes.length, 'bytes').toBeLessThanOrEqual(80_000)
  expect(out.height).toBeLessThan(240)
  expect(out.corner[3], 'the transparent corner stays transparent').toBe(0)
  expect(out.middle[3]).toBe(255)
  expect(pageErrors).toEqual([])
})
