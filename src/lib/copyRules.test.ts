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
 *   3. string literals and JSX text everywhere else in src, in the API
 *      routes and in the push worker, for glyphs, hand-made name joins and
 *      ordinals (their words belong in es-MX.ts, which 1 already reads); the
 *      API's own messages against the term table too.
 *
 * Names are listed with t.common.andList («Camilo, Damián e Iván»), never
 * with commas only: the engine's text is checked against each tournament's
 * names, the source for `.map(name).join(', ')`.
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
import { fillRound, makeCourse, makeFirstTournament, makeGroup, makePlayer, makeSnapshot, makeTee, score } from '../engine/testing/fixtures'
import type { Snapshot } from '../engine/types'
import { courseHandicap, estimateIndex, playingHandicap } from '../engine/core/handicap'
import { handicapText, ordinal, t } from '../i18n/es-MX'
import { formatMoney, formatSignedMoney } from './money'

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')

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
  ['"índice de dificultad": índice de golpe', /índices? de dificultad/i],
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
  ['"vs": contra', word('vs\\.?')],
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

const parsed = new Map<string, Piece[]>()
/** Each file is parsed once, however many rules read it. */
function pieces(file: string): Piece[] {
  let out = parsed.get(file)
  if (!out) parsed.set(file, (out = parse(file)))
  return out
}

function parse(file: string): Piece[] {
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
      // A string the JSX renders as it is ({'vs'}, aria-label="…", title, alt, placeholder) is copy, like JSX text.
      const shown = !!p && (ts.isJsxExpression(p) || (ts.isJsxAttribute(p) && /^(aria-label|title|alt|placeholder|label)$/.test(p.name.getText(sf))))
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) add(node, node.text, false, false, shown)
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

/** `${a} y ${b}`, `.join(' & ')`: a list joined by hand instead of t.common.andList («e» before an i sound). */
const HAND_JOIN = /^\s+(?:y|e|&)\s+$/

