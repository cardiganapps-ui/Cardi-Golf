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
  }
  actor: { handle: string; displayName: string } | null
}

/** Only a page inside Polo: a notice never sends anyone off-site. */
export function safeNoticeUrl(url: string | null | undefined): string | null {
  return url && /^\/[A-Za-z0-9/_.?=&%-]*$/.test(url) && !url.startsWith('//') ? url : null
}

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
    default:
      return { text: '', to: '/' }
  }
}
