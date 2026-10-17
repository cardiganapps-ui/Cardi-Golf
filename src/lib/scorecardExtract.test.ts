/**
 * POST /api/scorecard-extract (§13b-B, QA-14): the one route that spends money (each read is a paid call),
 * end to end with the real SDK and the network stubbed. The gate answers before anything reaches Anthropic;
 * a body that is not a photo the route takes is refused in Spanish before it is sent; the card comes back as
 * a draft with what doesn't add up named; each failure upstream is the status the UI reads; the key never
 * reaches the answer or the logs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { callRoute, leaked, type RouteRequest } from './testing/route'

const db = vi.hoisted(() => ({ tokens: [] as Array<string | undefined> }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: (_url: string, _key: string, opts: { global?: { headers?: Record<string, string> } }) => {
    const token = opts.global?.headers?.Authorization
    db.tokens.push(token)
    return {
      rpc: async () => (token === 'Bearer comite-token' ? { data: true, error: null } : { data: false, error: null }),
    }
  },
}))

const KEY = 'sk-ant-test-secret-333'
const ENV = {
  VITE_SUPABASE_URL: 'https://db.invalid',
  VITE_SUPABASE_ANON_KEY: 'anon-key-public',
  ANTHROPIC_API_KEY: KEY,
}

interface Sent {
  url: string
  headers: Headers
  body: {
    model: string
    max_tokens: number
    messages: Array<{ content: Array<Record<string, unknown>> }>
    output_config: { format: { type: string; schema: unknown } }
  }
}
const sent: Sent[] = []
/** What Anthropic answers each call; a function so a test can fail the network itself. */
let answer: () => Response | Promise<Response>

const hole = (number: number, par = 4, strokeIndex = number) => ({ number, par, strokeIndex, yards: 380 })
const TEE = {
  name: 'Azules',
  color: 'azul',
  rating: 71.2,
  slope: 128,
  parTotalPrinted: 72,
  holes: Array.from({ length: 18 }, (_, i) => hole(i + 1)),
  confidence: 'high',
}
/** A Messages API answer whose text is `card`. */
function message(card: unknown, stop_reason = 'end_turn', text = JSON.stringify(card)) {
  const body = {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'm',
    content: text == null ? [] : [{ type: 'text', text }],
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 1000, output_tokens: 300 },
  }
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}
/** An API error; told not to retry, as the SDK otherwise waits and tries twice more. */
const apiError = (status: number) =>
  new Response(
    JSON.stringify({ type: 'error', error: { type: 'x', message: `upstream ${status} for ${KEY.slice(0, 6)}` } }),
    { status, headers: { 'content-type': 'application/json', 'x-should-retry': 'false' } },
  )

const IMAGE = Buffer.from('a scorecard').toString('base64')

beforeEach(() => {
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v)
  answer = () => message({ courseName: 'Solmar Golf Links', tees: [TEE] })
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init)
    sent.push({ url: req.url, headers: req.headers, body: await req.json() })
    return answer()
  })
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.resetModules()
  sent.length = 0
  db.tokens = []
})

async function extract(body: unknown, init: RouteRequest = {}) {
  const { default: handler } = await import('../../api/scorecard-extract')
  return callRoute(handler, {
    method: 'POST',
    headers: { authorization: 'Bearer comite-token', 'content-type': 'application/json' },
    body,
    ...init,
  })
}

