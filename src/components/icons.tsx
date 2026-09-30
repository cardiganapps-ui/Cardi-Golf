/**
 * Icon set: 24-px grid, 1.75 stroke, round joins, currentColor. Only what
 * speeds recognition; never decorative. Replaces every emoji in phase 2.
 */
import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement> & { size?: number }

function Svg({ size = 24, children, ...rest }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  )
}

/** En vivo: a pin flag. */
export const IconFlag = (p: P) => (
  <Svg {...p}>
    <path d="M6 21V4" />
    <path d="M6 4h10l-2.5 3.5L16 11H6" />
  </Svg>
)
/** Tarjeta: the pencil. */
export const IconPencil = (p: P) => (
  <Svg {...p}>
    <path d="M4 20l4-1 10.5-10.5a2.1 2.1 0 0 0-3-3L5 16l-1 4z" />
    <path d="M13.5 7.5l3 3" />
  </Svg>
)
/** Juegos: two dice pips on a card. */
export const IconGames = (p: P) => (
  <Svg {...p}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <circle cx="9" cy="9" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="15" cy="15" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="15" cy="9" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="9" cy="15" r="1.2" fill="currentColor" stroke="none" />
  </Svg>
)
/** Dinero: a coin. */
export const IconCoin = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5v9M14.5 9.5c-.5-.9-1.4-1.3-2.5-1.3-1.4 0-2.4.8-2.4 1.8 0 2.4 5 1.2 5 3.7 0 1.1-1.1 1.9-2.6 1.9-1.2 0-2.2-.5-2.7-1.4" />
  </Svg>
)
/** Más. */
export const IconMore = (p: P) => (
  <Svg {...p}>
    <circle cx="6" cy="12" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="18" cy="12" r="1.3" fill="currentColor" stroke="none" />
  </Svg>
)
export const IconCheck = (p: P) => (
  <Svg {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
)
export const IconUndo = (p: P) => (
  <Svg {...p}>
    <path d="M8 7H4v4" />
    <path d="M4 11a8 8 0 1 1 2.3 5.7" />
  </Svg>
)
export const IconChevronLeft = (p: P) => (
  <Svg {...p}>
    <path d="M14.5 6l-6 6 6 6" />
  </Svg>
)
export const IconChevronRight = (p: P) => (
  <Svg {...p}>
    <path d="M9.5 6l6 6-6 6" />
  </Svg>
)
export const IconShare = (p: P) => (
  <Svg {...p}>
    <path d="M12 3v12M8 7l4-4 4 4" />
    <path d="M5 13v6h14v-6" />
  </Svg>
)
export const IconOffline = (p: P) => (
  <Svg {...p}>
    <path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z" />
    <path d="M4 4l16 16" />
  </Svg>
)
export const IconPlus = (p: P) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)
export const IconMinus = (p: P) => (
  <Svg {...p}>
    <path d="M5 12h14" />
  </Svg>
)
export const IconSnake = (p: P) => (
  <Svg {...p}>
    <path d="M18 6c0-1.7-1.3-3-3-3s-3 1.3-3 3v6c0 1.7-1.3 3-3 3s-3-1.3-3-3v-1" />
    <path d="M6 11a2 2 0 1 0 0 .01" />
    <path d="M16.5 6.2l1.2-.6" />
  </Svg>
)
export const IconTrophy = (p: P) => (
  <Svg {...p}>
    <path d="M8 4h8v5a4 4 0 0 1-8 0V4z" />
    <path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4" />
    <path d="M12 13v4M8 21h8M9 21v-4h6v4" />
  </Svg>
)
export const IconClose = (p: P) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
)
export const IconArrowUp = (p: P) => (
  <Svg {...p}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Svg>
)
export const IconArrowDown = (p: P) => (
  <Svg {...p}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </Svg>
)
export const IconArrowRight = (p: P) => (
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
)
export const IconPrint = (p: P) => (
  <Svg {...p}>
    <path d="M7 8V4h10v4" />
    <rect x="4" y="8" width="16" height="9" rx="2" />
    <path d="M7 14h10v6H7z" />
  </Svg>
)
export const IconPlay = (p: P) => (
  <Svg {...p}>
    <path d="M7 5v14l11-7z" fill="currentColor" stroke="none" />
  </Svg>
)
export const IconStop = (p: P) => (
  <Svg {...p}>
    <rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" stroke="none" />
  </Svg>
)
/** Pairs: two interlocking rings. */
export const IconRings = (p: P) => (
  <Svg {...p}>
    <circle cx="9" cy="12" r="5.5" />
    <circle cx="15" cy="12" r="5.5" />
  </Svg>
)
/** Auction: a gavel. */
export const IconGavel = (p: P) => (
  <Svg {...p}>
    <path d="M13 6l5 5M9 10l5 5" />
    <path d="M11.5 7.5l5 5-2.5 2.5-5-5z" />
    <path d="M10 14l-6 6" />
    <path d="M4 20h7" />
  </Svg>
)
/** Last place: the wooden spoon. */
export const IconSpoon = (p: P) => (
  <Svg {...p}>
    <ellipse cx="12" cy="6.5" rx="4" ry="4.5" />
    <path d="M12 11v10" />
  </Svg>
)
export const IconTv = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="12" rx="2" />
    <path d="M8 21h8" />
  </Svg>
)
export const IconChart = (p: P) => (
  <Svg {...p}>
    <path d="M4 20h16" />
    <path d="M7 16v-5M12 16V6M17 16v-8" />
  </Svg>
)
/** Rules: a booklet. */
export const IconBook = (p: P) => (
  <Svg {...p}>
    <path d="M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3 3z" />
    <path d="M5 4v16a3 3 0 0 1 3-3h9" />
  </Svg>
)
export const IconCamera = (p: P) => (
  <Svg {...p}>
    <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
    <circle cx="12" cy="13" r="3.5" />
  </Svg>
)
export const IconLock = (p: P) => (
  <Svg {...p}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Svg>
)
/** Admin de Polo: a shield with a check. */
export const IconShield = (p: P) => (
  <Svg {...p}>
    <path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6z" />
    <path d="M9 12l2 2 4-4" />
  </Svg>
)
export const IconAlert = (p: P) => (
  <Svg {...p}>
    <path d="M12 4l9 16H3z" />
    <path d="M12 10v4M12 17v.5" />
  </Svg>
)
/** Honoree: a ring (the tournament's accent). */
export const IconRing = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="7" />
  </Svg>
)
/** Medal for places 2..n. */
export const IconMedal = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="15" r="5" />
    <path d="M8.5 10.5L6 3h5l1 3 1-3h5l-2.5 7.5" />
  </Svg>
)
/** Best round: a flame. */
export const IconFlame = (p: P) => (
  <Svg {...p}>
    <path d="M12 3c1 3 4 5 4 9a4 4 0 0 1-8 0c0-1.5.5-2.5 1-3.5.5 1.5 1.5 2 2 2 0-3-1-5 1-7.5z" />
  </Svg>
)
/** Fewest putts: a target. */
export const IconTarget = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="12" cy="12" r="0.8" fill="currentColor" stroke="none" />
  </Svg>
)
/** Birdie in the feed: a small bird. */
export const IconBird = (p: P) => (
  <Svg {...p}>
    <path d="M4 14c3 0 5-1 7-4 1 2 3 3 6 3l3-1-2 3c-2 3-6 4-9 4H5" />
    <path d="M11 10l-2-4" />
  </Svg>
)
/** Money movement: a receipt. */
export const IconReceipt = (p: P) => (
  <Svg {...p}>
    <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
    <path d="M9 8h6M9 12h6" />
  </Svg>
)
/** A person: profiles. */
export const IconPerson = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4.5 20.5c1.2-3.8 4-5.5 7.5-5.5s6.3 1.7 7.5 5.5" />
  </Svg>
)
/** Two people: friends, crews. */
export const IconPeople = (p: P) => (
  <Svg {...p}>
    <circle cx="9" cy="8.5" r="3.5" />
    <path d="M2.5 20c1-3.4 3.4-5 6.5-5s5.5 1.6 6.5 5" />
    <path d="M15.5 5.3a3.5 3.5 0 0 1 0 6.4" />
    <path d="M17.5 15.2c2 .6 3.3 2.2 4 4.8" />
  </Svg>
)
/** Notifications. */
export const IconBell = (p: P) => (
  <Svg {...p}>
    <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
    <path d="M10 20.5a2 2 0 0 0 4 0" />
  </Svg>
)
/** Search. */
export const IconSearch = (p: P) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </Svg>
)
/** Upcoming outings. */
export const IconCalendar = (p: P) => (
  <Svg {...p}>
    <rect x="4" y="5.5" width="16" height="15" rx="2" />
    <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
  </Svg>
)
/** Home (Mi Polo). */
export const IconHome = (p: P) => (
  <Svg {...p}>
    <path d="M4 11l8-6.5 8 6.5" />
    <path d="M6 9.5V20h12V9.5" />
  </Svg>
)
/** Settings: a slider pair (not a gear, which reads as "system"). */
export const IconSettings = (p: P) => (
  <Svg {...p}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </Svg>
)
/** Google's "G", in its own colors (sign-in button only). */
export const IconGoogle = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path style={{ fill: 'var(--google-blue)' }} d="M22.6 12.3c0-.8-.1-1.5-.2-2.3H12v4.3h6a5.1 5.1 0 0 1-2.2 3.4v2.8h3.6c2.1-2 3.2-4.8 3.2-8.2z" />
    <path style={{ fill: 'var(--google-green)' }} d="M12 23c3 0 5.5-1 7.4-2.7l-3.6-2.8c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.7H2v2.9A11 11 0 0 0 12 23z" />
    <path style={{ fill: 'var(--google-yellow)' }} d="M5.7 13.9a6.6 6.6 0 0 1 0-4.2V6.8H2a11 11 0 0 0 0 9.9l3.7-2.8z" />
    <path style={{ fill: 'var(--google-red)' }} d="M12 5.4c1.6 0 3.1.6 4.3 1.7l3.2-3.2A11 11 0 0 0 2 6.8l3.7 2.9C6.6 7.3 9.1 5.4 12 5.4z" />
  </svg>
)

/** A circled "i": the explanation is one tap away, without shouting about it. */
export const IconInfo = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5" />
    <path d="M12 7.6v.9" />
  </Svg>
)