/** A list joined with commas or slashes, in any quotes: `.join(', ')`, `.join(" / ")`. */
const COMMA_JOIN = /\.join\(\s*(['"`])\s*[,/]\s*\1\s*\)/
/** On the same line, names: a name lookup, a display or full name, or a list of people by its usual names. */
const NAMES_ON_LINE = /\bname(?:Of|For)?\(|\.map\(\s*(?:name|nameOf)\s*\)|\b(?:displayName|fullName)\b|\b(?:names|holders|winners|members|owners|claims|candidates|people)\b/
/** A line of separate facts (`[club, city].filter(Boolean).join(', ')`) is commas by design, not a list of names. */
const FACTS_LINE = /\]\.filter\(Boolean\)\.join\(/
/** Names listed with commas only: `.map(name).join(', ')`, `…displayName).join(", ")`, `names.join(' / ')`. */
const commaNames = (line: string) => COMMA_JOIN.test(line) && NAMES_ON_LINE.test(line) && !FACTS_LINE.test(line)

/** Two or more of these names in a row with commas only («Camilo, Damián»): t.common.andList ends a list with «y» or «e». */
function commaNameLists(text: string, names: string[]): string[] {
  const alt = [...new Set(names)]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')
  if (!alt) return []
  const one = `(?<![\\p{L}\\p{N}])(?:${alt})(?![\\p{L}\\p{N}])`
  const out: string[] = []
  for (const [run] of text.matchAll(new RegExp(`${one}(?:(?:, | y | e )${one})+`, 'gu'))) {
    if (run.lastIndexOf(', ') > Math.max(run.lastIndexOf(' y '), run.lastIndexOf(' e '))) out.push(run)
  }
  return out
}

/**
 * True exceptions in the source scan, by file (from the repo root) and the
 * source line they sit on. Each says why it is not the mistake its rule looks for.
 */
const ALLOW: Array<{ file: string; line: RegExp; why: string }> = [
  { file: 'src/engine/games/match/index.ts', line: /`Gana \$\{n\} y \$\{bet\.remaining\}`/, why: '«Gana 3 y 2» is how match play writes a result (3 up with 2 to play), not a list of names' },
  { file: 'api/scorecard-extract.ts', line: /índice de dificultad \(handicap\/SI, 1–18\)/, why: 'the prompt that tells the model what a printed card calls the stroke index; nobody reads it in the app' },
]

function walk(dir: string, keep: (name: string) => boolean, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, keep, out)
    else if (keep(name)) out.push(p)
  }
  return out
}
const code = (name: string) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)

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

/**
 * Plus handicaps on a tee rated under par, from an index, an estimate and a
 * number the Comité typed: the negative arithmetic in the handicap
 * explanations (handicap.ts), which no fixture reaches. The three plus
 * handicaps par every hole, so they tie for the second prize and their names
 * take «e» in a list (Íñigo, Iván e Hilario). Camilo makes five birdies on
 * day 1 (44 points), so day 2's cut of 4 is larger than his handicap of 3.
 */
function plusHandicaps(): { snapshot: Snapshot; settings: TournamentSettings } {
  const settings: TournamentSettings = {
    ...DEFAULT_SETTINGS,
    rounds: 2,
    entryFee: 100,
    prizes: { ...DEFAULT_SETTINGS.prizes, stableford: [300, 100] },
    day2Cut: { ...DEFAULT_SETTINGS.day2Cut, maxStrokes: 4 },
  }
  const under = { rating: 70.4, slope: 128, par: 72 }
  const snapshot = makeSnapshot({
    settings,
    rounds: 2,
    courses: [makeCourse('course1', [makeTee('tee1', 'course1', { rating: under.rating, slope: under.slope })])],
    players: [
      makePlayer(1, { displayName: 'Camilo', baseHcp: 3 }),
      makePlayer(2, { displayName: 'Íñigo', handicapSource: 'index', handicapIndex: -1.2, baseHcp: -1.2 }),
      makePlayer(3, { displayName: 'Iván', handicapSource: 'estimate', estimateInputs: [{ gross: 66, ...under }, { gross: 69, ...under }, { gross: 73, ...under }] }),
      makePlayer(4, { displayName: 'Hilario', baseHcp: -2 }),
    ],
  })
  const holes = snapshot.courses[0]!.tees[0]!.holes
  for (const r of ['r1', 'r2']) {
    snapshot.groups.push(makeGroup(r, 1, ['p1', 'p2', 'p3', 'p4']))
    // Day 1: Camilo birdies five holes he gets no stroke on.
    for (const p of snapshot.players) for (const h of holes) snapshot.scores.push(score(r, p.id, h.number, h.par - (r === 'r1' && p.id === 'p1' && h.strokeIndex > 3 && h.number <= 7 ? 1 : 0)))
  }
  snapshot.rounds[0]!.status = 'finished'
  return { snapshot, settings }
}

/**
 * Below zero in a hole's arithmetic: an ace with three strokes received
 * (net −2) and a twelve on a par 4 (points below zero count 0).
 */
function belowZero(): { snapshot: Snapshot; settings: TournamentSettings } {
  const settings: TournamentSettings = { ...DEFAULT_SETTINGS, entryFee: 0, prizes: { ...DEFAULT_SETTINGS.prizes, stableford: [] } }
  const snapshot = makeSnapshot({ settings, rounds: 1, players: [makePlayer(1, { displayName: 'Camilo', baseHcp: 54 }), makePlayer(2, { displayName: 'Damián', baseHcp: 0 })] })
  snapshot.groups.push(makeGroup('r1', 1, ['p1', 'p2']))
  const holes = snapshot.courses[0]!.tees[0]!.holes
  const par3 = holes.find((h) => h.par === 3)!.number
  for (const h of holes) {
    snapshot.scores.push(score('r1', 'p1', h.number, h.number === par3 ? 1 : h.par), score('r1', 'p2', h.number, h.number === 1 ? 12 : h.par))
  }
  return { snapshot, settings }
}

const TOURNAMENTS: Array<{ name: string; snapshot: Snapshot; settings: TournamentSettings }> = [
  { name: 'golden', snapshot: golden(), settings: FIRST_TOURNAMENT_SETTINGS },
  { name: 'plus handicaps', ...plusHandicaps() },
  { name: 'below zero', ...belowZero() },
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
    expect(ordinal('')).toBe('')
    expect(ordinal('–')).toBe('')
    expect(ordinal('T')).toBe('')
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
      // The handicap functions' own titles and steps, below zero (the Comité's preview shows them as they are).
      ...(['title', 'steps'] as const).flatMap((k) => [
        [`playingHandicap ${k}`, [playingHandicap(-3, DEFAULT_SETTINGS.handicap).why[k]].flat().join(' | ')],
        [`courseHandicap ${k}`, [courseHandicap(-1.2, { slope: 128, rating: 70.4, par: 72 }).why[k]].flat().join(' | ')],
        [`estimateIndex ${k}`, [estimateIndex([{ gross: 66, rating: 70.4, slope: 128, par: 72 }, { gross: 69, rating: 70.4, slope: 128, par: 72 }, { gross: 73, rating: 70.4, slope: 128, par: 72 }], DEFAULT_SETTINGS.handicap).why[k]].flat().join(' | ')],
      ] as Array<[string, string]>),
      ['player.handicapLine', t.player.handicapLine(-1.2, 'Índice')],
      ['round.roundFacts', t.profile.roundFacts('Azules', -2)],
      ['admin courseHcp', t.admin.players.courseHcp(-2)],
      ['teams.hcpTotal', t.teams.hcpTotal(-3)],
    ]
    const hits: Hit[] = []
    for (const [where, text] of signed) check(where, text, GLYPHS, hits)
    expect(hits).toEqual([])
  })

  it('writes a plus handicap the way golfers do', () => {
    expect(handicapText(-1.2)).toBe('+1.2')
    expect(handicapText(0)).toBe('0')
    expect(handicapText(-0)).toBe('0')
    expect(handicapText(8.1)).toBe('8.1')
    expect(t.player.handicapLine(-1.2, 'Índice')).toBe('Índice +1.2')
    expect(t.profile.roundFacts('Azules', -2)).toBe('Tee Azules, hándicap de campo +2')
    expect(t.teams.hcpTotal(-3)).toBe('hándicap +3')
  })

  it('ends a list with «y», or «e» before the sound /i/', () => {
    const { andList } = t.common
    expect(andList([])).toBe('')
    expect(andList(['Camilo'])).toBe('Camilo')
    expect(andList(['Camilo', 'Damián'])).toBe('Camilo y Damián')
    expect(andList(['Camilo', 'Damián', 'Ernesto'])).toBe('Camilo, Damián y Ernesto')
    for (const n of ['Iván', 'Íñigo', 'Ignacio', 'Hilario', 'Híjar', 'Ítalo']) expect(andList(['Camilo', n])).toBe(`Camilo e ${n}`)
    // A diphthong keeps «y»: agua y hielo; and so does a consonant y.
    for (const n of ['Hielo', 'Hiago', 'Ian', 'Yolanda']) expect(andList(['Camilo', n])).toBe(`Camilo y ${n}`)
    // Spaces and blanks never reach the copy; a quoted name is read by its first letter.
    expect(andList([' Camilo ', '', ' Iván'])).toBe('Camilo e Iván')
    expect(andList(['Camilo', '«Iván»'])).toBe('Camilo e «Iván»')
    // «o», and «u» before the sound /o/.
    const { orList } = t.common
    expect(orList(['Camilo', 'Damián'])).toBe('Camilo o Damián')
    expect(orList(['Camilo', 'Damián', 'Óscar'])).toBe('Camilo, Damián u Óscar')
    expect(orList(['Camilo', 'Homero'])).toBe('Camilo u Homero')
  })

  it('pays the snake from the bolsa: «pozo» is the Calcutta’s word only', () => {
    expect(t.rules.snake(3, '$200', '$600').join(' ')).not.toMatch(word('pozo'))
    expect(t.rules.auction('$250', '$250', 3, 50, ['Campeón 55%']).join(' ')).toMatch(word('pozo'))
  })
})

