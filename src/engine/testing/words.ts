/**
 * What the engine says, in words, for the tests (ARCH-05): the engine returns
 * codes and figures, and these render them with the platform's currency, as
 * the screens do, so a test can hold the words a person reads.
 */
import type { Explanation, ExplanationText, Msg } from '../messages'
import { renderExplanation, renderMsg } from '../../i18n/explain'
import { PLATFORM_CURRENCY } from '../../lib/money'

const isMsg = (x: unknown): x is Msg => !!x && typeof x === 'object' && 'code' in x && 'params' in x

/** A message, a list of them, an explanation or a list of explanations, in words. */
export function words(x: Msg): string
export function words(x: readonly Msg[]): string[]
export function words(x: Explanation): ExplanationText
export function words(x: readonly Explanation[]): ExplanationText[]
export function words(x: Msg | null | undefined): string | null | undefined
export function words(x: Explanation | null | undefined): ExplanationText | null | undefined
export function words(x: unknown): unknown {
  if (x == null) return x
  if (Array.isArray(x)) return x.map((y) => words(y as Msg))
  if (isMsg(x)) return renderMsg(x, PLATFORM_CURRENCY)
  return renderExplanation(x as Explanation, PLATFORM_CURRENCY)
}
