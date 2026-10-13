import { TOURNAMENT_SEGMENT } from './appManifest'

/**
 * What a player typed or pasted to join a tournament (PWA-09): its 6-character code, its name in a link
 * (`…/t/<slug or code>`, anywhere in the text, so the whole invitation can be pasted), the code out of the
 * invitation's own words («entra con el código NACHO1»), or a slug on its own. The route's segment, or
 * null. The field took six letters and digits only, so a pasted link read «HTTPS».
 */
export function joinTarget(input: string): string | null {
  const text = input.trim()
  if (!text) return null
  const link = /\/t\/([A-Za-z0-9][A-Za-z0-9-]*)/.exec(text)
  if (link) return TOURNAMENT_SEGMENT.test(link[1]!) ? link[1]! : null
  const said = /c[oó]digo(?:\s+es)?\s*:?\s*([A-Za-z0-9]{6})(?![A-Za-z0-9])/i.exec(text)
  if (said) return said[1]!.toUpperCase()
  if (/\s/.test(text)) return null
  return TOURNAMENT_SEGMENT.test(text) ? text : null
}
