/** A duration as a person reads it: «740 ms», «1.6 s». */
export function duration(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toLocaleString('es-MX', { maximumFractionDigits: 1 })} s`
}