describe('before anything is sent to Anthropic', () => {
  it('only POST: 405, the gate not even asked', async () => {
    const r = await extract({ image: IMAGE }, { method: 'GET' })
    expect(r.status).toBe(405)
    expect(db.tokens).toEqual([])
    expect(sent).toEqual([])
  })

  it('no session: 401; a session that may not manage courses: 403; nothing sent either way', async () => {
    const none = await extract({ image: IMAGE }, { headers: {} })
    expect(none.status).toBe(401)
    expect(none.body).toEqual({ error: 'Inicia sesión para usar esta función.', code: 'unauthorized' })
    const player = await extract({ image: IMAGE }, { headers: { authorization: 'Bearer player-token' } })
    expect(player.status).toBe(403)
    expect(player.body).toEqual({ error: 'Solo el Comité puede cargar campos.', code: 'forbidden' })
    expect(sent).toEqual([])
  })

  it('ten reads a minute from one address; the eleventh is 429 before the gate is asked', async () => {
    const { default: handler } = await import('../../api/scorecard-extract')
    const call = () =>
      callRoute(handler, {
        method: 'POST',
        headers: { authorization: 'Bearer comite-token' },
        body: { image: IMAGE },
        ip: '203.0.113.9',
      })
    for (let i = 0; i < 10; i++) expect((await call()).status).toBe(200)
    const asked = db.tokens.length
    const over = await call()
    expect(over.status).toBe(429)
    expect(over.body).toEqual({ error: 'Muchas lecturas seguidas; espera un minuto.' })
    expect(db.tokens.length).toBe(asked)
    expect(sent).toHaveLength(10)
  })

  it('without the key: 503 «no_key» with the line the UI shows, only once the caller is the Comité', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    expect((await extract({ image: IMAGE }, { headers: {} })).status).toBe(401)
    const r = await extract({ image: IMAGE })
    expect(r.status).toBe(503)
    expect(r.body).toEqual({ error: 'Lectura de tarjeta pendiente: falta configurar la llave.', code: 'no_key' })
    expect(sent).toEqual([])
  })

  it('a format it does not take: 400, nothing sent', async () => {
    for (const mediaType of ['image/heic', 'text/plain', 42]) {
      const r = await extract({ image: IMAGE, mediaType })
      expect(r.status).toBe(400)
      expect(r.body).toEqual({ error: 'Formato no soportado: usa JPG, PNG, WebP o PDF.' })
    }
    expect(sent).toEqual([])
  })

  it('no image, an image that is not text, or one over 3 MB: 400, nothing sent', async () => {
    const { MAX_IMAGE_CHARS } = await import('../../api/scorecard-extract')
    for (const image of [undefined, '', 12345, { data: IMAGE }, 'x'.repeat(MAX_IMAGE_CHARS + 1)]) {
      const r = await extract({ image, mediaType: 'image/png' })
      expect(r.status).toBe(400)
      expect(r.body).toEqual({ error: 'Falta la imagen o es demasiado grande (máximo 3 MB).' })
    }
    expect(sent).toEqual([])
  })

  it('a body that is not JSON, or none at all: 400, never a 500', async () => {
    for (const body of ['{"image": "abc', undefined, null, '[]', 'null']) {
      const r = await extract(body)
      expect(r.status).toBe(400)
      expect(r.body).toEqual({ error: 'Falta la imagen o es demasiado grande (máximo 3 MB).' })
    }
    expect(sent).toEqual([])
  })
})

