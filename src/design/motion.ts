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

/** The one curve: --ease, cubic-bezier(0.2, 0, 0, 1). */
export const EASE = [0.2, 0, 0, 1] as const

/** A thing arriving or settling: the default. */
export const ease = { duration: DUR, ease: EASE } as const
/** A small change that should not draw the eye. */
export const easeFast = { duration: DUR_FAST, ease: EASE } as const
/** A reveal worth watching — a ceremony, a row re-sorting on a big board. */
export const easeSlow = { duration: DUR_SLOW, ease: EASE } as const

/** Delay the nth item of a staggered reveal, without stretching the whole list. */
export const stagger = (i: number, step = DUR_FAST) => ({ ...ease, delay: i * step })

/**
 * The ceremony's reveal (MOT-23), the one orchestrated moment the direction
 * allows: the faces land, a beat later the name, then the figures count up,
 * and the champion's trophy line and confetti arrive as the count ends.
 * Seconds from «Revelar»; each further winner of a step starts `nextWinner`
 * later.
 */
export const REVEAL = { name: DUR_SLOW, figures: DUR_SLOW * 2, countUp: 0.9, trophy: DUR_SLOW * 2 + 0.9, nextWinner: 0.3 } as const
