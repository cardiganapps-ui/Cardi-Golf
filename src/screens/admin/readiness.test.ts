/**
 * UX-06: «Para empezar» lists what a tournament still needs before its next
 * tee. The wizard asked «¿Cuántos días?» and created no rounds, and nothing
 * told a new organizer what was missing. The later blocks pin what the
 * verifiers found the list got wrong: lines that nag about nothing, send you
 * where you can't fix them, or say «Listo» too early.
 */
import { describe, expect, it } from 'vitest'
import { getFixture } from '../../dev/fixtures'
import { dataFromSnapshot } from '../../data/tournamentStore'
import { nextRoundGroups } from '../../engine/formats/bracket'
import { makeCourse, makeRound, makeTee } from '../../engine/testing/fixtures'
import type { TournamentSettings } from '../../engine/settings/schema'
import type { Snapshot } from '../../engine/types'
import { checkedText, coveredByChecklist, hrefOf, readiness, setupBadge, type Entry, type ReadinessItem } from './readiness'

type Items = Partial<Record<ReadinessItem['id'], ReadinessItem>>

function run(name: string, edit?: (s: Snapshot) => void, entry?: (s: Snapshot) => Partial<Entry>) {
  const snapshot = structuredClone(getFixture(name)!.snapshot)
  edit?.(snapshot)
  const d = dataFromSnapshot(snapshot)
  const e: Entry = { pins: new Set(d.snapshot.players.map((p) => p.id)), bracket: d.state.bracket, ...entry?.(d.snapshot) }
  const items = readiness(d.snapshot, d.settings, e)
  const badge = setupBadge(items, d.state.flags.warnings, d.state.flags.missingModules.length)
  return { d, items, badge, by: Object.fromEntries(items.map((i) => [i.id, i])) as Items }
}
const check = (name: string, edit?: (s: Snapshot) => void, entry?: (s: Snapshot) => Partial<Entry>) => run(name, edit, entry).by
const open = (items: ReadinessItem[]) => items.filter((i) => !i.done)
/** The fixture's settings as stored (jsonb), to edit in place. */
const settingsOf = (s: Snapshot) => s.tournament.settings as TournamentSettings

/** A match-play fixture set up for `days` days, nothing played, no groups yet. */
function knockout(s: Snapshot, opts: { players?: number; days: number; rounds?: number }) {
  s.players = s.players.slice(0, opts.players ?? s.players.length)
  s.tournament.status = 'setup'
  s.tournament.settings = { ...settingsOf(s), rounds: opts.days }
  s.rounds = Array.from({ length: opts.rounds ?? opts.days }, (_, i) => makeRound(i + 1, { status: 'scheduled', date: `2027-06-1${i + 2}` }))
  s.groups = []
  s.scores = []
}
/** The bracket's own first-round matches as groups (what Grupos' «Armar los grupos» writes). */
function groupTheBracket(s: Snapshot) {
  const first = dataFromSnapshot(s).state.bracket!.rounds[0]!
  first.matches.filter((m) => m.sides[1]).forEach((m, i) => s.groups.push({ id: `g${i}`, roundId: first.roundId!, number: i + 1, teeTime: null, startHole: 1, playerIds: [...m.sides[0].playerIds, ...m.sides[1]!.playerIds] }))
  return first
}

