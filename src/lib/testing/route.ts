/**
 * A serverless route (`api/*.ts`) called the way Vercel calls it, for the routes' tests (QA-14): a request
 * with a method, headers, query and body, and a response that records its status, headers and body. It also
 * records everything the route logs, so a test can say that no secret reached the logs or the answer.
 */
import { vi } from 'vitest'

export interface RouteRequest {
  method?: string
  headers?: Record<string, string>
  query?: Record<string, unknown>
  body?: unknown
  /** The caller's address, as the platform's proxy forwards it. */
  ip?: string
}

export interface RouteAnswer {
  status: number
  headers: Record<string, string>
  /** What the route sent: the object it gave `json`, or the text it gave `send`. */
  body: unknown
  /** The answer as it goes over the wire. */
  text: string
  /** Every line the route logged, at any level. */
  logs: string[]
}

type Handler = (req: never, res: never) => unknown

export async function callRoute(handler: Handler, init: RouteRequest = {}): Promise<RouteAnswer> {
  const headers: Record<string, string> = Object.fromEntries(Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]))
  if (init.ip) headers['x-forwarded-for'] = init.ip
  const req = { method: init.method ?? 'GET', headers, query: init.query ?? {}, body: init.body, socket: { remoteAddress: '10.0.0.1' } }
  const out: RouteAnswer = { status: 0, headers: {}, body: undefined, text: '', logs: [] }
  const res = {
    setHeader(k: string, v: string) {
      out.headers[k.toLowerCase()] = String(v)
      return res
    },
    status(code: number) {
      out.status = code
      return res
    },
    json(b: unknown) {
      out.body = b
      out.text = JSON.stringify(b)
      return res
    },
    send(b: unknown) {
      out.body = b
      out.text = typeof b === 'string' ? b : JSON.stringify(b)
      return res
    },
    end() {
      return res
    },
  }
  const levels = ['log', 'info', 'warn', 'error', 'debug'] as const
  const spies = levels.map((level) => vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void out.logs.push(args.map(String).join(' '))))
  try {
    await handler(req as never, res as never)
  } finally {
    for (const spy of spies) spy.mockRestore()
  }
  return out
}

/** The secrets a test's environment holds that appear in the answer or the logs (none, when the route is right). */
export function leaked(answer: RouteAnswer, secrets: string[]): string[] {
  const seen = [answer.text, JSON.stringify(answer.headers), ...answer.logs].join('\n')
  return secrets.filter((s) => seen.includes(s))
}
