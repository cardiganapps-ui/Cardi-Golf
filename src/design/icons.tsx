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
