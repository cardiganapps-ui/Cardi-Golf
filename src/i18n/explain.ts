/**
 * The engine's messages in words (ARCH-05). The engine says what happened as
 * codes and figures (src/engine/messages.ts); this turns them into the
 * Spanish of `explain` in es-MX.ts, money in the tournament's currency. Screens call it
 * where they show an explanation or a warning: `ExplanationSheet`, the
 * warnings' lists, the share text.
 */
import type { Explanation, ExplanationText, Msg } from '../engine/messages.js'
import { formatMoney, formatMoneyCents, formatSignedMoney } from '../lib/money.js'
import { explain, type MsgFormat } from './es-MX.js'

type Render = (params: unknown, f: MsgFormat) => string
const CATALOG = explain as unknown as Record<string, Render>

const formats = new Map<string, MsgFormat>()
/** How figures are written in `currency`: one per currency, reused. */
function formatFor(currency: string): MsgFormat {
  let f = formats.get(currency)
  if (!f) {
    // Whole units, as the engine's amounts are; `|| 0` so a rounded −0.4 is «$0», never «−$0».
    const whole = (n: number) => Math.round(n) || 0
    const self: MsgFormat = {
      money: (n) => formatMoney(whole(n), currency),
      moneyCents: (n) => formatMoneyCents(n, currency),
      signedMoney: (n) => formatSignedMoney(whole(n), currency),
      msg: (m) => render(m, self),
    }
    formats.set(currency, (f = self))
  }
  return f
}

function render(m: Msg, f: MsgFormat): string {
  const fn = CATALOG[m.code]
  // A code this build's catalog lacks (a newer engine's state cached on the phone) says nothing rather than break a sheet.
  return fn ? fn(m.params, f) : ''
}

/** One message in words, money in `currency`. */
export function renderMsg(m: Msg, currency: string): string {
  return render(m, formatFor(currency))
}

/** An explanation in words. */
export function renderExplanation(why: Explanation, currency: string): ExplanationText {
  const f = formatFor(currency)
  return { title: render(why.title, f), steps: why.steps.map((s) => render(s, f)) }
}

const isMsg = (x: unknown): x is Msg => !!x && typeof x === 'object' && 'code' in x && 'params' in x

/** A text that is a message or already words (a key path, zod's own refusal): in words either way. */
export function renderText(x: string | Msg, currency: string): string {
  return typeof x === 'string' ? x : renderMsg(x, currency)
}

/**
 * A settings refusal in words: the engine's own carries its message in `params.msg` (src/engine/settings/schema.ts,
 * ARCH-05); zod's own refusals of a value's shape keep zod's message.
 */
export function issueWords(issue: { message: string; params?: unknown }, currency: string): string {
  const m = (issue.params as { msg?: unknown } | undefined)?.msg
  return isMsg(m) ? renderMsg(m, currency) : issue.message
}
