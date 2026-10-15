/**
 * SEC-03: a push subscription's endpoint is an address our server calls. Only
 * the browsers' push services are such an address: Chrome and Edge's
 * (fcm.googleapis.com), Firefox's (updates.push.services.mozilla.com),
 * Safari's (*.push.apple.com) and Windows' (*.notify.windows.com), over https
 * on its own port, with no user or password in it. Anything else, saved or
 * sent, is refused, so the dispatcher cannot be made to call a host nobody
 * meant. The database checks the same list (0055 `push_endpoint_ok`;
 * pushEndpoint.test.ts holds the two equal).
 */
export const PUSH_HOSTS = ['fcm.googleapis.com', 'updates.push.services.mozilla.com'] as const
export const PUSH_HOST_SUFFIXES = ['.push.apple.com', '.notify.windows.com'] as const

export function pushEndpointOk(endpoint: unknown): boolean {
  if (typeof endpoint !== 'string' || endpoint.length > 2048) return false
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return false
  const host = url.hostname.toLowerCase()
  return (PUSH_HOSTS as readonly string[]).includes(host) || PUSH_HOST_SUFFIXES.some((s) => host.endsWith(s) && host.length > s.length)
}
