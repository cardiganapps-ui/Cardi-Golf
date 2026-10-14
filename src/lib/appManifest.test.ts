/**
 * PWA-09: the manifest a tournament's pages point at is the app's own manifest with that tournament's start
 * URL, the same app (`id`), and nothing about the tournament in it.
 *
 * PWA-14: the manifest says what the app is (`categories`), how a launch reaches an open app
 * (`launch_handler`), and offers the last tournament's card and En vivo as shortcuts; the boot screen is
 * painted in the page's own paper and ink.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import handler from '../../api/manifest'
import { t } from '../i18n/es-MX'
import { APP_MANIFEST, startUrlFor } from './appManifest'
import { LAUNCH_MARK_PX } from './launchImages'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
function token(name: string): string | undefined {
  return read('../styles/tokens.css').match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})\\b`))?.[1]?.toLowerCase()
}
/** A PNG's own size, from its header. */
function pngSize(path: string): { width: number; height: number } {
  const bytes = readFileSync(new URL(`../../public${path.split('?')[0]}`, import.meta.url))
  expect(bytes.subarray(1, 4).toString('latin1'), `${path} is a PNG`).toBe('PNG')
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

function call(query: Record<string, unknown>) {
  const out: { status?: number; headers: Record<string, string>; body?: string } = { headers: {} }
  const res = {
    setHeader: (k: string, v: string) => void (out.headers[k.toLowerCase()] = v),
    status: (code: number) => {
      out.status = code
      return res
    },
    send: (body: string) => void (out.body = body),
  }
  handler({ query } as never, res as never)
  return { ...out, json: JSON.parse(out.body ?? 'null') as Record<string, unknown> }
}

describe('a tournament’s manifest (PWA-09)', () => {
  it('opens the tournament it was installed from, and is the same app', () => {
    const r = call({ t: 'nachos-bachelor' })
    expect(r.status).toBe(200)
    expect(r.headers['content-type']).toBe('application/manifest+json')
    expect(r.json).toEqual({ ...APP_MANIFEST, start_url: '/?t=nachos-bachelor' })
    expect(r.json.id).toBe('/')
  })

  it('cached a day by the CDN and an hour by the phone: the same slug always gets the same answer (QA-14)', () => {
    expect(call({ t: 'nachos-bachelor' }).headers['cache-control']).toBe('public, max-age=3600, s-maxage=86400')
    expect(call({}).headers['cache-control']).toBe('public, max-age=3600, s-maxage=86400')
    expect(call({}).json).toEqual({ ...APP_MANIFEST, start_url: '/' })
  })

  it('a code reads as the slug the server would read: lower case', () => {
    expect(startUrlFor('NACHO1')).toBe('/?t=nacho1')
  })

  it('anything that is not a slug gets the app’s own start URL', () => {
    for (const t of ['', '_/full12-live', '../admin', 'a b', 'x', ['a', 'b']]) expect(call({ t }).json.start_url).toBe('/')
  })
})

describe('the colors painted before any stylesheet loads', () => {
  it('are the tokens’ paper and fairway, and index.html’s theme-color', () => {
    expect(APP_MANIFEST.background_color.toLowerCase()).toBe(token('--bg'))
    expect(APP_MANIFEST.theme_color.toLowerCase()).toBe(token('--accent'))
    const meta = read('../../index.html').match(/<meta name="theme-color" content="(#[0-9a-fA-F]{6})"/)?.[1]
    expect(meta?.toLowerCase()).toBe(APP_MANIFEST.theme_color.toLowerCase())
  })

  it('the boot screen covers the page in the paper and the ink, from the first frame (PWA-14)', () => {
    // It had no background: white, then «Polo» and «Cargando…» in the system font, until the app mounted.
    const boot = read('../../index.html').match(/<div id="boot" style="([^"]*)"/)?.[1] ?? ''
    expect(boot).toMatch(/position:fixed;inset:0/)
    expect(boot.match(/background:(#[0-9a-fA-F]{6})/)?.[1]?.toLowerCase()).toBe(token('--bg'))
    expect(boot.match(/(?:^|;)color:(#[0-9a-fA-F]{6})/)?.[1]?.toLowerCase()).toBe(token('--ink'))
  })

  it('its mark is the launch images’ own, as large, and sharp on a 3x screen', () => {
    const img = read('../../index.html').match(/<img src="([^"]+)" width="(\d+)" height="(\d+)" alt="Polo"/)
    expect(img?.[1]).toBe('/brand/boot-mark.png')
    expect(Number(img?.[2])).toBe(LAUNCH_MARK_PX)
    expect(Number(img?.[3])).toBe(LAUNCH_MARK_PX)
    expect(pngSize('/brand/boot-mark.png')).toEqual({ width: LAUNCH_MARK_PX * 3, height: LAUNCH_MARK_PX * 3 })
  })
})

describe('what the installed app says about itself (PWA-14)', () => {
  it('a sports app, and a launch into it while it is open focuses that window', () => {
    expect(APP_MANIFEST.categories).toEqual(['sports'])
    expect(APP_MANIFEST.launch_handler).toEqual({ client_mode: 'focus-existing' })
  })

  it('two shortcuts: the last tournament’s card and its En vivo, named as the app names them', () => {
    expect(APP_MANIFEST.shortcuts.map((s) => [s.name, s.url])).toEqual([
      [t.app.shortcuts.card, '/continuar/tarjeta'],
      [t.nav.live, '/continuar'],
    ])
    expect(APP_MANIFEST.shortcuts[0]!.short_name).toBe(t.nav.card)
  })

  it('every icon it names is there, at the size it says', () => {
    const icons: Array<{ src: string; sizes: string }> = [...APP_MANIFEST.icons]
    for (const s of APP_MANIFEST.shortcuts) icons.push(...s.icons)
    for (const icon of icons) {
      const [w, h] = icon.sizes.split('x').map(Number)
      expect(pngSize(icon.src), icon.src).toEqual({ width: w, height: h })
    }
  })

  it('a tournament’s manifest offers the same shortcuts', () => {
    expect(call({ t: 'nachos-bachelor' }).json.shortcuts).toEqual(APP_MANIFEST.shortcuts)
  })

  it('screenshots for Chrome’s install sheet: there, at their size, narrow, within what Chrome takes', async () => {
    const sharp = (await import('sharp')).default
    expect(APP_MANIFEST.screenshots.length).toBeGreaterThan(0)
    const ratios = new Set<string>()
    for (const shot of APP_MANIFEST.screenshots) {
      const meta = await sharp(new URL(`../../public${shot.src}`, import.meta.url).pathname).metadata()
      expect(`${meta.width}x${meta.height}`, shot.src).toBe(shot.sizes)
      expect(meta.format).toBe('webp')
      expect(shot.form_factor).toBe('narrow')
      // Chrome takes 320 to 3840 px a side, the long side at most 2.3 times the short one, one shape per form factor.
      const [w, h] = [meta.width!, meta.height!]
      expect(Math.min(w, h)).toBeGreaterThanOrEqual(320)
      expect(Math.max(w, h)).toBeLessThanOrEqual(3840)
      expect(Math.max(w, h) / Math.min(w, h)).toBeLessThanOrEqual(2.3)
      ratios.add((h / w).toFixed(3))
    }
    expect(ratios.size).toBe(1)
  })
})
