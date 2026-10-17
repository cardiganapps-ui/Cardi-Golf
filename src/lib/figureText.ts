/**
 * The main event's figures as copy, the same on every screen (STRAT-03).
 *
 * A decided match reads the same for both sides («8&6»), so wherever a day's
 * result is printed it says whose it was («ganó 8&6»). A player of a team
 * format has his own card under the team's figure: his day is his own score
 * against par, not the team's.
 */
import { t } from '../i18n/es-MX'
import { holeStrokes, toParText, type Figure, type MainScoring } from '../engine/formats'
import type { HoleResult, PlayerRound } from '../engine/core/types'
import type { FeedEvent } from '../engine/core/feed'
import { DEFAULT_SETTINGS } from '../engine/settings/presets'
import type { TournamentSettings } from '../engine/settings/schema'

/** A day's figure, with the side of a decided match: «ganó 8&6», «perdió 2&1», «Empate», «−3». */
export function dayFigureText(f: Figure): string {
  return f.result ? t.live.matchDay(f.result, f.text) : f.text
}

/**
 * One player's own day, with its unit: Stableford points, or his strokes
 * against par over the holes he played («+3 neto»); null with no hole played.
 */
export function ownDayText(pr: PlayerRound, scoring: MainScoring): string | null {
  if (scoring === 'points') return pr.thru > 0 ? t.common.figure(String(pr.points), pr.points, 'points') : null
  let toPar = 0
  let played = 0
  for (const h of pr.holes) {
    const s = holeStrokes(h, scoring === 'net')
    if (s == null) continue
    toPar += s - h.par
    played++
  }
  return played ? t.common.figure(toParText(toPar), toPar, scoring) : null
}

/**
 * How a hole is marked on a card: good (a birdie or better), bad (no points;
 * under strokes, a double bogey or worse) or plain. Under strokes it is the
 * score the event counts against par, never the Stableford points: a gross
 * par with a stroke received is three points, and a plain par on a gross card.
 */
export function holeMark(h: HoleResult, scoring: MainScoring): 'good' | 'bad' | null {
  if (!h.played) return null
  if (scoring === 'points') return h.points >= 3 ? 'good' : h.points === 0 ? 'bad' : null
  const toPar = (holeStrokes(h, scoring === 'net') ?? h.par) - h.par
  return toPar <= -1 ? 'good' : toPar >= 2 ? 'bad' : null
}

/**
 * What the feed's lines need from the tournament beyond the event (STRAT-11): the snake's own label, and the
 * honoree's when the organizer gave one (null for the platform's own «Homenajeado»).
 */
export interface FeedWords {
  snake: string
  honoree: string | null
}

/** The platform's words, for a line read with no tournament at hand. */
const PLATFORM_WORDS: FeedWords = { snake: DEFAULT_SETTINGS.modules.snake.label, honoree: null }

/** The feed's words from a tournament's settings. */
export function feedWords(settings: TournamentSettings): FeedWords {
  const honoree = settings.labels.honoree.trim()
  return {
    snake: settings.modules.snake.label,
    honoree: honoree && honoree !== DEFAULT_SETTINGS.labels.honoree ? honoree : null,
  }
}

/**
 * Every line an event can be read as, and which set they are (COPY-15): events of one set share their lines, so
 * two of them in a row must not take the same one.
 */
function feedChoices(e: FeedEvent, nameOf: (id: string) => string, words: FeedWords): { set: string; lines: string[] } {
  const name = nameOf(e.playerId)
  switch (e.kind) {
    case 'birdie': {
      const ctx = { first: !!e.firstOfDay, streak: e.streak }
      const set = `birdie:${e.scoring}:${e.streak && e.streak > 1 ? 'streak' : e.firstOfDay ? 'first' : e.under >= 2 ? 'eagle' : 'birdie'}`
      // Points only where the event counts them.
      if (e.scoring !== 'points')
        return { set, lines: t.feed.underPar(name, e.hole, e.under, e.scoring === 'net', ctx) }
      return { set, lines: t.feed.underParPoints(name, e.hole, e.points, e.grossUnder >= e.under, ctx) }
    }
    case 'leadChange':
      return { set: 'leadChange', lines: t.feed.leadChange(name, e.figure, e.previous ? nameOf(e.previous) : null) }
    case 'snakePass':
      return { set: 'snakePass', lines: t.feed.snakePass(name, e.hole, words.snake) }
    case 'honoreeHole':
      return {
        set: `honoree:${e.scoring}:${e.points === 0 ? 0 : 1}`,
        lines:
          e.scoring === 'points'
            ? t.feed.honoreeHole(name, e.hole, e.points, words.honoree)
            : t.feed.honoreeToPar(name, e.hole, e.toPar, e.scoring === 'net', words.honoree),
      }
    case 'threePutt':
      return { set: 'threePutt', lines: t.feed.threePutt(name, e.hole, e.putts) }
  }
}

/** A feed event as a line of the ticker, in the figure the event counts (STRAT-03); `variant` picks among its lines. */
export function feedText(
  e: FeedEvent,
  nameOf: (id: string) => string,
  words: FeedWords = PLATFORM_WORDS,
  variant = 0,
): string {
  const { lines } = feedChoices(e, nameOf, words)
  return lines[variant % lines.length]!
}

/** FNV-1a: a small, stable hash of a string, the same on every phone. */
function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return h >>> 0
}

/**
 * The ticker's lines for a feed, newest first as the engine gives it (COPY-15). Each event's line is picked from its
 * key (`feedKey`, which a save's time never changes), so every phone shows the same words and a recompute, a sync
 * or a new event above it never rewrites a line already on screen. Read from the oldest up, a line that would repeat
 * the one before it, from the same set, takes the next one instead.
 */
export function feedLines(
  feed: readonly FeedEvent[],
  nameOf: (id: string) => string,
  words: FeedWords = PLATFORM_WORDS,
): string[] {
  return feedPicks(feed, nameOf, words).map((p) => p.line)
}

/** Each event's line with the set it comes from and which of the set it is: what `feedLines` shows, for the tests too. */
export function feedPicks(
  feed: readonly FeedEvent[],
  nameOf: (id: string) => string,
  words: FeedWords = PLATFORM_WORDS,
): Array<{ set: string; pick: number; line: string }> {
  const out = new Array<{ set: string; pick: number; line: string }>(feed.length)
  let prev: { set: string; pick: number } | null = null
  for (let i = feed.length - 1; i >= 0; i--) {
    const e = feed[i]!
    const { set, lines } = feedChoices(e, nameOf, words)
    let pick = hash(feedKey(e)) % lines.length
    // eslint-disable-next-line @typescript-eslint/prefer-optional-chain -- through `?.` TypeScript reads `prev` as only its first value (null) in this loop
    if (prev && prev.set === set && prev.pick === pick && lines.length > 1) pick = (pick + 1) % lines.length
    out[i] = { set, pick, line: lines[pick]! }
    prev = { set, pick }
  }
  return out
}

/**
 * A feed event's key in a list. The close's lead change sits on the last hole
 * too, beside any save there, so it keys apart: two children with one key
 * made React drop or repeat a line of the ticker.
 */
export function feedKey(e: FeedEvent): string {
  // Never the save's time: a pending save shows the phone's clock and the synced row the server's, and a new key remounts the line.
  // A lead change keys on whose save made it: a leader who takes the lead again on the same hole, after someone else's bogey, is another line.
  const lead = e.kind === 'leadChange' ? (e.close ? 'close' : (e.by ?? '')) : ''
  return `${e.kind}-${e.roundNumber}-${e.hole}-${e.playerId}-${lead}`
}