describe('Para empezar', () => {
  it('a tournament seconds after «Crear torneo»: players and the rounds\' course and date are missing', () => {
    const r = check('new-setup')
    expect(r.players).toMatchObject({ done: false, text: 'Da de alta a los jugadores (al menos 2)', to: 'jugadores' })
    expect(r.rounds).toMatchObject({ done: true, text: '2 rondas creadas' })
    expect(r.roundSetup).toMatchObject({ done: false, text: 'Falta campo o fecha: día 1 y día 2', to: 'rondas' })
    // Nothing to say yet about a card, tees or groups.
    expect(r.card).toBeUndefined()
    expect(r.tees).toBeUndefined()
    expect(r.groups).toBeUndefined()
  })

  it('the days asked for and never created count as missing rounds', () => {
    const r = check('new-setup', (s) => {
      s.rounds = []
    })
    expect(r.rounds).toMatchObject({ done: false, text: 'Faltan 2 rondas por crear', to: 'rondas' })
  })

  it('a set-up tournament is all done', () => {
    const r = check('minimal4-setup')
    expect(Object.values(r).every((i) => i!.done)).toBe(true)
    // One tee on the course: nothing to choose, so no tee line.
    expect(Object.keys(r).sort()).toEqual(['card', 'groups', 'pins', 'players', 'roundSetup', 'rounds'])
  })

  it('players without a PIN are counted; with the PINs unknown the line is left out', () => {
    expect(check('minimal4-setup', undefined, () => ({ pins: new Set(['p1', 'p2']) })).pins).toMatchObject({ done: false, text: 'A 2 jugadores les falta su PIN' })
    expect(check('minimal4-setup', undefined, () => ({ pins: null })).pins).toBeUndefined()
  })

  it('a player with no tee on a course with several tees is counted, and told which tee he would get', () => {
    const r = check('minimal4-setup', (s) => {
      s.courses[0]!.tees.push(makeTee('tee2', s.courses[0]!.id, { name: 'Blancas' }))
      s.players.find((p) => p.id === 'p3')!.defaultTeeId = null
    })
    expect(r.tees).toMatchObject({ done: false, text: '1 jugador sin tee para el día 1: saldría desde Azules', to: 'rondas' })
    const two = check('minimal4-setup', (s) => {
      s.courses[0]!.tees.push(makeTee('tee2', s.courses[0]!.id, { name: 'Blancas' }))
      for (const id of ['p3', 'p4']) s.players.find((p) => p.id === id)!.defaultTeeId = null
    })
    expect(two.tees).toMatchObject({ done: false, text: '2 jugadores sin tee para el día 1: saldrían desde Azules' })
  })

  it('groups: none for the next round, or someone left out; the line opens Grupos on that day', () => {
    expect(check('minimal4-setup', (s) => (s.groups = [])).groups).toMatchObject({ done: false, text: 'Arma los grupos del día 1', to: 'grupos', roundId: 'r1' })
    expect(check('minimal4-setup', (s) => (s.groups[0]!.playerIds = ['p1', 'p2', 'p3'])).groups).toMatchObject({ done: false, text: '1 jugador sin grupo el día 1' })
  })

  it('«Listo para jugar» names what was checked, and nothing else', () => {
    expect(checkedText(run('minimal4-setup').items)).toBe('jugadores, PIN, rondas, campo y grupos')
    const twoTees = run('minimal4-setup', (s) => {
      s.courses[0]!.tees.push(makeTee('tee2', s.courses[0]!.id, { name: 'Blancas' }))
    })
    expect(checkedText(twoTees.items)).toBe('jugadores, PIN, rondas, campo, tees y grupos')
    expect(checkedText(run('team8', (s) => (s.tournament.status = 'setup')).items)).toBe('jugadores, PIN, rondas, campo, equipos y grupos')
  })
})

