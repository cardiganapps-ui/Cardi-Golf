/**
 * A notice's text and where tapping it goes, for the inbox (/avisos) and for
 * the web push that carries the same notice (api/push-dispatch.ts).
 */
import { t } from '../i18n/es-MX.js'

const S = t.social

/** The parts of a notification the text needs (see src/data/social.ts `Notice`). */
export interface NoticeLike {
  kind: string
  data: {
    tournament?: string
    slug?: string
    player?: string
    rankLabel?: string | null
    field?: number
    rivalryId?: string
    crew?: string
    /** platform_notice: what the Admin de Polo wrote. */
    title?: string
    body?: string
    url?: string | null
    /** A tournament's notices to its players (0052): the day, the group, where it starts, the hole, the game. */
    round?: number
    group?: number | null
    startHole?: number | null
    teeTime?: string | null
    hole?: number
    game?: string
    /** card_to_sign under a marker's rule (0054): a teammate's card is the one to sign. */
    marker?: boolean
  }
  actor: { handle: string; displayName: string } | null
}

/** Only a page inside Polo: a notice never sends anyone off-site. */
export function safeNoticeUrl(url: string | null | undefined): string | null {
  return url && /^\/[A-Za-z0-9/_.?=&%-]*$/.test(url) && !url.startsWith('//') ? url : null
}

/** A tournament's page, `rest` after its slug; home when the slug isn't one (the server only sends real ones). */
function tournamentPage(slug: string | undefined, rest = ''): string {
  return slug && /^[a-z0-9][a-z0-9-]{0,59}$/.test(slug) ? `/t/${slug}${rest}` : '/'
}

/** «09:00» as people say it, «9:00»; anything else is left out. */
function clock(teeTime: string | null | undefined): string | null {
  const m = teeTime ? /^(\d{2}):(\d{2})/.exec(teeTime) : null
  return m ? `${Number(m[1])}:${m[2]}` : null
}

const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null)

/**
 * A notice's line and where tapping it goes. A notice from the Admin de Polo
 * also carries its own title and body for the push (the rest say «Polo» and
 * the line).
 */
export function noticeLine(n: NoticeLike): { text: string; to: string; title?: string; body?: string } {
  const who = n.actor?.displayName ?? S.someone
  const vs = n.actor ? `/p/${n.actor.handle}/vs` : '/amigos'
  switch (n.kind) {
    case 'friend_request':
      return { text: S.notice.friend_request(who), to: '/amigos' }
    case 'friend_accepted':
      return { text: S.notice.friend_accepted(who), to: n.actor ? `/p/${n.actor.handle}` : '/amigos' }
    case 'rivalry_proposed':
      return { text: S.notice.rivalry_proposed(who), to: vs }
    case 'rivalry_accepted':
      return { text: S.notice.rivalry_accepted(who), to: vs }
    case 'rivalry_round':
      return { text: S.notice.rivalry_round(who), to: vs }
    case 'link_pending':
      return { text: S.notice.link_pending(n.data.player ?? '', n.data.tournament ?? ''), to: '/' }
    case 'results': {
      const finish = n.data.rankLabel ? t.profile.finish(n.data.rankLabel, n.data.field ?? null) : null
      return { text: S.notice.results(n.data.tournament ?? '', finish && finish.charAt(0).toLowerCase() + finish.slice(1)), to: n.data.slug ? `/t/${n.data.slug}` : '/' }
    }
    case 'round_invite':
      // Mi Polo carries the "¿Eres tú?" that confirms the player.
      return { text: S.notice.round_invite(who, n.data.tournament ?? ''), to: '/' }
    case 'crew_join':
      return { text: S.notice.crew_join(who, n.data.crew ?? ''), to: n.data.slug ? `/c/${n.data.slug}` : '/crews' }
    case 'platform_notice': {
      const title = n.data.title ?? S.notice.platformTitle
      const body = n.data.body ?? ''
      return { text: S.notice.platform_notice(title, body), to: safeNoticeUrl(n.data.url) ?? '/avisos', title, body }
    }
    // A tournament's notices to its players (0052): the push says the tournament above, and opens its Tarjeta.
    case 'round_live': {
      const tournament = n.data.tournament ?? ''
      const round = num(n.data.round) ?? 1
      const body = S.notice.roundLiveBody(round, num(n.data.group), num(n.data.startHole), clock(n.data.teeTime))
      return { text: S.notice.round_live(tournament, round), to: tournamentPage(n.data.slug, '/tarjeta'), title: tournament || undefined, body }
    }
    case 'card_to_sign': {
      const tournament = n.data.tournament ?? ''
      const round = num(n.data.round) ?? 1
      // The grid, where «Firmar» is.
      // Under a marker's rule (0054 `marker`) it is a teammate's card, not the other pair's.
      const body = n.data.marker === true ? S.notice.cardToSignMarkerBody(round) : S.notice.cardToSignBody(round)
      return { text: S.notice.card_to_sign(tournament, round), to: tournamentPage(n.data.slug, '/tarjeta?vista=tarjeta'), title: tournament || undefined, body }
    }
    case 'snake_tiebreak': {
      const tournament = n.data.tournament ?? ''
      const game = n.data.game || S.notice.snakeGame
      const round = num(n.data.round) ?? 1
      const hole = num(n.data.hole)
      // On that hole: saving it again asks «¿Quién embocó al último?».
      return {
        text: S.notice.snake_tiebreak(tournament, game, hole ?? 0),
        to: tournamentPage(n.data.slug, hole != null ? `/tarjeta?hoyo=${hole}` : '/tarjeta'),
        title: tournament || undefined,
        body: S.notice.snakeTiebreakBody(game, round, hole ?? 0),
      }
    }
    default:
      return { text: '', to: '/' }
  }
}
