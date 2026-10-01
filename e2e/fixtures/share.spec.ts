/**
 * PWA-04: «Compartir tabla» failed offline (html-to-image asked for the
 * precached fonts with a cache-busting query, a precache miss), and a failure
 * then broke sharing for the rest of the session. Offline first, then online,
 * in one session: both give the image, and no font is ever asked for with a
 * cache-busting query.
 */
import { readFile } from 'node:fs/promises'
import { t } from '../../src/i18n/es-MX'
import { expect, open, test } from './base'

test('Share card: offline, then online, in the same session (PWA-04)', async ({ page, context }) => {
  const busted: string[] = []
  page.on('request', (r) => {
    if (/\.(woff2?|png|jpe?g|svg)\?\d{10,}/.test(r.url())) busted.push(r.url())
  })
  await open(page, '/t/_/full12-live')
  // The precache answers offline only once the service worker controls the page.
  await page.evaluate(() => navigator.serviceWorker.ready)
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)

  const share = page.getByRole('button', { name: t.share.leaderboard }).first()
  for (const offline of [true, false]) {
    await context.setOffline(offline)
    const [download] = await Promise.all([page.waitForEvent('download'), share.click()])
    const png = await readFile((await download.path())!)
    expect(png.subarray(1, 4).toString(), `a PNG ${offline ? 'offline' : 'online'}`).toBe('PNG')
    expect(png.length).toBeGreaterThan(20_000)
    await expect(page.getByText(t.share.failed)).toHaveCount(0)
    await expect(share).toBeEnabled()
  }
  expect(busted, 'cache-busted requests').toEqual([])
})
