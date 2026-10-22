/**
 * Every `styles.x` a component reads is a class its CSS module defines.
 *
 * Vite types a CSS module as `{ [key: string]: string }`, so TypeScript takes
 * any name, and a class the module doesn't define is `undefined`: the element
 * renders with no class at all and nothing fails. That is how the wizard's
 * review shipped with its label and value run together («FormatoStableford»,
 * UX-03): its four classes lived in a sibling module the screen didn't import.
 *
 * The check reads each source file's CSS-module imports (whatever the local
 * name), every literal member read on them (`s.x`, `s['x-y']`, `s["x"]`), and
 * the class names the module's selectors declare. A computed member
 * (`styles[kind]`) can't be read statically and is left alone. A class that is
 * only composed into another one (`composes: x from …`) is not a name of the
 * composing module, which is how CSS modules export it too.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = new URL('..', import.meta.url).pathname

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

/** The class names a CSS module exports: every `.name` in a selector, outside `:global(…)`. */
function moduleClasses(css: string): Set<string> {
  const selectors = css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // Strings (a `content`, a `url("…")`, the path after `composes … from`) say nothing about classes.
    .replace(/'[^'\n]*'|"[^"\n]*"/g, '""')
    // The innermost blocks are declarations: drop them, so what is left is selectors and at-rule preludes.
    .replace(/\{[^{}]*\}/g, ';')
    .replace(/:global\([^)]*\)/g, '')
  const out = new Set<string>()
  // A class starts with a letter, `_` or `-`: `.5em` in a media query is a number.
  for (const m of selectors.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) out.add(m[1]!)
  return out
}

/** Each CSS-module import of a source file: its local name and the module's path. */
function moduleImports(source: string): Array<{ local: string; path: string }> {
  return [...source.matchAll(/import\s+(\w+)\s+from\s+['"]([^'"]+\.module\.css)['"]/g)].map((m) => ({
    local: m[1]!,
    path: m[2]!,
  }))
}

/** The literal member names read on `local`: `local.x`, `local['x-y']`, `local["x"]`. */
function membersRead(source: string, local: string): Set<string> {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\w])\/\/.*$/gm, '$1')
  const out = new Set<string>()
  const dot = new RegExp(`(?<![\\w.$])${local}\\??\\.([A-Za-z_$][\\w$]*)`, 'g')
  const bracket = new RegExp(`(?<![\\w.$])${local}\\??\\.?\\[\\s*(['"])([^'"]+)\\1\\s*\\]`, 'g')
  for (const m of code.matchAll(bracket)) out.add(m[2]!)
  // A quoted string that mentions a module (copy, a test's name) reads nothing; a template's `${…}` still does.
  for (const m of code.replace(/'[^'\n]*'|"[^"\n]*"/g, "''").matchAll(dot)) out.add(m[1]!)
  return out
}

describe('CSS modules: every class read is defined', () => {
  it('reads classes, members and imports the way the build does', () => {
    const css = `
      /* .commented { } */
      .row, .row--wide > .cell:not(.off) { color: var(--ink); }
      @media (min-width: 37.5em) { .row { gap: 0.5rem; } }
      .x :global(.numField .input) { width: 4.5em; }
      .y { composes: rowLine from '../../components/primitives.module.css'; }
    `
    expect([...moduleClasses(css)].sort()).toEqual(['cell', 'off', 'row', 'row--wide', 'x', 'y'])
    const tsx = `
      import styles from './A.module.css'
      import s from "../B.module.css"
      import other from './plain.css'
      // styles.inAComment
      const a = <div className={styles.row} data-x={styles['row--wide']} />
      const b = s?.["cell"] + s.y + styles[kind] + notStyles.z + 'styles.text'
    `
    expect(moduleImports(tsx)).toEqual([
      { local: 'styles', path: './A.module.css' },
      { local: 's', path: '../B.module.css' },
    ])
    expect([...membersRead(tsx, 'styles')].sort()).toEqual(['row', 'row--wide'])
    expect([...membersRead(tsx, 's')].sort()).toEqual(['cell', 'y'])
  })

  it('no source file reads a class its imported module does not define', () => {
    const offenders: string[] = []
    const cache = new Map<string, Set<string>>()
    // Tests style nothing, and this one's own examples name modules that don't exist.
    for (const file of walk(SRC).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))) {
      const source = readFileSync(file, 'utf8')
      for (const { local, path } of moduleImports(source)) {
        const cssPath = join(dirname(file), path)
        let classes = cache.get(cssPath)
        if (!classes) cache.set(cssPath, (classes = moduleClasses(readFileSync(cssPath, 'utf8'))))
        for (const name of membersRead(source, local)) {
          if (!classes.has(name)) offenders.push(`${relative(SRC, file)}: ${local}.${name} is not in ${path}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
