/**
 * PINs the Comité hands out (UX-20): four random digits each, and the invite
 * that goes with them. A PIN is only ever on the Comité's screen while it is
 * open and in the message the Comité chooses to send; the server keeps its
 * hash (`set_player_pin`). Never in a link, a log or telemetry.
 */

/** PINs a person would guess first: one digit four times, and a run up or down («1234», «9876»). */
export function weakPin(pin: string): boolean {
  if (!/^\d{4}$/.test(pin)) return true
  const d = Array.from(pin, Number)
  if (d.every((x) => x === d[0])) return true
  const up = d.every((x, i) => i === 0 || x === d[i - 1]! + 1)
  const down = d.every((x, i) => i === 0 || x === d[i - 1]! - 1)
  return up || down
}

/** One random four-digit PIN, uniform over the ones not weak, from the browser's cryptographic source. */
export function randomPin(random: (buf: Uint16Array) => Uint16Array = (b) => crypto.getRandomValues(b)): string {
  const buf = new Uint16Array(8)
  for (;;) {
    random(buf)
    for (const v of buf) {
      // 60,000 is the largest multiple of 10,000 under 65,536: anything above it would favour the low PINs.
      if (v >= 60_000) continue
      const pin = String(v % 10_000).padStart(4, '0')
      if (!weakPin(pin)) return pin
    }
  }
}

/** `n` PINs, all different, so two players reading theirs aloud never hear the same one. */
export function randomPins(n: number, random?: (buf: Uint16Array) => Uint16Array): string[] {
  const out = new Set<string>()
  while (out.size < n) out.add(randomPin(random))
  return [...out]
}

/** The link that opens Entrar on this player's face (`?soy=`, read by EnterScreen): the tournament and the player, never the PIN. */
export function inviteUrl(origin: string, slug: string, playerId: string): string {
  return `${origin}/t/${slug}?soy=${encodeURIComponent(playerId)}`
}

/**
 * Hands a message to WhatsApp: the phone's share sheet where there is one (it lists WhatsApp), else WhatsApp's own
 * link, which opens the app or its web page with the message written. A share the person closed is no error.
 */
export async function shareToWhatsApp(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ text })
      return
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return
    }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
}
