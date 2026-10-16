/**
 * VIS-12: on a laptop (the Comité, the organizer's screens, Admin de Polo) what
 * can be pressed answers the pointer before the click. One `:hover` rule
 * existed in the whole product. Every pressed state (`:active`) now has its
 * hover twin, and every hover lives under `@media (hover: hover)`, so a phone's
 * tap never leaves one stuck.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = new URL('../', import.meta.url).pathname
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (name.endsWith('.css')) out.push(p)
  }
  return out
}
// The style guide is a page of examples (its motion demo hovers on purpose); the fixtures are data.
const files = walk(ROOT)
  .map((p) => relative(ROOT, p))
  .filter((f) => !f.startsWith('dev/') && f !== 'design/DesignScreen.module.css')

interface Rule {
  selectors: string[]
  body: string
  media: string
}
/** Every style rule with the at-rules around it. Enough CSS for our own stylesheets: no strings with braces. */
function rules(css: string): Rule[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const out: Rule[] = []
  const stack: string[] = []
  let buf = ''
  for (const c of src) {
    if (c === '{') {
      stack.push(buf.trim())
      buf = ''
    } else if (c === '}') {
      const prelude = stack.pop() ?? ''
      if (!prelude.startsWith('@')) out.push({ selectors: prelude.split(',').map((s) => s.trim()), body: buf.trim(), media: stack.filter((s) => s.startsWith('@')).join(' ') })
      buf = ''
    } else buf += c
  }
  return out
}
/** A pressed state worth a twin: it changes more than the 1 px nudge of a press. */
const changesLook = (body: string) => body.split(';').some((d) => d.trim() && !/^transform\s*:/.test(d.trim()))

describe('hover states (VIS-12)', () => {
  it('give every pressed state its hover twin, under a pointer that hovers', () => {
    const missing: string[] = []
    for (const f of files) {
      const rs = rules(readFileSync(join(ROOT, f), 'utf8'))
      const hovers = new Set(rs.filter((r) => r.media.includes('(hover: hover)')).flatMap((r) => r.selectors))
      for (const r of rs) {
        if (r.media.includes('hover') || !changesLook(r.body)) continue
        for (const sel of r.selectors.filter((s) => s.includes(':active'))) {
          const twin = [sel.replace(/:active/g, ':not(:disabled):hover'), sel.replace(/:active/g, ':hover')]
          if (!twin.some((t) => hovers.has(t))) missing.push(`${f}: ${sel}`)
        }
      }
    }
    expect(missing).toEqual([])
  })

  it('keep every hover under @media (hover: hover), where a tap can’t leave it stuck', () => {
    // The Admin de Polo's chart dims the other bars while one is pointed at or focused: a reading aid, on a laptop page.
    const ALLOWED = new Set(['screens/platform/Platform.module.css: .plot:hover .bar'])
    const bare: string[] = []
    for (const f of files) {
      for (const r of rules(readFileSync(join(ROOT, f), 'utf8'))) {
        if (r.media.includes('(hover: hover)')) continue
        for (const sel of r.selectors.filter((s) => s.includes(':hover'))) if (!ALLOWED.has(`${f}: ${sel}`)) bare.push(`${f}: ${sel}`)
      }
    }
    expect(bare).toEqual([])
  })

  it('covers the primitives a laptop meets first: buttons, rows, the Comité’s sections, the swatches, links and fields', () => {
    const all = files.flatMap((f) => rules(readFileSync(join(ROOT, f), 'utf8')).filter((r) => r.media.includes('(hover: hover)')).flatMap((r) => r.selectors.map((s) => `${f}: ${s}`)))
    for (const want of [
      'styles/global.css: .btn--primary:not(:disabled):hover',
      'styles/global.css: .btn--secondary:not(:disabled):hover',
      'styles/global.css: .btn--ghost:not(:disabled):hover',
      'styles/global.css: a:hover',
      'styles/global.css: .input:not(:disabled):not(:focus):hover',
      'components/primitives.module.css: .leaderRow:not(:disabled):hover',
      'components/primitives.module.css: .segBtn:not(:disabled):hover',
      'screens/admin/AdminLayout.module.css: .navItem:not(:disabled):hover',
      "screens/admin/AdminTournament.module.css: .swatch:not([aria-pressed='true']):hover",
      'screens/admin/Admin.module.css: .rowBtn:not(:disabled):hover',
    ])
      expect(all, want).toContain(want)
  })
})
