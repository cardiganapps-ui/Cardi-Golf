/**
 * COPY-24 (with COPY-22): the copy rules, as a test.
 *
 * DESIGN_DIRECTION.md ("Copy") and the term table in DESIGN_NOTES.md decided
 * them once, and they drifted back anyway: 39 middle dots, arrows in a money
 * list, «1º» beside «1.º», straight quotes beside «», "eagle" and "score"
 * beside «águila» and «tarjeta». So this reads the copy where a player meets
 * it:
 *
 *   1. every string and template in src/i18n/es-MX.ts;
 *   2. what the engine writes (explanations, prize labels, board text,
 *      warnings, the Reglamento, the game catalog) for the golden tournament
 *      and every design fixture;
 *   3. string literals and JSX text everywhere else in src, for glyphs,
 *      hand-made name joins and ordinals (their words belong in es-MX.ts,
 *      which 1 already reads).
 *
 * A failure names the rule, the text and where it came from. True exceptions
 * go in an allowlist below with the reason.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { FIXTURE_NAMES, getFixture } from '../dev/fixtures'
import { computeTournament } from '../engine/computeTournament'
import { ALL_FORMATS } from '../engine/formats'
import { CATEGORY_LABEL, GAME_ENTRIES, MODULE_ENTRIES } from '../engine/games/catalog'
import { describeGame } from '../engine/games/describe'
import { PRESETS } from '../engine/games/presets'
import { QUICK_GAMES, quickSettings } from '../engine/games/quick'
import { moduleRules } from '../engine/settings/describeModule'
import { checkPrizePool, fieldShape } from '../engine/settings/prizeCheck'
import { DEFAULT_SETTINGS, FIRST_TOURNAMENT_SETTINGS } from '../engine/settings/presets'
import { MODULE_IDS, parseSettings, type TournamentSettings } from '../engine/settings/schema'
import { fillRound, makeFirstTournament } from '../engine/testing/fixtures'
import type { Snapshot } from '../engine/types'
import { ordinal, t } from '../i18n/es-MX'
import { formatMoney, formatSignedMoney } from './money'

const SRC = join(process.cwd(), 'src')

/** A whole word, accents included («scores» yes, «escores» no). */
const word = (w: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${w})(?![\\p{L}\\p{N}])`, 'iu')

/** The voice rules (DESIGN_DIRECTION.md, "Copy"; DESIGN_NOTES.md, "Voice rules"). */
const GLYPHS: Array<[string, RegExp]> = [
  ['middle dot as a separator (a comma, a sentence or a second line instead)', /·/],
  ['arrow or glyph in copy (words instead: «paga a», «de 5 a 4», «en»)', /[→←↑↓⇒➜›‹]/],
  ['ordinal without its period («1.º», as ordinal() writes it)', /\dº/],
  ['hyphen used as a minus sign (a true minus: −2)', /(?:^|[\s(:,=])-\d/],
  ['ampersand join (t.common.andList)', / & /],
]
const QUOTES: [string, RegExp] = ['straight double quotes (Spanish quotes are «»)', /"/]

/** The term table in DESIGN_NOTES.md ("Not" column), plus what the 2026-09-30 review found (COPY-22). */
const TERMS: Array<[string, RegExp]> = [
  ['"eagle": águila', word('eagles?')],
  ['"score": tarjeta (or hoyos, resultado)', word('scores?')],
  ['"slot": lugar', word('slots?')],
  ['"hcp" / "PH": hándicap, hándicap de juego', /(?<![\p{L}\p{N}])(?:hcp|Hcp|HCP|PH)(?![\p{L}\p{N}])/u],
  ['"índice de dificultad": índice de golpe', /índice de dificultad/i],
  ['"liga" / "link": enlace', word('ligas?|links?')],
  ['"stats": estadísticas', word('stats')],
  ['"countback": desempate por los últimos hoyos', word('countback')],
  ['"thru": Hoyo, «por el n»', word('thru')],
  ['"bruto": gross', word('brut[oa]s?')],
  ['"anti-sandbag": recorte del día 2', /sandbag/i],
  ['"puntos de ventaja", "Vent.": golpes de ventaja, Ventaja', /puntos de ventaja|(?<![\p{L}])Vent\./iu],
  ['"Sale por el": Salida por el', /(?<![\p{L}])Sale por el\b/u],
  ['"ceros": doble o peor', word('ceros')],
  ['"p" for putts: putts', /\d ?p(?![\p{L}.])/u],
]

type Hit = string

function check(where: string, text: string, rules: Array<[string, RegExp]>, out: Hit[]) {
  for (const [rule, re] of rules) if (re.test(text)) out.push(`${where}: ${rule}: ${JSON.stringify(text)}`)
}

// ---------------------------------------------------------------------------
// Source reading: string literals, template pieces and JSX text, no comments.

interface Piece {
  text: string
  line: number
  /** Right after a `${…}` (a template middle or tail). */
  afterValue: boolean
  /** Right before a `${…}` (a template head or middle). */
  beforeValue: boolean
  jsx: boolean
}

function pieces(file: string): Piece[] {
  const code = readFileSync(file, 'utf8')
  const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const out: Piece[] = []
  const add = (node: ts.Node, text: string, afterValue: boolean, beforeValue: boolean, jsx = false) =>
    out.push({ text, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, afterValue, beforeValue, jsx })
  const visit = (node: ts.Node): void => {
    const p = node.parent
    // Code, not copy: module names, types, object keys and values compared against.
    const code =
      !!p &&
      (ts.isImportDeclaration(p) ||
        ts.isExportDeclaration(p) ||
        ts.isLiteralTypeNode(p) ||
        (ts.isPropertyAssignment(p) && p.name === node) ||
        (ts.isBinaryExpression(p) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(p.operatorToken.kind)) ||
        ts.isCaseClause(p) ||
        ts.isElementAccessExpression(p))
    if (!code) {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) add(node, node.text, false, false)
      else if (ts.isTemplateHead(node)) add(node, node.text, false, true)
      else if (ts.isTemplateMiddle(node)) add(node, node.text, true, true)
      else if (ts.isTemplateTail(node)) add(node, node.text, true, false)
      else if (ts.isJsxText(node) && node.text.trim()) add(node, node.text, false, false, true)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

/** Rules that only show in a template's pieces: what sits next to a `${…}`. */
function templateRules(where: string, pc: Piece, out: Hit[]) {
  // `${n}º`: an ordinal built from a number, without its period.
  if (pc.afterValue && pc.text.startsWith('º')) out.push(`${where}: ordinal without its period («1.º», as ordinal() writes it): ${JSON.stringify(pc.text)}`)
  // `-${n}`, `(-${n})`: a hyphen in front of a number. (`${a}-${b}` joins two values: a key, a date, a file name.)
  if (pc.beforeValue && (pc.afterValue ? /[\s(:,=]-$/ : /(?:^|[\s(:,=])-$/).test(pc.text)) out.push(`${where}: hyphen used as a minus sign (a true minus: −2): ${JSON.stringify(pc.text)}`)
  // `${n} p`: "p" for putts.
  if (pc.afterValue && /^ ?p(?![\p{L}.])/u.test(pc.text)) out.push(`${where}: "p" for putts: putts: ${JSON.stringify(pc.text)}`)
}

/** `${a} y ${b}`, `.join(' & ')`: a list joined by hand instead of t.common.andList (Intl, «e» before an i sound). */
const HAND_JOIN = /^\s+(?:y|e|&)\s+$/

/**
 * True exceptions in the source scan, by file (under src/) and the source
 * line they sit on. Each says why it is not the mistake its rule looks for.
 */
const ALLOW: Array<{ file: string; line: RegExp; why: string }> = [
  { file: 'engine/games/match/index.ts', line: /`Gana \$\{n\} y \$\{bet\.remaining\}`/, why: '«Gana 3 y 2» is how match play writes a result (3 up with 2 to play), not a list of names' },
]

function walkSrc(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walkSrc(p, out)
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

// ---------------------------------------------------------------------------
// The engine's own words, on every tournament we have.

/** The golden tournament (golden.test.ts): finished, all six modules, a Calcutta and a buyback. */
function golden(): Snapshot {
  const snap = makeFirstTournament()
  fillRound(snap, 'r1', 11)
  fillRound(snap, 'r2', 12)
  snap.rounds.forEach((r) => (r.status = 'finished'))
  snap.tournament.status = 'finished'
  snap.players.forEach((p, i) => {
    snap.calcuttaLots.push({ id: `lot${i + 1}`, playerId: p.id, lotNumber: i + 1, status: 'sold', price: 250 + 250 * (i % 4), ownerId: snap.players[(i + 1) % 12]!.id, soldAt: '' })
  })
  snap.calcuttaBuybacks.push({ lotId: 'lot1', pct: 50, amount: 125, paid: false })
  for (let i = 0; i < 20; i++) {
    const pending = computeTournament(snap, FIRST_TOURNAMENT_SETTINGS).flags.pendingSnakeTiebreaks
    if (!pending.length) break
    for (const q of pending) snap.snakeTiebreaks.push({ roundId: q.roundId, groupId: q.groupId, hole: q.hole, lastHoledPlayerId: q.candidates[0]! })
  }
  return snap
}

const TOURNAMENTS: Array<{ name: string; snapshot: Snapshot; settings: TournamentSettings }> = [
  { name: 'golden', snapshot: golden(), settings: FIRST_TOURNAMENT_SETTINGS },
  ...FIXTURE_NAMES.map((name) => {
    const f = getFixture(name)!
    return { name, snapshot: f.snapshot, settings: parseSettings(f.snapshot.tournament.settings) }
  }),
]

/** Keys whose strings are copy (the rest are ids, kinds and tones). */
const COPY_KEYS = new Set(['title', 'steps', 'label', 'text', 'detail', 'figure', 'sub', 'notes', 'warnings', 'name', 'figureLabel', 'slotLabel', 'pos', 'message', 'poolWarning'])

/** Every copy string in a computed state, with its path. `settings` is input, not output. */
function engineCopy(v: unknown, path: string, out: Array<[string, string]>, copy = false): Array<[string, string]> {
  if (typeof v === 'string') {
    if (copy) out.push([path, v])
  } else if (Array.isArray(v)) v.forEach((x, i) => engineCopy(x, `${path}[${i}]`, out, copy))
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k !== 'settings') engineCopy(x, `${path}.${k}`, out, copy || COPY_KEYS.has(k))
  return out
}

/** The Reglamento, the format sheets, the catalog and the prize statement, for these settings. */
function rulesCopy(name: string, settings: TournamentSettings, snapshot?: Snapshot): Array<[string, string]> {
  const out: Array<[string, string]> = []
  const field = snapshot ? fieldShape(snapshot, settings) : { players: 12 }
  for (const id of MODULE_IDS) moduleRules(id, settings, field, 'Nacho').forEach((s, i) => out.push([`${name} Reglamento ${id}[${i}]`, s]))
  for (const g of settings.games) describeGame(g).forEach((s, i) => out.push([`${name} Reglamento ${g.id}[${i}]`, s]))
  const pool = checkPrizePool(settings, field)
  for (const l of [...pool.lines, ...pool.sidePots, ...pool.bets]) out.push([`${name} prize statement`, `${l.label}: ${l.detail}`])
  return out
}

const FORMAT_VARIANTS: TournamentSettings[] = [
  DEFAULT_SETTINGS,
  ...(['strokePlay', 'matchPlay', 'team'] as const).flatMap((format) =>
    [
      { scoring: 'net', matchMode: 'singles', teamMode: 'bestBall', teamScoring: 'strokes' },
      { scoring: 'gross', matchMode: 'fourball', teamMode: 'scramble', teamScoring: 'stableford' },
      { scoring: 'net', matchMode: 'fourball', teamMode: 'shamble', teamScoring: 'strokes' },
    ].map((formatOptions) => ({ ...DEFAULT_SETTINGS, modules: { ...DEFAULT_SETTINGS.modules, individual: { ...DEFAULT_SETTINGS.modules.individual, format, formatOptions } } }) as TournamentSettings),
  ),
]

function catalogCopy(): Array<[string, string]> {
  const out: Array<[string, string]> = []
  for (const s of FORMAT_VARIANTS) {
    const d = ALL_FORMATS[s.modules.individual.format].describe(s)
    for (const line of [d.title, ...d.steps]) out.push([`format ${s.modules.individual.format}`, line])
  }
  for (const m of MODULE_ENTRIES) for (const line of [m.blurb, m.later]) if (line) out.push([`catalog ${m.id}`, line])
  for (const g of GAME_ENTRIES) {
    for (const line of [g.title, g.blurb, g.later]) if (line) out.push([`catalog ${g.key}`, line])
    describeGame(g.create(g.key)).forEach((line) => out.push([`catalog ${g.key} rules`, line]))
  }
  for (const p of PRESETS) {
    out.push([`preset ${p.id}`, p.name], [`preset ${p.id}`, p.blurb])
    out.push(...rulesCopy(`preset ${p.id}`, p.build()))
  }
  for (const label of Object.values(CATEGORY_LABEL)) out.push(['catalog category', label])
  out.push(...rulesCopy('quick round', quickSettings({ games: [...QUICK_GAMES], money: true, entryFee: 300, players: 8 })))
  return out
}

// ---------------------------------------------------------------------------

describe('copy rules: es-MX.ts', () => {
  const file = join(SRC, 'i18n/es-MX.ts')
  const all = pieces(file)

  it('reads the whole catalog (the parser did not lose the file)', () => {
    expect(all.length).toBeGreaterThan(1500)
  })

  it('has no middle dots, arrows, straight quotes, hand-made ordinals, hyphen minus signs or ampersand joins', () => {
    const hits: Hit[] = []
    for (const pc of all) {
      const where = `es-MX.ts:${pc.line}`
      check(where, pc.text, [...GLYPHS, QUOTES], hits)
      templateRules(where, pc, hits)
    }
    expect(hits).toEqual([])
  })

  it('joins names with t.common.andList, never by hand', () => {
    const hits = all.filter((pc) => HAND_JOIN.test(pc.text)).map((pc) => `es-MX.ts:${pc.line}: ${JSON.stringify(pc.text)}`)
    expect(hits).toEqual([])
  })

  it('uses the term table', () => {
    const hits: Hit[] = []
    for (const pc of all) check(`es-MX.ts:${pc.line}`, pc.text, TERMS, hits)
    expect(hits).toEqual([])
  })

  it('writes ordinals one way, and negatives with a true minus', () => {
    expect(ordinal('3')).toBe('3.º')
    expect(ordinal('T3')).toBe('empatado en 3.º')
    // Formatters that take a value that can be negative, fed a negative.
    const signed: Array<[string, string]> = [
      ['stats.unit pct', t.stats.unit('pct', -1)],
      ['stats.unit points', t.stats.unit('points', -3)],
      ['social.strokesFigure', t.social.strokesFigure(-2)],
      ['social.strokesMine', t.social.strokesMine(-2, 'Camilo')],
      ['social.suggest', t.social.suggest(-3)],
      ['social.resultLine', t.social.resultLine(74, 76, -2)],
      ['quick.rivalryLine', t.quick.rivalryLine('Camilo', -2)],
      ['player.dayHcp', t.player.dayHcp(2, 10, 2)],
      ['formatMoney', formatMoney(-300)],
      ['formatSignedMoney', formatSignedMoney(-300)],
    ]
    const hits: Hit[] = []
    for (const [where, text] of signed) check(where, text, GLYPHS, hits)
    expect(hits).toEqual([])
  })

  it('pays the snake from the bolsa: «pozo» is the Calcutta’s word only', () => {
    expect(t.rules.snake(3, '$200', '$600').join(' ')).not.toMatch(word('pozo'))
    expect(t.rules.auction('$250', '$250', 3, 50, ['Campeón 55%']).join(' ')).toMatch(word('pozo'))
  })
})

describe('copy rules: what the engine writes', () => {
  const states = TOURNAMENTS.map(({ name, snapshot, settings }) => ({ name, snapshot, settings, state: computeTournament(snapshot, settings) }))

  it('covers every fixture and finds the explanations', () => {
    expect(states.length).toBe(FIXTURE_NAMES.length + 1)
    const copy = states.flatMap((s) => engineCopy(s.state, s.name, []))
    expect(copy.some(([path]) => /\.why\.steps/.test(path))).toBe(true)
    expect(copy.length).toBeGreaterThan(5000)
  })

  it('explanations, labels and board text follow the voice rules and the term table', () => {
    const hits: Hit[] = []
    for (const s of states) {
      for (const [path, text] of engineCopy(s.state, s.name, [])) {
        check(path, text, [...GLYPHS, QUOTES], hits)
        check(path, text, TERMS, hits)
      }
    }
    expect([...new Set(hits)]).toEqual([])
  })

  it('the Reglamento, the format sheets, the catalog and the prize statements do too', () => {
    const copy = [...states.flatMap((s) => rulesCopy(s.name, s.settings, s.snapshot)), ...catalogCopy()]
    const hits: Hit[] = []
    for (const [where, text] of copy) {
      check(where, text, [...GLYPHS, QUOTES], hits)
      check(where, text, TERMS, hits)
    }
    expect([...new Set(hits)]).toEqual([])
  })

  it('never calls the snake’s money «pozo»', () => {
    const hits: Hit[] = []
    for (const s of states) {
      const snake = [...engineCopy(s.state.modules.snake ?? {}, `${s.name}.modules.snake`, [], true), ...engineCopy(s.state.prizes.filter((p) => p.moduleId === 'snake'), `${s.name}.prizes(snake)`, [], true)]
      for (const [path, text] of snake) if (word('pozo').test(text)) hits.push(`${path}: ${JSON.stringify(text)}`)
    }
    expect(hits).toEqual([])
  })
})

describe('copy rules: the rest of src', () => {
  // Not product copy: the style guide (/design) and the design fixtures only
  // exist in dev and preview builds (VITE_DESIGN_ROUTES); es-MX.ts is read whole above.
  const SKIP = ['design/', 'dev/', 'i18n/es-MX.ts']
  const files = walkSrc(SRC).filter((f) => !SKIP.some((s) => relative(SRC, f).startsWith(s)))

  it('has no middle dots, arrows, ampersand joins or hand-made ordinals in strings and JSX text', () => {
    const hits: Hit[] = []
    for (const f of files) {
      const rel = relative(SRC, f)
      const lines = readFileSync(f, 'utf8').split('\n')
      const allowed = (n: number) => ALLOW.some((a) => a.file === rel && a.line.test(lines[n - 1] ?? ''))
      for (const pc of pieces(f)) {
        if (allowed(pc.line)) continue
        const where = `${rel}:${pc.line}`
        // Straight quotes only in JSX text: string literals in code also carry CSS, JSON and selectors.
        check(where, pc.text, pc.jsx ? [...GLYPHS, QUOTES] : GLYPHS, hits)
        templateRules(where, pc, hits)
        if (HAND_JOIN.test(pc.text)) hits.push(`${where}: names joined by hand (t.common.andList): ${JSON.stringify(pc.text)}`)
      }
    }
    expect(hits).toEqual([])
  })

  it('keeps the allowlist honest (every entry still matches its line)', () => {
    const stale = ALLOW.filter((a) => !readFileSync(join(SRC, a.file), 'utf8').split('\n').some((l) => a.line.test(l)))
    expect(stale.map((a) => a.file), 'remove these from ALLOW; the line is gone').toEqual([])
  })
})
