/**
 * SEC-08: a shared secret is compared in constant time. Both sides are hashed
 * first, so neither the length nor the first differing byte of the expected
 * value shows in how long the answer takes.
 */
import { createHash, timingSafeEqual } from 'node:crypto'

const digest = (s: string) => createHash('sha256').update(s, 'utf8').digest()

/** True when the request's Authorization header is exactly `Bearer <secret>`. False for a missing secret. */
export function bearerMatches(header: string | string[] | undefined, secret: string | undefined): boolean {
  if (!secret) return false
  const got = Array.isArray(header) ? header.join(',') : (header ?? '')
  return timingSafeEqual(digest(got), digest(`Bearer ${secret}`))
}
