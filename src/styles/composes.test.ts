/**
 * A stylesheet that other modules `composes: x from …` holds no `url()`.
 *
 * Vite's CSS modules copy the whole composed stylesheet into each module that
 * composes from it, and parse the copy without its file. A relative `url()`
 * there resolves against nothing and ships as written, a broken image in every
 * one of those copies. Probed 2026-10-15 with `url("./probe.svg")` in
 * primitives.module.css: its own CSS inlined the image, and the copies kept
 * `url(./probe.svg)`, on Vite 7 (9 copies, silently) and on Vite 8 (4 copies).
 * Vite 8's build says so: «A PostCSS plugin did not pass the `from` option to
 * `postcss.parse`». An image belongs in the screen's own stylesheet.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = new URL('..', import.meta.url).pathname

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

const noComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** Every stylesheet some module composes from, with the modules that do. */
function composedFrom(): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const file of walk(SRC).filter((f) => f.endsWith('.css'))) {
    for (const m of noComments(readFileSync(file, 'utf8')).matchAll(/composes:[^;]*?\bfrom\s+(['"])([^'"]+)\1/g)) {
      const target = resolve(dirname(file), m[2]!)
      out.set(target, [...(out.get(target) ?? []), relative(SRC, file)])
    }
  }
  return out
}

describe('stylesheets that others compose from', () => {
  const sources = composedFrom()

  it('are found, and each exists', () => {
    // primitives.module.css is the one today (the one list row, VIS-01); the check holds for any.
    expect([...sources.keys()].map((f) => relative(SRC, f))).toContain('components/primitives.module.css')
    for (const file of sources.keys()) expect(existsSync(file), relative(SRC, file)).toBe(true)
  })

  it('hold no url(): their copies would ship it unresolved', () => {
    const urls = [...sources.keys()].flatMap((file) =>
      [...noComments(readFileSync(file, 'utf8')).matchAll(/\burl\(\s*([^)]*)\)/g)].map(
        (m) => `${relative(SRC, file)}: url(${m[1]})`,
      ),
    )
    expect(urls).toEqual([])
  })
})
