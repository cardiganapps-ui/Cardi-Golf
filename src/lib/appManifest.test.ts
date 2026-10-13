/**
 * PWA-09: the manifest a tournament's pages point at is the app's own manifest with that tournament's start
 * URL, the same app (`id`), and nothing about the tournament in it.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import handler from '../../api/manifest'
import { APP_MANIFEST, startUrlFor } from './appManifest'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
function token(name: string): string | undefined {
  return read('../styles/tokens.css').match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})\\b`))?.[1]?.toLowerCase()
}

function call(query: Record<string, unknown>) {
  const out: { status?: number; headers: Record<string, string>; body?: string } = { headers: {} }
  const res = {
    setHeader: (k: string, v: string) => void (out.headers[k.toLowerCase()] = v),
    status: (code: number) => {
      out.status = code
      return res
    },
    send: (body: string) => void (out.body = body),
  }
  handler({ query } as never, res as never)
  return { ...out, json: JSON.parse(out.body ?? 'null') as Record<string, unknown> }
}

describe('a tournament’s manifest (PWA-09)', () => {
  it('opens the tournament it was installed from, and is the same app', () => {
    const r = call({ t: 'nachos-bachelor' })
    expect(r.status).toBe(200)
    expect(r.headers['content-type']).toBe('application/manifest+json')
    expect(r.json).toEqual({ ...APP_MANIFEST, start_url: '/?t=nachos-bachelor' })
    expect(r.json.id).toBe('/')
  })

  it('a code reads as the slug the server would read: lower case', () => {
    expect(startUrlFor('NACHO1')).toBe('/?t=nacho1')
  })

  it('anything that is not a slug gets the app’s own start URL', () => {
    for (const t of ['', '_/full12-live', '../admin', 'a b', 'x', ['a', 'b']]) expect(call({ t }).json.start_url).toBe('/')
  })
})

describe('the colors painted before any stylesheet loads', () => {
  it('are the tokens’ paper and fairway, and index.html’s theme-color', () => {
    expect(APP_MANIFEST.background_color.toLowerCase()).toBe(token('--bg'))
    expect(APP_MANIFEST.theme_color.toLowerCase()).toBe(token('--accent'))
    const meta = read('../../index.html').match(/<meta name="theme-color" content="(#[0-9a-fA-F]{6})"/)?.[1]
    expect(meta?.toLowerCase()).toBe(APP_MANIFEST.theme_color.toLowerCase())
  })
})
