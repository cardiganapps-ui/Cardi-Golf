/**
 * ARCH-05: the engine computes and the copy lives in src/i18n. The engine
 * used to write its own Spanish (287 strings) and format money three ways;
 * its explanations and warnings are now codes (`messages.ts`) that
 * src/i18n/explain.ts puts in words. This fails on Spanish copy in
 * src/engine: a string or template with a Spanish letter, two words, or one
 * capitalized word, outside code positions (imports, types, object keys,
 * comparisons, `case` labels).
 *
 * `copyRemaining.json` says what may still be there:
 *   - `keep`: copy that is settings data, kept on purpose, by the property it
 *     is the value of (a game's `defaultLabel` is what a new tournament
 *     stores, and the organizer renames it), anywhere or in one file;
 *   - `remaining`: copy still in the engine, by file, as a count that may
 *     only go down (a file with more copy than its count fails, and so does
 *     one with less, until the count is lowered with it), each with its
 *     reason in `residue`. Since ARCH-05's later stages (the rules, the
 *     catalog, the labels and boards of the computed state) one file is left.
 * The engine imports nothing of src/i18n (`i18nImports`, empty).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import baseline from './copyRemaining.json'

const ROOT = process.cwd()
const ENGINE = join(ROOT, 'src/engine')

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (name !== 'testing') files(p, out)
    } else if (/\.ts$/.test(name) && !/\.test\.ts$/.test(name)) out.push(p)
  }
  return out
}

/** Spanish copy: a Spanish letter or sign, two words, or a single capitalized word («Redondeo», «Total»). */
const COPY = /[áéíóúñüÁÉÍÓÚÑ¿¡«»]|\p{L}{2,}\s+\p{L}{2,}|^\s*[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\s*$/u

const keep = baseline.keep as { anywhere: Record<string, string>; files: Record<string, string[]> }

function copyIn(file: string, rel: string): string[] {
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const out: string[] = []
  /** Settings data: the value of a property `keep` names. */
  const kept = (node: ts.Node) => {
    const p = node.parent
    if (!p || !ts.isPropertyAssignment(p) || p.initializer !== node) return false
    const name = p.name.getText(sf)
    return name in keep.anywhere || !!keep.files[rel]?.includes(name)
  }
  const visit = (node: ts.Node): void => {
    const p = node.parent
    const code =
      !!p &&
      (ts.isImportDeclaration(p) ||
        ts.isExportDeclaration(p) ||
        ts.isLiteralTypeNode(p) ||
        ((ts.isPropertyAssignment(p) || ts.isPropertySignature(p)) && p.name === node) ||
        (ts.isBinaryExpression(p) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(p.operatorToken.kind)) ||
        ts.isCaseClause(p) ||
        ts.isElementAccessExpression(p))
    if (!code) {
      let text: string | null = null
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) text = node.text
      else if (ts.isTemplateExpression(node)) text = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join(' ')
      if (text != null && COPY.test(text) && !kept(node)) out.push(text)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

const imports = (file: string) => /from '(?:\.\.\/)+i18n\//.test(readFileSync(file, 'utf8'))

const ALL = files(ENGINE).map((f) => ({ file: relative(ROOT, f), copy: copyIn(f, relative(ROOT, f)), i18n: imports(f) }))
const remaining = baseline.remaining as Record<string, number>
const i18nRemaining = new Set(baseline.i18nImports as string[])

describe('the engine writes no copy (ARCH-05)', () => {
  it('reads the engine (the scanner did not lose its files)', () => {
    expect(ALL.length).toBeGreaterThan(60)
    expect(ALL.some((f) => f.file === 'src/engine/messages.ts')).toBe(true)
  })

  it('has no Spanish copy beyond what copyRemaining.json lists, and lists no more than there is', () => {
    const over: string[] = []
    const under: string[] = []
    for (const f of ALL) {
      const allowed = remaining[f.file] ?? 0
      if (f.copy.length > allowed) over.push(`${f.file}: ${f.copy.length} (allowed ${allowed}): ${f.copy.slice(0, 5).map((c) => JSON.stringify(c)).join(', ')}`)
      else if (f.copy.length < allowed) under.push(`${f.file}: ${f.copy.length}, lower its count from ${allowed}`)
    }
    expect(over, 'copy belongs in src/i18n: give it a code in messages.ts and its words in es-MX.ts').toEqual([])
    expect(under).toEqual([])
    for (const file of [...Object.keys(remaining), ...Object.keys(keep.files)]) expect(ALL.some((f) => f.file === file), `${file} is listed but gone`).toBe(true)
    // What is left says why it is left.
    for (const file of Object.keys(remaining)) expect((baseline as { residue?: Record<string, string> }).residue?.[file], `${file} has copy left and no reason in residue`).toBeTruthy()
  })

  it('imports src/i18n only from the files that still write copy', () => {
    expect(ALL.filter((f) => f.i18n && !i18nRemaining.has(f.file)).map((f) => f.file)).toEqual([])
    expect([...i18nRemaining].filter((file) => !ALL.find((f) => f.file === file)?.i18n)).toEqual([])
  })

  it('the files that hold the codes and their figures write none', () => {
    const files = [
      ...['src/engine/messages.ts', 'src/engine/core/compute.ts', 'src/engine/core/handicap.ts', 'src/engine/core/ranking.ts', 'src/engine/close.ts', 'src/engine/computeTournament.ts', 'src/engine/core/unassigned.ts'],
      // ARCH-05 stage 2: the rules, the catalog's rules and the settings' checks.
      ...['src/engine/games/describe.ts', 'src/engine/settings/describeModule.ts', 'src/engine/settings/reglamento.ts', 'src/engine/settings/prizeCheck.ts', 'src/engine/settings/sense.ts', 'src/engine/settings/schema.ts', 'src/engine/settings/games.ts'],
      // Stage 3: the computed state's labels and the games' boards.
      ...['src/engine/core/money.ts', 'src/engine/games/payout.ts', 'src/engine/formats/entrants.ts', 'src/engine/formats/bracket.ts', 'src/engine/modules/auction/index.ts', 'src/engine/games/match/index.ts', 'src/engine/games/skins/index.ts'],
    ]
    for (const file of files) {
      expect(ALL.find((f) => f.file === file)?.copy, file).toEqual([])
    }
  })
})