describe('Para empezar: what the first list got wrong', () => {
  it('a single-tee course: players with no tee play it, and nothing nags (P2)', () => {
    const r = check('minimal4-setup', (s) => {
      for (const p of s.players) p.defaultTeeId = null
    })
    expect(r.tees).toBeUndefined()
    expect(Object.values(r).every((i) => i!.done)).toBe(true)
  })

  it('match play: the seeds with a bye need no group on day 1 while the bracket goes on to day 2 (P2)', () => {
    const r = check('match8', (s) => {
      // Six players over three days: the bracket gives the top two a bye; day 1's groups are its two matches.
      knockout(s, { players: 6, days: 3 })
      const first = groupTheBracket(s)
      expect(first.matches.filter((m) => !m.sides[1])).toHaveLength(2)
    })
    expect(r.groups).toMatchObject({ done: true, text: 'Grupos del día 1 listos' })
  })

  it('match play: the knocked out need no group in the semifinal (P2)', () => {
    const r = check('bracket8', (s) => {
      const { state } = dataFromSnapshot(s)
      const semis = nextRoundGroups(state.bracket!)!
      semis.groups.forEach((ids, i) => s.groups.push({ id: `semi${i}`, roundId: semis.round.roundId!, number: i + 1, teeTime: null, startHole: 1, playerIds: ids }))
    })
    expect(r.groups).toMatchObject({ done: true, text: 'Grupos del día 2 listos', roundId: 'r2' })
  })

  it('a cancelled round is not a missing one, and is not checked (P3)', () => {
    const r = check('new-setup', (s) => {
      s.rounds[1]!.status = 'cancelled'
    })
    expect(r.rounds).toMatchObject({ done: true, text: '2 rondas creadas' })
    expect(r.roundSetup).toMatchObject({ done: false, text: 'Falta campo o fecha: día 1' })
  })

  it('more rounds than days is flagged, with what to do: raise the days in Reglas, or delete the extra one (P3, N10)', () => {
    const r = check('new-setup', (s) => {
      s.rounds.push({ ...s.rounds[1]!, id: 'r3', number: 3 })
    })
    expect(r.rounds).toMatchObject({ done: false, text: '3 rondas para un torneo de 2 días: sube los días en Reglas o borra la que sobra', to: 'torneo', tab: 'reglas' })
    // Reglas is a tab of Torneo: the line opens it.
    expect(hrefOf('viaje', r.rounds!)).toBe('/t/viaje/admin/torneo?pestana=reglas')
  })

  it('the card is checked on the tee each player plays, not on any tee (P3)', () => {
    const r = check('minimal4-setup', (s) => {
      // A second tee with only nine holes loaded, and one player on it.
      s.courses[0]!.tees.push(makeTee('tee9', s.courses[0]!.id, { name: 'Rojas', holes: s.courses[0]!.tees[0]!.holes.slice(0, 9) }))
      s.players.find((p) => p.id === 'p4')!.defaultTeeId = 'tee9'
    })
    expect(r.card).toMatchObject({ done: false, text: 'Falta la tarjeta del campo (par e índice de golpe): día 1', to: 'campos' })
  })

  it('a card still as «Capturar a mano» left it (par 4 everywhere) is not a card, and the line says to capture it (P3, N10)', () => {
    const r = check('minimal4-setup', (s) => {
      s.courses[0]!.tees[0]!.holes = s.courses[0]!.tees[0]!.holes.map((h) => ({ ...h, par: 4, strokeIndex: h.number }))
    })
    expect(r.card).toMatchObject({ done: false, text: 'Captura la tarjeta (sigue en par 4 en todos los hoyos): día 1', to: 'campos' })
  })

  it('an 18-hole round on a 9-hole course sends you to Rondas, saying what to change there (P3, N10)', () => {
    const r = check('minimal4-setup', (s) => {
      s.courses[0]!.tees[0]!.holes = s.courses[0]!.tees[0]!.holes.slice(0, 9)
    })
    expect(r.card).toMatchObject({ done: false, text: 'Cambia la ronda a 9 hoyos (el campo tiene 9): día 1', to: 'rondas' })
    // Set the round to nine holes and the card is complete.
    expect(
      check('minimal4-setup', (s) => {
        s.courses[0]!.tees[0]!.holes = s.courses[0]!.tees[0]!.holes.slice(0, 9)
        s.rounds[0]!.holes = 9
      }).card,
    ).toMatchObject({ done: true })
  })

  it('a player confirmed-linked to an account gets in without a PIN (P3)', () => {
    const r = check('minimal4-setup', undefined, () => ({ pins: new Set(['p1', 'p2', 'p3']), linked: new Set(['p4']) }))
    expect(r.pins).toMatchObject({ done: true })
  })

  it('a team format with no teams has a line for them (P3)', () => {
    const r = check('team8', (s) => {
      s.teams = []
      s.pairs = []
    })
    expect(r.teams).toMatchObject({ done: false, text: 'Arma los equipos', to: 'equipos' })
    expect(check('team8').teams).toMatchObject({ done: true, text: '4 equipos armados' })
  })

  it('the Torneo tab counts each open thing once (P3)', () => {
    // A new tournament with players: the engine warns «sin campo cargado» for each day, and the list already says it.
    const fresh = run('new-setup', (s) => {
      s.players = structuredClone(getFixture('minimal4-setup')!.snapshot.players)
    })
    expect(fresh.d.state.flags.warnings.length).toBe(2)
    expect(fresh.d.state.flags.warnings.every((w) => coveredByChecklist(w, fresh.items))).toBe(true)
    expect(fresh.badge).toBe(open(fresh.items).length)
    // A team format with no teams: the engine's warning and the list's line are one thing.
    const team = run('team8', (s) => {
      s.teams = []
      s.pairs = []
    })
    expect(team.d.state.flags.warnings.some((w) => coveredByChecklist(w, team.items))).toBe(true)
    expect(setupBadge(team.items, team.d.state.flags.warnings.filter((w) => coveredByChecklist(w, team.items)), 0)).toBe(open(team.items).length)
    // A warning the list does not cover still counts.
    expect(setupBadge(fresh.items, [...fresh.d.state.flags.warnings, 'La bolsa no cuadra'], 1)).toBe(open(fresh.items).length + 2)
  })
})

