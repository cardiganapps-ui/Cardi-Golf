/**
 * Friends, the inbox, head to head, rivalries and the friends feed (migration
 * 0016). Everything goes through definer RPCs; the tables are readable only
 * by the two people involved.
 */
import { create } from 'zustand'
import type { NoticeLike } from '../lib/noticeText'
import { rpc } from './rpc'

export interface FriendCard {
  handle: string
  displayName: string
  avatarUrl: string | null
  homeClub: string | null
  index: number | null
  /** Suggestions only: tournaments played together. */
  shared?: number
}

export interface MyFriends {
  friends: FriendCard[]
  incoming: FriendCard[]
  outgoing: FriendCard[]
  suggestions: FriendCard[]
}

export type Friendship = 'none' | 'outgoing' | 'incoming' | 'friends' | 'blocked'

export interface Actor {
  handle: string
  displayName: string
  avatarUrl: string | null
}

export type NotificationKind =
  | 'friend_request'
  | 'friend_accepted'
  | 'rivalry_proposed'
  | 'rivalry_accepted'
  | 'rivalry_round'
  | 'link_pending'
  | 'results'
  | 'round_invite'
  | 'crew_join'
  // A tournament's notices to its players (0052): an account that is the player's hears them in its inbox too.
  | 'round_live'
  | 'card_to_sign'
  | 'snake_tiebreak'
  // TRUST-14 (0062): the Comité corrected the player's card that day.
  | 'score_corrected'

export interface Notice {
  id: string
  kind: NotificationKind
  data: NoticeLike['data']
  read: boolean
  createdAt: string
  actor: Actor | null
}

export interface H2HRound {
  roundId: string
  playedOn: string | null
  roundNumber: number
  course: string | null
  practice: boolean
  tournament: string
  slug: string
  myGross: number | null
  theirGross: number | null
  myAgs: number
  theirAgs: number
  myNet: number | null
  theirNet: number | null
}

export type RivalryResult = 'won' | 'lost' | 'tie'

export interface RivalryRound {
  roundId: string
  playedOn: string | null
  myAgs: number
  theirAgs: number
  result: RivalryResult
  /** Strokes I received going into the round, and after it (negative: I gave). */
  before: number
  after: number
}

export interface Rivalry {
  id: string
  status: 'pending' | 'active' | 'ended'
  iProposed: boolean
  cap: number
  /** Strokes I receive now (negative: I give them). */
  myStrokes: number
  startStrokes: number
  startedAt: string | null
  history: RivalryRound[]
}

export interface HeadToHead {
  rounds: H2HRound[]
  rivalry: Rivalry | null
  /** Strokes I'd receive from our indexes, or null without both. */
  suggestion: number | null
  friends: boolean
}

export type FeedItem =
  | {
      kind: 'finish'
      at: string
      who: Actor
      data: { tournament: string; slug: string; rankLabel: string; field: number }
    }
  | {
      kind: 'round'
      at: string
      who: Actor
      data: {
        course: string | null
        tournament: string
        slug: string
        gross: number | null
        birdies: number
        eagles: number
        best: boolean
      }
    }
  | { kind: 'rivalry'; at: string; who: Actor; data: { rivalryId: string; result: RivalryResult } }

export const myFriends = () => rpc('my_friends').as<MyFriends>()
export const friendshipWith = (handle: string) => rpc('friendship_with', { p_handle: handle }).as<Friendship>()
/** Returns 'pending', 'accepted' (it answered their request), 'blocked' or 'not_found'. */
export const friendRequest = (handle: string) => rpc('friend_request', { p_handle: handle })
export const friendRespond = (handle: string, accept: boolean) =>
  rpc('friend_respond', { p_handle: handle, p_accept: accept })
export const friendRemove = (handle: string) => rpc('friend_remove', { p_handle: handle })
export const friendBlock = (handle: string) => rpc('friend_block', { p_handle: handle })
export const headToHead = (handle: string) => rpc('head_to_head', { p_handle: handle }).as<HeadToHead | null>()
/** `strokes`: what I receive from them (negative: I give). */
export const rivalryPropose = (handle: string, strokes: number) =>
  rpc('rivalry_propose', { p_handle: handle, p_strokes: strokes })
export const rivalryRespond = (id: string, accept: boolean) => rpc('rivalry_respond', { p_id: id, p_accept: accept })
export const rivalryEnd = (id: string) => rpc('rivalry_end', { p_id: id })
export const friendsFeed = () => rpc('friends_feed').as<FeedItem[]>()
export const myNotifications = () => rpc('my_notifications').as<Notice[]>()
export const markNotificationsRead = (ids?: string[]) => rpc('mark_notifications_read', { p_ids: ids ?? null })

/** The bell's count. Refreshed on Mi Polo and when the inbox is read. */
interface UnreadState {
  count: number
  refresh: () => Promise<void>
  clear: () => void
}
export const useUnread = create<UnreadState>((set) => ({
  count: 0,
  refresh: async () => {
    try {
      set({ count: await rpc('unread_notifications') })
    } catch {
      /* no account or offline: keep what we had */
    }
  },
  clear: () => set({ count: 0 }),
}))

export interface Record3 {
  won: number
  lost: number
  tied: number
}

/**
 * Won-lost-tied over our shared rounds: on net (adjusted gross minus the
 * WHS course handicap of the tee each played) or on gross (rounds where
 * both have a gross, i.e. no pick-ups).
 */
export function h2hRecord(rounds: H2HRound[], basis: 'net' | 'gross'): Record3 {
  const r: Record3 = { won: 0, lost: 0, tied: 0 }
  for (const x of rounds) {
    const mine = basis === 'net' ? x.myNet : x.myGross
    const theirs = basis === 'net' ? x.theirNet : x.theirGross
    if (mine == null || theirs == null) continue
    if (mine < theirs) r.won++
    else if (mine > theirs) r.lost++
    else r.tied++
  }
  return r
}

/** Default strokes to propose: the index suggestion within the cap, else level. */
export function proposedStrokes(suggestion: number | null, cap = 18): number {
  if (suggestion == null) return 0
  return Math.max(-cap, Math.min(cap, Math.round(suggestion)))
}