describe('the read', () => {
  it('sends the photo once, as an image block, to the route’s one model constant, with the key in its header', async () => {
    const { MODEL } = await import('../../api/scorecard-extract')
    const r = await extract({ image: IMAGE, mediaType: 'image/png' })
    expect(r.status).toBe(200)
    expect(r.headers['cache-control']).toBe('no-store')
    expect(sent).toHaveLength(1)
    expect(sent[0]!.url).toBe('https://api.anthropic.com/v1/messages')
    expect(sent[0]!.headers.get('x-api-key')).toBe(KEY)
    expect(sent[0]!.body.model).toBe(MODEL)
    expect(sent[0]!.body.max_tokens).toBe(16000)
    expect(sent[0]!.body.messages[0]!.content[0]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: IMAGE },
    })
    expect(sent[0]!.body.output_config.format.type).toBe('json_schema')
    expect(leaked(r, [KEY, 'comite-token'])).toEqual([])
  })

  it('a PDF goes as a document; a JSON body sent as text is read the same', async () => {
    const r = await extract(JSON.stringify({ image: IMAGE, mediaType: 'application/pdf' }))
    expect(r.status).toBe(200)
    expect(sent[0]!.body.messages[0]!.content[0]).toEqual({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: IMAGE },
    })
  })

  it('no media type reads as a JPG', async () => {
    await extract({ image: IMAGE })
    expect(sent[0]!.body.messages[0]!.content[0]).toMatchObject({ type: 'image', source: { media_type: 'image/jpeg' } })
  })

  it('a clean card comes back as a draft with its par total and no issues', async () => {
    const r = await extract({ image: IMAGE })
    expect(r.body).toEqual({ courseName: 'Solmar Golf Links', tees: [{ ...TEE, parTotal: 72, issues: [] }] })
  })

  it('names what doesn’t add up: pars against the printed total, stroke indexes that repeat, a hole count that is not 9 or 18', async () => {
    const holes = Array.from({ length: 12 }, (_, i) => hole(i + 1, i === 0 ? 5 : 4, i === 1 ? 1 : i + 1))
    answer = () =>
      message({
        courseName: 'X',
        tees: [
          { ...TEE, parTotalPrinted: 47, holes },
          {
            ...TEE,
            name: 'Nueve',
            parTotalPrinted: null,
            holes: holes.slice(2, 11).map((h, i) => ({ ...h, number: i + 1, strokeIndex: i + 1 })),
          },
        ],
      })
    const r = await extract({ image: IMAGE })
    const tees = (r.body as { tees: Array<{ name: string; parTotal: number; issues: string[] }> }).tees
    expect(tees[0]!.parTotal).toBe(49)
    expect(tees[0]!.issues).toEqual([
      'Los pares suman 49, la tarjeta dice 47.',
      'Los índices de golpe (SI) deben ir del 1 al 12, sin repetir ninguno.',
      'Se leyeron 12 hoyos.',
    ])
    expect(tees[1]).toMatchObject({ name: 'Nueve', parTotal: 36, issues: [] })
  })
})

describe('when the read fails', () => {
  it('a refusal, a card cut short, or one outside the card’s shape: 422 «No pude leer esa tarjeta», never a 500', async () => {
    const answers = [
      () => message(null, 'refusal', null as never),
      () => message(null, 'refusal', 'Lo siento'),
      () => message(null, 'max_tokens', '{"courseName": "Solmar", "tees": [{"name": "Az'),
      () => message({ courseName: 'X', tees: [{ ...TEE, holes: [hole(1, 9)] }] }),
    ]
    for (const a of answers) {
      answer = a
      const r = await extract({ image: IMAGE })
      expect(r.status).toBe(422)
      expect(r.body).toEqual({ error: 'No pude leer esa tarjeta. Prueba con otra foto más nítida.' })
    }
  })

  it('Anthropic’s rate limit: 429, the line the UI shows', async () => {
    answer = () => apiError(429)
    const r = await extract({ image: IMAGE })
    expect(r.status).toBe(429)
    expect(r.body).toEqual({ error: 'Muchas lecturas seguidas; espera un minuto.' })
  })

  it('Anthropic down or the key refused: 502 with its status, and none of its words', async () => {
    for (const status of [401, 500, 529]) {
      answer = () => apiError(status)
      const r = await extract({ image: IMAGE })
      expect(r.status).toBe(502)
      expect(r.body).toEqual({ error: `No se pudo leer la tarjeta (${status}).` })
      expect(leaked(r, [KEY, KEY.slice(0, 6), 'upstream'])).toEqual([])
    }
  })

  it('no answer at all (the network, after the SDK’s own retries): 502 with no «(undefined)»', async () => {
    const { default: handler } = await import('../../api/scorecard-extract')
    vi.useFakeTimers()
    answer = () => {
      throw new TypeError('fetch failed')
    }
    const pending = callRoute(handler, {
      method: 'POST',
      headers: { authorization: 'Bearer comite-token' },
      body: { image: IMAGE },
    })
    await vi.runAllTimersAsync()
    const r = await pending
    expect(sent).toHaveLength(3)
    expect(r.status).toBe(502)
    expect(r.body).toEqual({ error: 'No se pudo leer la tarjeta.' })
  })
})