describe('Para empezar: «Listo» only when the day can be played (N1)', () => {
  it('fourball match play with no pairs: a line for them, opening Equipos (where fourball pairs are drawn)', () => {
    const fourball = (s: Snapshot) => {
      knockout(s, { days: 3 })
      settingsOf(s).modules.individual.formatOptions.matchMode = 'fourball'
    }
    const r = run('match8', fourball)
    expect(r.by.pairs).toMatchObject({ done: false, text: 'Arma las parejas del fourball', to: 'equipos' })
    // Foursomes drawn on every day without pairs: the engine's «necesita dos parejas» warnings are that same line.
    const drawn = run('match8', (s) => {
      fourball(s)
      for (const rd of s.rounds) {
        s.groups.push({ id: `${rd.id}a`, roundId: rd.id, number: 1, teeTime: null, startHole: 1, playerIds: ['p1', 'p2', 'p3', 'p4'] })
        s.groups.push({ id: `${rd.id}b`, roundId: rd.id, number: 2, teeTime: null, startHole: 1, playerIds: ['p5', 'p6', 'p7', 'p8'] })
      }
    })
    expect(drawn.d.state.flags.warnings.filter((w) => /fourball necesita dos parejas/.test(w))).toHaveLength(6)
    expect(drawn.by.pairs).toMatchObject({ done: false })
    expect(drawn.badge).toBe(open(drawn.items).length)
    // Four pairs drawn: two pairs a match, and the line is done.
    const paired = check('match8', (s) => {
      fourball(s)
      s.teams = [0, 1, 2, 3].map((i) => ({ id: `tm${i}`, name: null, number: i + 1, playerIds: [`p${2 * i + 1}`, `p${2 * i + 2}`], drawnAt: null }))
    })
    expect(paired.pairs).toMatchObject({ done: true, text: '4 parejas armadas' })
  })

  it('a team format counts the players on no team', () => {
    const r = check('team8', (s) => {
      s.pairs = s.pairs.slice(0, 1)
    })
    expect(r.teams).toMatchObject({ done: false, text: '6 jugadores sin equipo', to: 'equipos' })
  })

  it('singles in groups of four and three: the groups are not the bracket\'s matches, and the line stays open', () => {
    const r = run('match8', (s) => {
      knockout(s, { players: 7, days: 3 })
      s.groups = [
        { id: 'a', roundId: 'r1', number: 1, teeTime: null, startHole: 1, playerIds: ['p1', 'p2', 'p3', 'p4'] },
        { id: 'b', roundId: 'r1', number: 2, teeTime: null, startHole: 1, playerIds: ['p5', 'p6', 'p7'] },
      ]
    })
    // 7 players: the top seed has a bye, and the three matches have no group of their own.
    expect(r.by.groups).toMatchObject({ done: false, text: 'Arma los grupos de 3 partidos del día 1', to: 'grupos', roundId: 'r1' })
    // The engine's two «exactamente dos jugadores» warnings are this line, counted once.
    expect(r.d.state.flags.warnings.filter((w) => /exactamente dos jugadores/.test(w))).toHaveLength(2)
    expect(r.badge).toBe(open(r.items).length)
  })

  it('a bad group on another day is not this line: it counts on its own', () => {
    const r = run('match8', (s) => {
      knockout(s, { players: 6, days: 3 })
      groupTheBracket(s)
      s.groups.push({ id: 'x', roundId: 'r2', number: 1, teeTime: null, startHole: 1, playerIds: ['p1', 'p2', 'p3'] })
    })
    expect(open(r.items)).toEqual([])
    expect(r.badge).toBe(1)
  })

  it('a bracket warning is not claimed: none of them reaches the engine\'s warnings, so none is «covered»', () => {
    const r = run('match8', (s) => knockout(s, { players: 1, days: 1 }))
    expect(r.d.state.bracket!.warnings[0]).toMatch(/suficientes jugadores para armar el cuadro/)
    expect(r.d.state.flags.warnings).not.toContain(r.d.state.bracket!.warnings[0])
    for (const w of ['Todavía no hay suficientes jugadores para armar el cuadro.', 'El cuadro necesita 3 rondas y el torneo tiene 1.', 'Cuartos de final: hay un partido empatado; el Comité decide quién pasa.']) {
      expect(coveredByChecklist(w, r.items)).toBe(false)
    }
  })
})