describe('copy rules: what the engine writes', () => {
  const states = TOURNAMENTS.map(({ name, snapshot, settings }) => ({ name, snapshot, settings, state: computeTournament(snapshot, settings) }))

  it('covers every fixture and finds the explanations', () => {
    expect(states.length).toBe(FIXTURE_NAMES.length + 3)
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

  it('reaches the arithmetic below zero (the plus handicaps and below zero probes)', () => {
    const text = (name: string) => {
      const s = states.find((x) => x.name === name)!
      return engineCopy(s.state, s.name, []).map(([, x]) => x)
    }
    const plus = text('plus handicaps')
    expect(plus).toContain('Índice +1.2')
    expect(plus).toContain('Índice estimado +1.9')
    expect(plus.some((x) => x.startsWith('Índice +1.2, en la cuenta −1.2, × slope 128'))).toBe(true)
    expect(plus).toContain('Un hándicap de juego no baja de 0: no recibe golpes')
    expect(plus).toContain('Empatados: Íñigo, Iván e Hilario')
    // A typed plus handicap says once how the arithmetic reads it.
    expect(plus).toContain('En la cuenta, −2')
    // A cut larger than the handicap: never «3 − 4 = 0».
    expect(plus).toContain('3 − 4 = −1, no baja de 0: 0')
    const below = text('below zero')
    expect(below).toContain('1 − 3 = −2 neto')
    expect(below).toContain('4 + 0 − 12 + 2 = −6, cuenta 0 pts (doble bogey neto o peor)')
  })

  it('lists names with t.common.andList, never with commas only', () => {
    const hits: Hit[] = []
    for (const s of states) {
      const names = s.snapshot.players.map((p) => p.displayName)
      const copy = [...engineCopy(s.state, s.name, []), ...rulesCopy(s.name, s.settings, s.snapshot)]
      for (const [path, text] of copy) for (const run of commaNameLists(text, names)) hits.push(`${path}: «${run}» in ${JSON.stringify(text)}`)
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

describe('copy rules: the rest of src, the API routes and the push worker', () => {
  // Not product copy: the style guide (/design) and the design fixtures only
  // exist in dev and preview builds (VITE_DESIGN_ROUTES); es-MX.ts is read whole above.
  const SKIP = ['src/design/', 'src/dev/', 'src/i18n/es-MX.ts']
  const files = [...walk(SRC, code), ...walk(join(ROOT, 'api'), code), join(ROOT, 'public/push-sw.js')].filter((f) => !SKIP.some((s) => relative(ROOT, f).startsWith(s)))
  const allowed = (rel: string, lines: string[], n: number) => ALLOW.some((a) => a.file === rel && a.line.test(lines[n - 1] ?? ''))

  it('reads the API routes and the push worker too', () => {
    const rels = files.map((f) => relative(ROOT, f))
    expect(rels).toEqual(expect.arrayContaining(['api/scorecard-extract.ts', 'api/course-search.ts', 'public/push-sw.js']))
  })

  it('has no middle dots, arrows, ampersand joins or hand-made ordinals in strings and JSX text', () => {
    const hits: Hit[] = []
    for (const f of files) {
      const rel = relative(ROOT, f)
      const lines = readFileSync(f, 'utf8').split('\n')
      for (const pc of pieces(f)) {
        if (allowed(rel, lines, pc.line)) continue
        const where = `${rel}:${pc.line}`
        // Straight quotes only in JSX text: string literals in code also carry CSS, JSON and selectors.
        check(where, pc.text, pc.jsx ? [...GLYPHS, QUOTES] : GLYPHS, hits)
        // The term table on anything with a space in it: a bare word is a table, a key or a class name; a phrase is copy.
        if (pc.jsx || pc.text.includes(' ')) check(where, pc.text, TERMS, hits)
        templateRules(where, pc, hits)
        if (HAND_JOIN.test(pc.text)) hits.push(`${where}: names joined by hand (t.common.andList): ${JSON.stringify(pc.text)}`)
      }
    }
    expect(hits).toEqual([])
    // Every file in src, api and the push worker, parsed once: give it room on a loaded machine.
  }, 30_000)

  it('lists names with t.common.andList, never .join(\', \')', () => {
    const hits: Hit[] = []
    for (const f of files) {
      const rel = relative(ROOT, f)
      readFileSync(f, 'utf8')
        .split('\n')
        .forEach((l, i, lines) => {
          if (commaNames(l) && !allowed(rel, lines, i + 1)) hits.push(`${rel}:${i + 1}: names listed with commas only (t.common.andList): ${l.trim()}`)
        })
    }
    expect(hits).toEqual([])
    // Every file in src, api and the push worker, parsed once: give it room on a loaded machine.
  }, 30_000)

  it('the API’s own messages use the term table', () => {
    const hits: Hit[] = []
    for (const f of files.filter((x) => !relative(ROOT, x).startsWith('src/'))) {
      const rel = relative(ROOT, f)
      const lines = readFileSync(f, 'utf8').split('\n')
      // A message has a space in it; a bare word is a table, a header or a key.
      for (const pc of pieces(f)) if (pc.text.includes(' ') && !allowed(rel, lines, pc.line)) check(`${rel}:${pc.line}`, pc.text, TERMS, hits)
    }
    expect(hits).toEqual([])
  })

  it('keeps the allowlist honest (every entry still matches its line)', () => {
    const stale = ALLOW.filter((a) => !readFileSync(join(ROOT, a.file), 'utf8').split('\n').some((l) => a.line.test(l)))
    expect(stale.map((a) => a.file), 'remove these from ALLOW; the line is gone').toEqual([])
  })
})
