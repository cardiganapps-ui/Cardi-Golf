/**
 * SEC-01: every page goes out with a Content-Security-Policy and the framing,
 * MIME and referrer headers (vercel.json). The fixture browser suite serves its
 * build with these same headers and fails on any violation; this holds the
 * policy itself: what it allows, and the hash of index.html's boot script.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
  headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>
}
const site = vercel.headers.find((h) => h.source === '/(.*)')
const header = (key: string) => site?.headers.find((h) => h.key.toLowerCase() === key.toLowerCase())?.value
const directives = Object.fromEntries(
  (header('Content-Security-Policy') ?? '')
    .split(';')
    .map((d) => d.trim().split(/\s+/))
    .filter((d) => d[0])
    .map(([name, ...values]) => [name, values]),
) as Record<string, string[] | undefined>
const csp = (name: string): string[] => directives[name] ?? []

describe('security headers (SEC-01)', () => {
  it('cover every route', () => {
    expect(site).toBeTruthy()
    expect(vercel.headers[0]).toBe(site)
  })

  it('refuse framing, sniffing and leaking the path to other sites', () => {
    expect(csp('frame-ancestors')).toEqual(["'none'"])
    expect(header('X-Frame-Options')).toBe('DENY')
    expect(header('X-Content-Type-Options')).toBe('nosniff')
    expect(header('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(header('Strict-Transport-Security')).toMatch(/max-age=\d{8,}; includeSubDomains/)
    expect(header('Permissions-Policy')).toContain('camera=()')
  })

  it('run only the app’s own scripts: no eval, no inline script but the boot one', () => {
    expect(csp('default-src')).toEqual(["'self'"])
    expect(csp('object-src')).toEqual(["'none'"])
    expect(csp('base-uri')).toEqual(["'none'"])
    const script = csp('script-src')
    expect(script).not.toContain("'unsafe-inline'")
    expect(script).not.toContain("'unsafe-eval'")
    expect(script.filter((s) => !s.startsWith("'sha256-"))).toEqual(["'self'"])
  })

  it('allow every inline script index.html has, and nothing more', () => {
    const html = readFileSync('index.html', 'utf8')
    const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
      (m) =>
        `'sha256-${createHash('sha256')
          .update(m[1] ?? '', 'utf8')
          .digest('base64')}'`,
    )
    expect(hashes.length).toBeGreaterThan(0)
    expect(
      csp('script-src')
        .filter((s) => s.startsWith("'sha256-"))
        .sort(),
    ).toEqual(hashes.sort())
  })

  it('reach the database and its live channel, and nothing else off the site', () => {
    expect(csp('connect-src')).toEqual(["'self'", 'https://*.supabase.co', 'wss://*.supabase.co'])
    // Photos and logos live in Supabase Storage; share cards read them as data URLs, confetti draws in a blob worker.
    expect(csp('img-src')).toEqual(["'self'", 'data:', 'blob:', 'https://*.supabase.co'])
    expect(csp('worker-src')).toEqual(["'self'", 'blob:'])
  })
})
