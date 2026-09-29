/**
 * A promise that gives up. Anything on the startup path that talks to the
 * network needs one: without it a stalled request on 4G leaves the app
 * waiting forever, which on the home screen meant a blank white page.
 */
export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label}: sin respuesta en ${Math.round(ms / 1000)} s`)
    this.name = 'TimeoutError'
  }
}

export function withTimeout<T>(p: Promise<T>, ms: number, label = 'operación'): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const guard = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms)
  })
  return Promise.race([p, guard]).finally(() => clearTimeout(timer))
}
