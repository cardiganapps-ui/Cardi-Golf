/**
 * Tiny toast queue. `toast(msg)` from anywhere; an optional action stays 6 s instead of 2.8 s. The `Toasts`
 * region (ui.tsx) shows them. Apart from it so ui.tsx exports components only (QA-15: fast refresh).
 */
export interface ToastMsg {
  id: number
  msg: string
  action?: string
  onAction?: () => void
  until: number
}
export type ToastIn = Omit<ToastMsg, 'id' | 'until'>

let listeners: Array<(m: ToastIn) => void> = []

export function toast(msg: string, action?: { label: string; onClick: () => void }) {
  listeners.forEach((l) => l({ msg, action: action?.label, onAction: action?.onClick }))
}

/** The region's ear: every toast from now on, until the returned call. */
export function onToast(l: (m: ToastIn) => void): () => void {
  listeners.push(l)
  return () => {
    listeners = listeners.filter((x) => x !== l)
  }
}
