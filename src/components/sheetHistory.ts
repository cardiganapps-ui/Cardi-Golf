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
 *   a back) is stepped over, so no back press is ever spent on nothing.
 * - `leaveSheetHistory()` gives the entry back before a screen navigates away
 *   with `replace` from inside a sheet. Otherwise the replace would land on the
 *   sheet's entry and back would return to the page just left (a deleted item).
 */
const MARK = 'poloSheet'

/** Open sheets, outermost first. */
const open: string[] = []
const closers = new Map<string, () => void>()
/** Our entry is the current history entry. */
let entryCurrent = false
/** A back we issued ourselves: its popstate is ours, not the person's. */
let ownBack: { repush: boolean; done?: () => void; timer: ReturnType<typeof setTimeout> } | null = null
let giveBackTimer: ReturnType<typeof setTimeout> | null = null
let listening = false

const isMark = (state: unknown) => !!state && typeof state === 'object' && (state as Record<string, unknown>)[MARK] === true

function push() {
  window.history.pushState({ ...((window.history.state as object | null) ?? {}), [MARK]: true }, '')
  entryCurrent = true
}

function ourBack(repush: boolean, done?: () => void) {
  // If its popstate never comes, forget it: a later back is the person's.
  const timer = setTimeout(() => {
    if (ownBack?.timer === timer) {
      ownBack = null
      done?.()
    }
  }, 1000)
  ownBack = { repush, done, timer }
  window.history.back()
}

function onPopState() {
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
    // Landed on an entry left behind (a reload with a sheet open): step over it too.
    else if (isMark(window.history.state)) ourBack(true)
    if (top) closers.get(top)?.()
    return
  }
  if (open.length === 0 && isMark(window.history.state)) {
    // An entry left behind (a link followed from inside a sheet, a forward after a back): step over it.
    ourBack(true)
  }
}

function listen() {
  if (listening || typeof window === 'undefined') return
  listening = true
  window.addEventListener('popstate', onPopState)
}

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
    // The page navigated meanwhile (a link inside the sheet): our entry is no longer current, history is left alone.
    if (!isMark(window.history.state)) return
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
  },
}