describe('Para empezar: tees as the engine plays them (N2)', () => {
  /** Day 1 moved to a one-tee course after p3 was given a tee of another course for it. */
  function staleTee(s: Snapshot, opts: { otherLoaded: boolean }) {
    const other = makeCourse('quivira', [makeTee('rojas', 'quivira', { name: 'Rojas' }), makeTee('negras', 'quivira', { name: 'Negras' })])
    if (opts.otherLoaded) {
      s.tournament.settings = { ...settingsOf(s), rounds: 2 }
      s.courses.push(other)
      s.rounds.push(makeRound(2, { status: 'scheduled', date: '2027-05-16', courseId: 'quivira' }))
      s.groups.push({ id: 'r2g1', roundId: 'r2', number: 1, teeTime: null, startHole: 1, playerIds: ['p1', 'p2', 'p3', 'p4'] })
    }
    s.roundTees = [{ roundId: 'r1', playerId: 'p3', teeId: 'rojas' }]
  }

  it('a tee of another course whose course is not loaded: the engine plays par 4 everywhere; the line says to change it, and covers that warning', () => {
    const r = run('minimal4-setup', (s) => staleTee(s, { otherLoaded: false }))
    expect(r.d.state.flags.warnings).toEqual(['Día 1: sin campo cargado; se usa par 4 en todos los hoyos.'])
    expect(r.by.foreignTees).toMatchObject({ done: false, text: 'Cambia los tees de otro campo: día 1', to: 'rondas', days: [1] })
    expect(r.badge).toBe(1)
  })

  it('a tee of another loaded course: the engine plays it with no warning; the line still says to change it', () => {
    const r = run('minimal4-setup', (s) => staleTee(s, { otherLoaded: true }))
    expect(r.d.state.flags.warnings).toEqual([])
    expect(r.d.state.core.rounds.r1!.p3!.holes[0]!.strokeIndex).toBe(7)
    expect(r.by.foreignTees).toMatchObject({ done: false, text: 'Cambia los tees de otro campo: día 1' })
    expect(r.by.card).toMatchObject({ done: true })
  })

  it('on a course with several tees, a tee of another course is not «sin tee»: he does not play the first tee', () => {
    const r = check('minimal4-setup', (s) => {
      s.courses[0]!.tees.push(makeTee('tee2', s.courses[0]!.id, { name: 'Blancas' }))
      staleTee(s, { otherLoaded: true })
    })
    expect(r.tees).toMatchObject({ done: true })
    expect(r.foreignTees).toMatchObject({ done: false })
  })

  it('the card is read on the tee chosen for the day, not on the player\'s default (M5)', () => {
    const r = check('minimal4-setup', (s) => {
      s.courses[0]!.tees.push(makeTee('tee9', s.courses[0]!.id, { name: 'Rojas', holes: s.courses[0]!.tees[0]!.holes.slice(0, 9) }))
      // p4's default is the full tee1; for day 1 he was put on the nine-hole Rojas.
      s.roundTees = [{ roundId: 'r1', playerId: 'p4', teeId: 'tee9' }]
    })
    expect(r.card).toMatchObject({ done: false, text: 'Falta la tarjeta del campo (par e índice de golpe): día 1' })
  })

  it('«sin campo cargado» counts once only while a line about that day is open', () => {
    // The round's course is not in the snapshot: no line says so, so the warning counts and «Listo» waits.
    const ghost = run('minimal4-setup', (s) => {
      s.rounds[0]!.courseId = 'ghost'
    })
    expect(open(ghost.items)).toEqual([])
    expect(ghost.d.state.flags.warnings).toEqual(['Día 1: sin campo cargado; se usa par 4 en todos los hoyos.'])
    expect(ghost.badge).toBe(1)
    // Day 2's warning is not covered by a line about day 1.
    const items: ReadinessItem[] = [{ id: 'roundSetup', done: false, text: '', to: 'rondas', days: [1] }]
    expect(coveredByChecklist('Día 1: sin campo cargado; se usa par 4 en todos los hoyos.', items)).toBe(true)
    expect(coveredByChecklist('Día 2: sin campo cargado; se usa par 4 en todos los hoyos.', items)).toBe(false)
    expect(coveredByChecklist('Día 1: sin campo cargado; se usa par 4 en todos los hoyos.', [{ ...items[0]!, done: true }])).toBe(false)
  })
})

