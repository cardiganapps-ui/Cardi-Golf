/**
 * A file of public/ at its fingerprint (PERF-13): `/brand/polo-mark.png?v=<first ten hex of its sha256>`, as
 * vite.config.ts gives the icons. A new file is a new URL, so the server can let every phone keep these for a
 * year (vercel.json: only a request that carries `v`), and the service worker still finds them in its precache
 * (it ignores `v`). A path the build has no fingerprint for comes back as it is.
 */
export function assetUrl(path: string): string {
  return __ASSET_URLS__[path] ?? path
}
