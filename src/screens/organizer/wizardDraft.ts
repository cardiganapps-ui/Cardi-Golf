/**
 * What the «Nuevo torneo» wizard holds, kept in this tab's sessionStorage
 * (UX-05). The step is in the address, so a reload, the system back or the
 * phone dropping the page in the background used to start the wizard over,
 * empty; now it opens on the step it was on with what was typed.
 *
 * sessionStorage, not localStorage: a draft belongs to this tab and goes
 * when the tab does, so no stale tournament greets the next visit. It is
 * cleared when the tournament is created and when the organizer leaves the
 * wizard on purpose («Salir y borrar»). A stored draft that no longer reads
 * (another build's shape, settings the schema now refuses, storage blocked)
 * is dropped, and the wizard starts blank.
 */
import { safeParseSettings, type TournamentSettings } from '../../engine/settings/schema'

const KEY = 'cardi-golf:wizard-draft'
/** Bumped when the shape changes, so an older draft is dropped instead of misread. */
const VERSION = 1

export interface WizardDraft {
  name: string
  tagline: string
  players: number
  settings: TournamentSettings
  /** No setting edited by hand since the last template: a template may replace them without asking. */
  pristine: boolean
}

/** The design fixture keeps its own draft, so a look at the demo never fills the real wizard. */
export const draftKey = (demo: boolean) => (demo ? `${KEY}:demo` : KEY)

export function readDraft(key: string): WizardDraft | null {
  let raw: string | null = null
  try {
    raw = sessionStorage.getItem(key)
  } catch {
    return null
  }
  if (!raw) return null
  try {
    const d = JSON.parse(raw) as Partial<WizardDraft> & { v?: unknown }
    const settings = safeParseSettings(d.settings)
    const players = d.players
    if (d.v !== VERSION || typeof d.name !== 'string' || typeof d.tagline !== 'string' || typeof d.pristine !== 'boolean') throw new Error('shape')
    if (typeof players !== 'number' || !Number.isInteger(players) || players < 2 || players > 200 || !settings.success) throw new Error('shape')
    return { name: d.name, tagline: d.tagline, players, settings: settings.data, pristine: d.pristine }
  } catch {
    clearDraft(key)
    return null
  }
}

export function writeDraft(key: string, draft: WizardDraft): void {
  try {
    sessionStorage.setItem(key, JSON.stringify({ v: VERSION, ...draft }))
  } catch {
    // Private mode or a full quota: the wizard still works, it just won't survive a reload.
  }
}

export function clearDraft(key: string): void {
  try {
    sessionStorage.removeItem(key)
  } catch {
    // Nothing stored, nothing to clear.
  }
}