describe('Para empezar: rounds that cannot be played (N6)', () => {
  it('every round cancelled in setup: an open line, not «Listo»', () => {
    const r = check('minimal4-setup', (s) => {
      s.rounds[0]!.status = 'cancelled'
    })
    expect(r.rounds).toMatchObject({ done: false, text: 'La ronda está cancelada: vuelve a programarla', to: 'rondas' })
    expect(
      check('new-setup', (s) => {
        for (const rd of s.rounds) rd.status = 'cancelled'
      }).rounds,
    ).toMatchObject({ done: false, text: 'Todas las rondas están canceladas: vuelve a programar una' })
  })
})

describe('Para empezar: match play is a knockout (N7)', () => {
  /** bracket8 with p1 v p8 tied after 18 holes (gross, the same card). */
  function tiedQuarter(s: Snapshot) {
    settingsOf(s).modules.individual.formatOptions.scoring = 'gross'
    s.scores = s.scores.filter((x) => !(x.roundId === 'r1' && x.playerId === 'p8'))
    for (const x of s.scores.filter((y) => y.roundId === 'r1' && y.playerId === 'p1')) s.scores.push({ ...x, playerId: 'p8' })
  }

  it('a tied match stops the bracket: a line says the Comité decides who goes through, and opens Grupos on the next day', () => {
    const r = run('bracket8', tiedQuarter)
    expect(r.d.state.bracket!.rounds).toHaveLength(1)
    expect(r.by.groups).toMatchObject({ done: false, text: 'Cuartos de final: un partido quedó sin ganador. Decide quién pasa y arma los grupos del día 2', to: 'grupos', roundId: 'r2' })
    // Once the Comité has grouped day 2 by hand, the decision is made.
    const decided = check('bracket8', (s) => {
      tiedQuarter(s)
      s.groups.push({ id: 'sf1', roundId: 'r2', number: 1, teeTime: null, startHole: 1, playerIds: ['p1', 'p4'] })
    })
    expect(decided.groups).toMatchObject({ done: true, text: 'Grupos del día 2 listos' })
  })

  it('one day for a bracket that needs three: a line to raise the days in Reglas, and the byes need a group (no later day)', () => {
    const r = check('match8', (s) => {
      knockout(s, { players: 6, days: 1 })
      groupTheBracket(s)
    })
    expect(r.bracket).toMatchObject({ done: false, text: 'El cuadro necesita 3 rondas y el torneo es de 1 día: sube los días a 3 en Reglas', to: 'torneo', tab: 'reglas' })
    expect(r.groups).toMatchObject({ done: false, text: '2 jugadores sin grupo el día 1' })
  })

  it('rounds created for the bracket on a one-day tournament are not «extra»: the day count in Reglas is what is short', () => {
    const r = check('match8', (s) => knockout(s, { days: 1, rounds: 3 }))
    expect(r.rounds).toMatchObject({ done: true, text: '3 rondas creadas' })
    expect(r.bracket).toMatchObject({ done: false, text: 'El cuadro necesita 3 rondas y el torneo es de 1 día: sube los días a 3 en Reglas' })
    expect(hrefOf('viaje', r.bracket!)).toBe('/t/viaje/admin/torneo?pestana=reglas')
    // With the days raised, nothing about the bracket is open.
    expect(check('match8', (s) => knockout(s, { days: 3 })).bracket).toBeUndefined()
  })
})

describe('Para empezar: a card with the stroke index never typed (N8, M2)', () => {
  it('real pars with the stroke index still in hole order: the stroke index is missing', () => {
    const r = check('minimal4-setup', (s) => {
      s.courses[0]!.tees[0]!.holes = s.courses[0]!.tees[0]!.holes.map((h) => ({ ...h, strokeIndex: h.number }))
    })
    expect(r.card).toMatchObject({ done: false, text: 'Captura el índice de golpe de cada hoyo: día 1', to: 'campos' })
  })

  it('par 4 on every hole with a real stroke index is a card: the template is par 4 AND the index in hole order', () => {
    const r = check('minimal4-setup', (s) => {
      s.courses[0]!.tees[0]!.holes = s.courses[0]!.tees[0]!.holes.map((h) => ({ ...h, par: 4 }))
    })
    expect(r.card).toMatchObject({ done: true })
  })
})
