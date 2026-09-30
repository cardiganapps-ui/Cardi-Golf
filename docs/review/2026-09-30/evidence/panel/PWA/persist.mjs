import { chromium } from 'playwright-core'
import fs from 'node:fs'
import { EXE } from './lib.mjs'
const dir = process.cwd() + '/udd-persist-' + Date.now()
const ctx = await chromium.launchPersistentContext(dir, { executablePath: EXE, viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true })
const page = ctx.pages()[0] ?? await ctx.newPage()
await page.goto('https://golf.cardigan.mx/t/_/does-not-matter'.replace('/t/_/does-not-matter', '/'), { waitUntil: 'load' })
await page.waitForTimeout(3000)
console.log('production origin: storage.persisted() =', await page.evaluate(() => navigator.storage.persisted()), '| IndexedDB databases:', JSON.stringify(await page.evaluate(async () => (await indexedDB.databases()).map(d => d.name))))
await ctx.close(); fs.rmSync(dir, { recursive: true, force: true })
