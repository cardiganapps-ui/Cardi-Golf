/**
 * The system back closes the open sheet, not the screen under it (PWA-05).
 *
 * One history entry stands for «a sheet is open», shared by every sheet: the
 * same URL with a marker in the state.
 * - Back pops it and the top sheet closes. If more sheets are open under it,
 *   the entry is pushed again, so the next back closes the next one.
 * - A sheet closed any other way («Cerrar», the backdrop, Escape, an action)
 *   gives the entry back a tick later, and only if no sheet is open by then. A
 *   sheet that closes while another opens in the same render (the Tarjeta's
 *   «¿Seguro?» then «¿Quién embocó al último?») keeps the entry for the new one.
 *   A back per sheet used to land on the new sheet and close it at once; React's
 *   StrictMode (open, close, open) did the same to every sheet in dev.
 * - An entry left behind (a link followed from inside a sheet, a forward after
 *   a back, a reload with a sheet open) is stepped over, so no back press is
 *   ever spent on nothing: back when the person came down onto it, forward
 *   when they came up from the page under it and a page lies beyond it.
 * - `leaveSheetHistory()` gives the entry back before a screen navigates away
 *   with `replace` from inside a sheet. Otherwise the replace would land on the
 *   sheet's entry and back would return to the page just left (a deleted item).
 */
const MARK = 'poloSheet'
/** Which push of our entry this is, to know a buried one again. */
const MARK_ID = 'poloSheetId'

/** Open sheets, outermost first. */
const open: string[] = []
const closers = new Map<string, () => void>()
/** Our entry is the current history entry. */
let entryCurrent = false
/** A back we issued ourselves: its popstate is ours, not the person's. */
let ownBack: { repush: boolean; done?: () => void; timer: ReturnType<typeof setTimeout> } | null = null
let giveBackTimer: ReturnType<typeof setTimeout> | null = null
let listening = false
/** The id of our entry while it is current. */
let currentMark: string | null = null
let markSeq = 0
/** Our entries that a navigation from inside a sheet buried under a page: a forward from below goes on past them. */
const buried = new Set<string>()
/** The history state the person was last seen on, to tell which way they came onto an entry left behind. */
let lastSeen: unknown = null

const field = (state: unknown, key: string) => (state && typeof state === 'object' ? (state as Record<string, unknown>)[key] : undefined)
const isMark = (state: unknown) => field(state, MARK) === true

function push() {
  currentMark = `${Date.now().toString(36)}.${++markSeq}`
  const state = { ...((window.history.state as object | null) ?? {}), [MARK]: true, [MARK_ID]: currentMark }
  window.history.pushState(state, '')
  lastSeen = state
  entryCurrent = true
}

/** A move we make ourselves (back, or forward past a buried entry): its popstate is ours, not the person's. */
function ourMove(delta: -1 | 1, repush: boolean, done?: () => void) {
  // If its popstate never comes, forget it: a later back is the person's.
  const timer = setTimeout(() => {
    if (ownBack?.timer === timer) {
      ownBack = null
      done?.()
    }
  }, 1000)
  ownBack = { repush, done, timer }
  if (delta < 0) window.history.back()
  else window.history.forward()
}
const ourBack = (repush: boolean, done?: () => void) => ourMove(-1, repush, done)

/** An entry left behind with no sheet open: off it, the way the person was going. */
function stepOver(prev: unknown) {
  const here = window.history.state
  // Up from the page under it (the same router entry, not one of ours), with a page beyond it: on to that page.
  const fromBelow = !isMark(prev) && field(prev, 'key') !== undefined && field(prev, 'key') === field(here, 'key')
  const id = field(here, MARK_ID)
  if (fromBelow && typeof id === 'string' && buried.has(id)) ourMove(1, true)
  else ourBack(true)
}

function onPopState() {
  const prev = lastSeen
  lastSeen = window.history.state
  if (ownBack) {
    const own = ownBack
    ownBack = null
    clearTimeout(own.timer)
    own.done?.()
    // A sheet opened while our back was on its way: it needs the entry again.
    if (own.repush && open.length > 0 && !entryCurrent) push()
    return
  }
  if (entryCurrent) {
    // The person went back from our entry (nothing lies after it: a push drops the forward entries).
    // The top sheet closes, and the ones under it keep an entry.
    entryCurrent = false
    const top = open[open.length - 1]
    if (open.length > 1) push()
    // Landed on an entry left behind: step over it too.
    else if (isMark(window.history.state)) ourBack(true)
    if (top) closers.get(top)?.()
    return
  }
  if (open.length === 0 && isMark(window.history.state)) stepOver(prev)
}

function listen() {
  if (listening || typeof window === 'undefined') return
  listening = true
  window.addEventListener('popstate', onPopState)
}

/**
 * At start: a reload with a sheet open lands on its entry with no sheet, and
 * the first back would be spent on nothing. Step off it now.
 */
function boot() {
  if (typeof window === 'undefined') return
  listen()
  lastSeen = window.history.state
  if (isMark(window.history.state)) ourBack(false)
}
boot()

/** A sheet opened: back closes it. */
export function sheetOpened(id: string, close: () => void) {
  listen()
  open.push(id)
  closers.set(id, close)
  if (giveBackTimer) {
    clearTimeout(giveBackTimer)
    giveBackTimer = null
  }
  if (!entryCurrent && !ownBack) push()
}

/** A sheet closed or unmounted: the last one out gives the entry back, a tick later. */
export function sheetClosed(id: string) {
  const i = open.indexOf(id)
  if (i >= 0) open.splice(i, 1)
  closers.delete(id)
  if (open.length > 0 || !entryCurrent || giveBackTimer) return
  giveBackTimer = setTimeout(() => {
    giveBackTimer = null
    if (open.length > 0 || !entryCurrent) return
    entryCurrent = false
    // The page navigated meanwhile (a link inside the sheet): our entry is buried under the new page, and history is left alone.
    if (!isMark(window.history.state)) {
      if (currentMark) buried.add(currentMark)
      return
    }
    ourBack(true)
  }, 0)
}

/** Whether this sheet is the top one (Escape closes only that one). */
export function isTopSheet(id: string): boolean {
  return open[open.length - 1] === id
}

export function anySheetOpen(): boolean {
  return open.length > 0
}

/**
 * Before navigating away with `replace` from inside a sheet: give the sheet's
 * entry back first, so the replace lands on the page's own entry.
 */
export function leaveSheetHistory(): Promise<void> {
  if (giveBackTimer) {
    clearTimeout(giveBackTimer)
    giveBackTimer = null
  }
  if (!entryCurrent || !isMark(window.history.state)) return Promise.resolve()
  entryCurrent = false
  return new Promise((resolve) => ourBack(false, resolve))
}

/** Tests only. */
export const _sheetHistoryTest = {
  reset() {
    open.length = 0
    closers.clear()
    entryCurrent = false
    if (ownBack) clearTimeout(ownBack.timer)
    ownBack = null
    if (giveBackTimer) clearTimeout(giveBackTimer)
    giveBackTimer = null
    if (listening) window.removeEventListener('popstate', onPopState)
    listening = false
    currentMark = null
    buried.clear()
    lastSeen = null
  },
  /** What the module does when the app starts, against the history installed now. */
  boot,
}
