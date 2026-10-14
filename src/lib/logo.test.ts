/**
 * PERF-01: one rendition of the logo, sized for its largest slot, its size in
 * its name. Each slot's CSS is read here, so a slot made bigger without the
 * rendition growing fails this test instead of shipping a blurry logo.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LOGO_BOX, LOGO_MAX_BYTES, LOGO_MIN_SIDE, logoPath, logoSize } from './logo'

const SRC = new URL('../', import.meta.url).pathname
const PRINT_DPR = 300 / 96
/** A slot sized by its height takes a logo up to this wide at full sharpness. */
const WIDEST = 3

/** Every place the logo shows: its rule, the height that rule declares, and the most pixels per CSS pixel it is drawn at. */
const SLOTS = [
  { slot: 'tournament header', file: 'screens/tournament/TournamentShell.module.css', rule: 'logo', height: '28px', px: 28, dpr: 3, autoWidth: false },
  { slot: 'Entrar', file: 'components/primitives.module.css', rule: 'eventLogo', height: '40px', px: 40, dpr: 3, autoWidth: false },
  { slot: 'Mi Polo and profiles', file: 'screens/profile/Profile.module.css', rule: 'logo', height: '40px', px: 40, dpr: 3, autoWidth: false },
  { slot: 'Comité › Torneo', file: 'screens/admin/Admin.module.css', rule: 'logo', height: '64px', px: 64, dpr: 3, autoWidth: false },
  // html-to-image's pixelRatio, checked below.
  { slot: 'share card', file: 'components/ShareCard.module.css', rule: 'logo', height: '56px', px: 56, dpr: 2, autoWidth: false },
  { slot: 'printed card', file: 'screens/tournament/PrintScreen.module.css', rule: 'logo', height: '44px', px: 44, dpr: PRINT_DPR, autoWidth: true },
  // 9vh of a 1080-line screen, on a 2× one.
  { slot: 'TV', file: 'screens/tournament/TvScreen.module.css', rule: 'logo', height: '9vh', px: 0.09 * 1080, dpr: 2, autoWidth: true },
  { slot: 'ceremony', file: 'screens/tournament/CeremonyScreen.module.css', rule: 'logo', height: 'clamp(40px, min(9vh, 12vw), 120px)', px: 120, dpr: 2, autoWidth: true },
]

function declaredHeight(file: string, rule: string): string | undefined {
  const css = readFileSync(join(SRC, file), 'utf8')
  const block = new RegExp(`(^|\\n)\\.${rule}\\s*\\{([^}]*)\\}`).exec(css)?.[2]
  return block ? /(?:^|;|\n)\s*height:\s*([^;]+);/.exec(block)?.[1]?.trim() : undefined
}

describe('the rendition covers every slot', () => {
  for (const s of SLOTS) {
    it(`${s.slot}: ${s.height} at ${s.dpr.toFixed(2)}×`, () => {
      expect(declaredHeight(s.file, s.rule), `${s.file} .${s.rule} height`).toBe(s.height)
      const need = Math.ceil(s.px * s.dpr)
      expect(need, 'device pixels tall').toBeLessThanOrEqual(LOGO_BOX.height)
      expect(s.autoWidth ? need * WIDEST : need, 'device pixels wide').toBeLessThanOrEqual(LOGO_BOX.width)
    })
  }

  it('the share card is drawn at the pixel ratio the table assumes', () => {
    expect(readFileSync(join(SRC, 'lib/shareImage.ts'), 'utf8')).toMatch(/pixelRatio: 2\b/)
  })

  it('a PNG made smaller to fit the budget still covers Entrar at 3×', () => {
    expect(LOGO_MIN_SIDE).toBeGreaterThanOrEqual(40 * 3)
    expect(LOGO_MAX_BYTES).toBeLessThanOrEqual(64_000)
  })
})

describe('logoPath and logoSize', () => {
  const tid = '8b40f02b-e8be-4cd7-a93a-b42d450f5fda'
  const base = 'https://ref.supabase.co/storage/v1/object/public/tournament-assets/'

  it('a rendition is a new file every time, its size in its name, under the tournament', () => {
    expect(logoPath(tid, { type: 'image/webp', width: 222, height: 240 }, 1700000000000)).toBe(`${tid}/logo-222x240-1700000000000.webp`)
    expect(logoPath(tid, { type: 'image/png', width: 160, height: 148 }, 1)).toBe(`${tid}/logo-160x148-1.png`)
  })

  it('every slot reads the size back from the URL, with or without the upload’s ?v=', () => {
    expect(logoSize(`${base}${tid}/logo-222x240-1700000000000.webp?v=1700000000001`)).toEqual({ width: 222, height: 240 })
    expect(logoSize(`${base}${tid}/logo-720x180-1.jpg`)).toEqual({ width: 720, height: 180 })
  })

  it('a logo stored whole has no size: shown as it is, and the Comité is offered to optimize it', () => {
    // The Ensayo logo, seeded straight into Storage, and every upload before renditions.
    expect(logoSize(`${base}${tid}/logo.png`)).toBeNull()
    expect(logoSize(`${base}${tid}/logo.jpg?v=1700000000000`)).toBeNull()
    expect(logoSize(null)).toBeNull()
    // One the browser could not redraw goes up as it came, with no size.
    expect(logoPath(tid, { type: 'image/heic', width: null, height: null }, 5)).toBe(`${tid}/logo-5.jpg`)
    expect(logoSize(`${base}${tid}/logo-5.jpg`)).toBeNull()
  })
})

describe('every logo goes through TournamentLogo', () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p, out)
      else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)) out.push(p)
    }
    return out
  }
  it('no screen draws a raw <img> of a logo URL', () => {
    const offenders = walk(SRC)
      .filter((p) => !p.endsWith('components/TournamentLogo.tsx'))
      .flatMap((p) =>
        readFileSync(p, 'utf8')
          .split('\n')
          .map((line, i) => ({ line, at: `${relative(SRC, p)}:${i + 1}` }))
          .filter(({ line }) => /<img\b/.test(line) && /logo/i.test(line))
          .map(({ at }) => at),
      )
    expect(offenders).toEqual([])
  })
})
