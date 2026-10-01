/**
 * Plain-Spanish rules for an instance game, read from its settings (for
 * Reglamento and the setup catalog). Every number comes from the config.
 */
import { ordinal, t } from '../../i18n/es-MX'
import type { GameConfig } from '../settings/games'
import { fmt } from './payout'

function roundsText(g: GameConfig): string {
  if (g.rounds === 'all') return 'Todas las rondas.'
  return g.rounds.length === 1 ? `Solo el día ${g.rounds[0]}.` : `Días ${t.common.andList(g.rounds.map(String))}.`
}

function moneyText(g: GameConfig): string {
  const m = g.money
  if (m.source === 'none') return 'Sin dinero: por la gloria.'
  if (m.source === 'side') return `Bote aparte: cada quien que entra pone ${fmt(m.buyIn)}; el bote solo le paga a los que entraron.`
  if (m.source === 'main') return `Sale de la bolsa principal: ${fmt(m.amount)}.`
  return `Directo entre jugadores: ${fmt(m.stake)}${g.type === 'match' ? ' por apuesta' : ' por cada uno'}.`
}

export function describeGame(g: GameConfig): string[] {
  const lines: string[] = []
  switch (g.type) {
    case 'skins': {
      const o = g.options
      lines.push(`En cada hoyo, quien hace menos golpes ${o.basis === 'net' ? 'netos' : 'gross'}, solo, gana un skin.`)
      lines.push(o.carryOver ? 'Si hay empate nadie gana y el skin se acumula al siguiente hoyo.' : 'Si hay empate nadie gana ese hoyo.')
      if (g.money.source === 'side' || g.money.source === 'main') lines.push('El bote se reparte entre los skins ganados.')
      break
    }
    case 'lowScore': {
      const o = g.options
      lines.push(o.basis === 'points' ? 'Gana quien hace más puntos Stableford.' : `Gana la tarjeta ${o.basis === 'net' ? 'neta' : 'gross'} más baja contra el par. Levantar cuenta como doble bogey neto.`)
      lines.push(o.scope === 'perRound' ? 'Un premio por día (el bote se divide entre los días).' : 'Un solo premio sumando todos sus días.')
      if (g.money.source !== 'none') lines.push(`Reparto: ${t.common.andList(g.money.split.map((p, i) => `${ordinal(String(i + 1))} ${p}%`))}. Empates se reparten.`)
      break
    }
    case 'eventPot': {
      const o = g.options
      if (o.event === 'threePutt') lines.push('Cada vez que alguien hace tres putts o más, le paga a cada uno de los demás.')
      else lines.push(`Cada ${o.event === 'eagle' ? 'águila' : 'birdie'} o mejor (${o.basis === 'net' ? 'neto' : 'gross'}) cuenta.`)
      if (o.event !== 'threePutt' && g.money.source === 'direct') lines.push('Cada uno lo cobra de cada uno de los demás.')
      if (g.money.source === 'side' || g.money.source === 'main') lines.push('El bote se reparte según cuántos hizo cada quien.')
      break
    }
    case 'match': {
      const o = g.options
      lines.push(o.format === 'nassau' ? 'Nassau: tres apuestas por ronda, la ida (1–9), la vuelta (10–18) y el total.' : 'Match play a 18 hoyos: gana quien gana más hoyos.')
      lines.push(`Por hoyo, ${o.basis === 'net' ? 'neto, cada quien con sus golpes de ventaja' : 'gross'}.${o.matches.some((m) => m.a.length > 1) ? ` En parejas cuenta ${o.pairScoring === 'bestBall' ? 'la mejor bola' : 'la suma de los dos'}.` : ''}`)
      if (o.pressAt > 0) lines.push(`Presión automática: al ir ${o.pressAt} abajo arranca otra apuesta desde el siguiente hoyo (máximo ${o.maxPresses} por vuelta).`)
      lines.push('Los partidos los arma el Comité.')
      break
    }
    case 'contest': {
      const names = { closest: 'más cerca del hoyo', longDrive: 'drive más largo', greenie: 'greenie (en green de salida en par 3 y hace par o mejor)', sandy: 'sandy (sale de la trampa y hace par o mejor)', custom: g.label }
      const holes = g.options.holes === 'par3' ? 'en todos los par 3' : g.options.holes === 'all' ? 'en todos los hoyos' : `en los hoyos ${t.common.andList(g.options.holes.map(String))}`
      lines.push(`Concurso de ${names[g.options.kind]}, ${holes}. El grupo marca al ganador en la tarjeta.`)
      break
    }
    case 'custom':
      if (g.options.description) lines.push(g.options.description)
      lines.push('El Comité marca a los ganadores al final.')
      break
  }
  lines.push(moneyText(g))
  lines.push(roundsText(g))
  if (g.entrants === 'list') lines.push('Solo juegan los que se anotaron.')
  return lines
}
