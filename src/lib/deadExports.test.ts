/**
 * ARCH-19: exports nothing reads. The review found ten (pairs and teams renamed through API calls no screen
 * made, icons no screen drew, an engine helper and a constant), each one a trap: it reads like a feature
 * that exists. An export must be read somewhere: another file (a test counts) or its own. What only tests
 * read should live in a `testing/` folder, which no build ships (ARCH-07); the deliberate test seams
 * (`_outboxTest` and its kind) stay where their state is.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(e.name) && !e.name.endsWith('.d.ts')) out.push(p)
  }
  return out
}

/** The names a file declares as exports, at its top level. */
function exportsOf(file: string, text: string): string[] {
  const sf = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const names: string[] = []
  sf.forEachChild((n) => {
    const mods = ts.canHaveModifiers(n) ? ts.getModifiers(n) : undefined
    if (!mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) return
    if (mods.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)) return
    if (ts.isVariableStatement(n))
      for (const d of n.declarationList.declarations) if (ts.isIdentifier(d.name)) names.push(d.name.text)
    if (
      (ts.isFunctionDeclaration(n) ||
        ts.isClassDeclaration(n) ||
        ts.isInterfaceDeclaration(n) ||
        ts.isTypeAliasDeclaration(n) ||
        ts.isEnumDeclaration(n)) &&
      n.name
    )
      names.push(n.name.text)
  })
  return names
}

describe('every export is read somewhere (ARCH-19)', () => {
  // It reads and parses every file: a few seconds alone, more beside the rest of the suite.
  it('no export that no file reads, its own included', () => {
    const files = [...walk(join(root, 'src')), ...walk(join(root, 'api')), ...walk(join(root, 'e2e'))]
    const text = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]))
    // Every identifier, by the files it appears in and how often in each.
    const seen = new Map<string, Map<string, number>>()
    for (const [f, src] of text) {
      for (const m of src.matchAll(/[A-Za-z_$][\w$]*/g)) {
        let by = seen.get(m[0])
        if (!by) seen.set(m[0], (by = new Map()))
        by.set(f, (by.get(f) ?? 0) + 1)
      }
    }
    const unread: string[] = []
    for (const f of files.filter((x) => x.startsWith(join(root, 'src')) && !/\.test\.tsx?$/.test(x))) {
      for (const name of exportsOf(f, text.get(f)!)) {
        const by = seen.get(name)!
        const elsewhere = [...by.keys()].some((g) => g !== f)
        if (!elsewhere && (by.get(f) ?? 0) <= 1) unread.push(`${relative(root, f)}: ${name}`)
      }
    }
    expect(unread).toEqual([])
  }, 60_000)
})
