/**
 * Motion, from the same numbers the stylesheet uses.
 *
 * Thirteen `motion` call sites each hard-coded their own duration and curve,
 * and three of them had drifted off the documented 150–250ms ease-out: two
 * springs and a 0.4s fade. Animation that is nearly-but-not-quite consistent
 * is what "stiff and dated" feels like from the outside — the app moves at
 * four different speeds and none of them is the one the design system says.
 *
 * These are the tokens in `tokens.css` as numbers, and `motion.test.ts` fails
 * if the two ever disagree. `<MotionConfig reducedMotion="user">` in main.tsx
 * already honours the reduced-motion preference, so nothing here has to.
 */

/** Seconds, matching --dur-fast / --dur / --dur-slow. */
export const DUR_FAST = 0.15
export const DUR = 0.2
export const DUR_SLOW = 0.25

/**
 * The one curve: --ease, cubic-bezier(0.25, 1, 0.5, 1), a true ease-out (MOT-13). Every move on the phone answers
 * a tap or a change, so it starts at speed and settles: nearly a third of the way on the first frame at --dur, where the
 * ease-in-out it replaced, (0.2, 0, 0, 1), managed a tenth.
 */
export const EASE = [0.25, 1, 0.5, 1] as const

/** A thing arriving or settling: the default. */
export const ease = { duration: DUR, ease: EASE } as const
/** A small change that should not draw the eye. */
export const easeFast = { duration: DUR_FAST, ease: EASE } as const
/** A reveal worth watching on a phone: a sheet's content, a row settling. */
export const easeSlow = { duration: DUR_SLOW, ease: EASE } as const

/**
 * The board surface (TV, Ceremonia) is watched from four metres (MOT-11): a
 * 150 ms pulse there is over before anyone looks up. Its changes (a bid, the
 * pot, a row re-sorting, the next board) take --dur-board on --ease-board.
 */
export const DUR_BOARD = 0.5
/** --ease-board: lands softer than --ease, so a big move reads as arriving, not snapping. */
export const EASE_BOARD = [0.16, 1, 0.3, 1] as const
export const easeBoard = { duration: DUR_BOARD, ease: EASE_BOARD } as const
/**
 * A moment (the champion, a pair of the draw, a lot out of the hat) is one
 * choreographed beat: every part of it begins within MOMENT seconds of the
 * first, and the room can skip it.
 */
export const MOMENT = 1.2
/** The pairs draw on the TV: one pair every DRAW_STEP seconds. */
export const DRAW_STEP = 0.8
/** The lots coming out of the hat on the TV: one every HAT_STEP seconds. */
export const HAT_STEP = 0.25
/** The console's lot order shuffling into place: each row a beat after the one above it. */
export const reorder = (i: number) => ({ ...easeBoard, delay: i * 0.03 })

/**
 * Not motion but a clock: the TV's rule that fills over a board's time on
 * screen (MOT-08), linear and as long as what is left of that time. Nothing
 * else may run this long; under reduced motion it is `still`.
 */
export const timer = (seconds: number) => ({ duration: Math.max(0, seconds), ease: 'linear' }) as const
/** No transition: the end state at once (reduced motion). */
export const still = { duration: 0 } as const

/**
 * The ceremony's reveal (MOT-23), the one orchestrated moment the direction
 * allows: the faces land, a beat later the name, then the figures count up,
 * and the champion's trophy line and confetti arrive as the count ends.
 * Seconds from «Revelar»; each further winner of a step starts `nextWinner`
 * later.
 */
export const REVEAL = { name: DUR_SLOW, figures: DUR_SLOW * 2, countUp: 0.7, trophy: DUR_SLOW * 2 + 0.7, nextWinner: 0.3 } as const
