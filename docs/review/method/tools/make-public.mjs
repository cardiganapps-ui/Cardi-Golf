#!/usr/bin/env node
// Public-safe copy of the findings: while the repository is public (CHAIR-02), findings that would hand an
// outsider a working attack recipe keep their ID, severity, verdict, area, status and effort, but their
// evidence, reproduction and verification details are withheld (they stay in the private report).
//   node make-public.mjs  -> $S/final/findings.public.json
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const S = path.resolve(new URL('..', import.meta.url).pathname)
const final = JSON.parse(readFileSync(path.join(S, 'final', 'findings.json'), 'utf8'))
const WITHHELD = 'Details withheld from this public repository while it is public (CHAIR-02); the full evidence and reproduction are in the private report.'
const R = {
  'SEC-02': ['Integrity: score provenance is client-asserted, so discrepancy detection and the audit trail can be defeated from inside a group', 'A player could change a group mate\'s score without the discrepancy flag or an honest audit entry.', 'Derive provenance on the server from the authenticated principal and make discrepancy detection independent of client fields.'],
  'SEC-03': ['Outbound request hardening: user-supplied push endpoints are not restricted (request-forgery class)', 'The push dispatcher can be made to send requests to hosts the operator never intended.', 'Allow-list push service hosts and validate endpoints when they are saved and when they are used.'],
  'SEC-04': ['Abuse resistance: the PIN lockout can be triggered against other players', 'Someone other than the player could keep players out of Entrar on the day.', 'Rate-limit at the edge and redesign the lockout so only the device attempting the PIN is slowed; alert on bursts.'],
  'SEC-05': ['Availability: an expensive read path can exhaust the database statement budget', 'A cheap request pattern could degrade the database for everyone.', 'Index the predicate, move the read behind a definer RPC with limits, and budget query cost.'],
  'SEC-06': ['Data minimisation: an anonymous tournament lookup returns more of the roster than the join step needs', 'Strangers can learn the field\'s full names and photos.', 'Return display names only before a claim; use unguessable slugs or invite links.'],
  'SEC-07': ['Shared-device session isolation is weak', 'A borrowed or lost phone keeps more access than it should.', 'Offer global sign-out and clear local state on sign-out.'],
  'SEC-08': ['A secret comparison in a serverless route is not constant-time', 'A theoretical timing side channel on an operational secret.', 'Use a constant-time comparison.'],
  'SEC-09': ['The push service worker follows payload URLs without an origin check', 'Defence in depth only: every current sender is trusted.', 'Accept only same-origin paths in notification clicks.'],
  'SEC-10': ['Social actions (friend requests, proposals, notices) are not rate-limited', 'A single account could spam other people.', 'Rate-limit per sender and per recipient; add block/report flows.'],
  'SEC-11': ['A score write policy does not bind every key to the tournament', 'An organizer could attach a record to the wrong tenant\'s player (own-tenant integrity).', 'Add the tenant bind to the policy\'s WITH CHECK and a test for it.'],
  'TRUST-07': ['Storage exposure: the public bucket is listable and uploads never expire', 'Uploaded files can be enumerated and remain reachable indefinitely.', 'Disable listing, use unguessable paths or signed URLs, and add retention.'],
  'TRUST-08': ['Profiles are discoverable by default and the directory can be enumerated', 'People\'s names, photos, clubs and cities can be collected.', 'Make discovery opt-in and limit what search returns.'],
  'TRUST-11': ['Crew membership controls are too permissive', 'People can end up with access to a group\'s profiles that the owner cannot revoke.', 'Owner approval and removal; expiring invite codes.'],
  'TRUST-15': ['Signing out does not clear a device\'s previous identity for offline use', 'On a shared phone, the previous player\'s access and data can reappear.', 'Wipe the cached identity and snapshot on sign-out or player change.'],
  'TRUST-23': ['A quick round can expose a friend\'s private profile data to people outside it', 'Private names, photos and indexes can reach strangers.', 'Copy only consented fields into a shared round and honour «No soy yo».'],
  'TRUST-10': ['Backups carry secret-shaped and personal fields indefinitely', 'A leaked backup would expose more than it needs to.', 'Exclude secret material, encrypt with an operator-held key, and add retention.'],
}
const pub = final.map((f) => {
  const r = R[f.id]
  if (!r) return f
  return { ...f, title: r[0], evidence: [WITHHELD], impact: r[1], recommendation: `${r[2]} ${WITHHELD}`, repro: WITHHELD, verification: f.verification ? `Independently verified; ${WITHHELD}` : undefined, withheld: true }
})
// Scrub the shared rehearsal PIN anywhere else in the public copy.
const scrub = (s) => (typeof s === 'string' ? s.replace(/\bPIN 1234\b/g, 'the shared rehearsal PIN').replace(/\b1234\b/g, '••••') : s)
const out = pub.map((f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, Array.isArray(v) ? v.map(scrub) : scrub(v)])))
writeFileSync(path.join(S, 'final', 'findings.public.json'), JSON.stringify(out, null, 2))
console.log('public findings:', out.length, 'withheld:', out.filter((f) => f.withheld).length, 'missing ids:', Object.keys(R).filter((id) => !final.some((f) => f.id === id)).join(',') || 'none')
