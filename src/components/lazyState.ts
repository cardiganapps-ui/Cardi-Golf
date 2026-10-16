/** Whether any lazily loaded screen has reached the page yet (src/components/Lazy.tsx). */
let shown = false

/** How long a loading screen shows nothing before its skeleton (MOT-22). */
export const LATE_MS = 200

export function screenShown(): boolean {
  return shown
}

export function markScreenShown(): void {
  shown = true
}

/** For tests: as if no screen had shown yet. */
export function resetLazyForTests(): void {
  shown = false
}
