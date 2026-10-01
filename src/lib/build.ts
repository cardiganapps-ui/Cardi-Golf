/**
 * Which build this phone runs (PWA-03). Every client computes standings and
 * money itself, so the Comité has to be able to tell who is behind: Más shows
 * the label, and `app_flags.minBuild` can require a build or newer.
 */
export const BUILD = { id: __BUILD_ID__, sha: __BUILD_SHA__ }

/** «1 oct 2026, 03:40 · abc1234», in the tournament's usual zone-free local time. */
export function buildLabel(build: { id: number; sha: string } = BUILD): string {
  const when = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(build.id * 1000))
  return `${when} · ${build.sha}`
}

/** True when the server asks for a newer build than this one. Anything but a number asks for nothing. */
export function belowMinBuild(minBuild: unknown, id: number = BUILD.id): boolean {
  return typeof minBuild === 'number' && Number.isFinite(minBuild) && id < minBuild
}
