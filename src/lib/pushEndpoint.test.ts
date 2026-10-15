/**
 * SEC-03: only a browser push service is a push endpoint, and the database's
 * list (0055 push_endpoint_ok) is this one.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PUSH_HOST_SUFFIXES, PUSH_HOSTS, pushEndpointOk } from './pushEndpoint'

describe('pushEndpointOk (SEC-03)', () => {
  it('takes the endpoints the browsers give', () => {
    for (const e of [
      'https://fcm.googleapis.com/fcm/send/dXy:APA91b-abc',
      'https://updates.push.services.mozilla.com/wpush/v2/gAAAAAB',
      'https://web.push.apple.com/QGx2',
      'https://wns2-by3p.notify.windows.com/w/?token=BQYA',
      'https://FCM.googleapis.com/fcm/send/x',
      'https://fcm.googleapis.com:443/fcm/send/x',
    ])
      expect(pushEndpointOk(e), e).toBe(true)
  })
  it('refuses any other host, scheme, port, a user in the address, an address too long or none', () => {
    for (const e of [
      'https://httpbin.org/status/201',
      'https://169.254.169.254/latest/meta-data',
      'https://localhost/x',
      'http://fcm.googleapis.com/fcm/send/x',
      'https://fcm.googleapis.com:8443/fcm/send/x',
      'https://fcm.googleapis.com.evil.test/x',
      'https://evil.test/#@fcm.googleapis.com',
      'https://user:pw@fcm.googleapis.com/fcm/send/x',
      'https://push.apple.com/x',
      'https://notify.windows.com/x',
      'not a url',
      '',
      `https://fcm.googleapis.com/fcm/send/${'x'.repeat(2100)}`,
      undefined,
      null,
      7,
    ])
      expect(pushEndpointOk(e), String(e)).toBe(false)
  })
  it('the migration checks the same hosts', () => {
    const sql = readFileSync(new URL('../../supabase/migrations/0055_push_endpoints.sql', import.meta.url), 'utf8')
    const exact = /array\[([^\]]+)\]/.exec(sql)![1]!.match(/'([^']+)'/g)!.map((x) => x.slice(1, -1))
    expect(exact).toEqual([...PUSH_HOSTS])
    for (const suffix of PUSH_HOST_SUFFIXES) expect(sql).toContain(`${suffix.replaceAll('.', '\\.')}$'`)
  })
})
