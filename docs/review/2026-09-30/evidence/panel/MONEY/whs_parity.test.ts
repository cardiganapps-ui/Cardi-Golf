/**
 * WHS parity: SQL whs_* (supabase/migrations/0015_results.sql, loaded into a
 * private Postgres 16 on a unix socket, port 5442) vs src/engine/profile/whs.ts,
 * on src/engine/profile/cases/whs.json plus thousands of seeded random cases.
 * Also the adjusted-gross expression of refresh_round_results vs adjustedGross().
 */
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import cases from '/home/user/Cardi-Golf/src/engine/profile/cases/whs.json'
import { courseHandicap } from '/home/user/Cardi-Golf/src/engine/core/handicap'
import { adjustedGross, whsCourseHandicap, whsDiff10, whsIndex10, whsStrokes, type HoleIn } from '/home/user/Cardi-Golf/src/engine/profile/whs'

const SOCK = '/var/lib/postgresql/money-5442'
const OUT = '/tmp/claude-0/-home-user-Cardi-Golf/ba82926f-40ab-5a97-99c4-91c99e01493a/scratchpad/panel/evidence/MONEY/whs_parity.result.json'

function psql(sql: string): string[] {
  const out = execFileSync('runuser', ['-u', 'postgres', '--', '/usr/lib/postgresql/16/bin/psql', '-h', SOCK, '-p', '5442', '-U', 'postgres', '-d', 'money', '-tA', '-q', '-v', 'ON_ERROR_STOP=1', '-f', '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, input: sql + ';\n' })
  return out.split('\n').filter((l) => l.length)
}

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const int = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1))

const summary: Record<string, unknown> = {}

describe('WHS SQL vs TS', () => {
  it('shared cases (whs.json) agree with SQL', () => {
    const diffs = psql(`select string_agg(whs_diff10(a,r,s)::text, ',' order by i) from (values ${cases.diff.map((c, i) => `(${i},${c.ags},${c.rating10},${c.slope})`).join(',')}) v(i,a,r,s)`)[0]!.split(',').map(Number)
    expect(diffs).toEqual(cases.diff.map((c) => c.expect10))
    const chs = psql(`select string_agg(whs_course_hcp(x,s,r,p)::text, ',' order by i) from (values ${cases.courseHcp.map((c, i) => `(${i},${c.index10},${c.slope},${c.rating10},${c.par})`).join(',')}) v(i,x,s,r,p)`)[0]!.split(',').map(Number)
    expect(chs).toEqual(cases.courseHcp.map((c) => c.expect))
    const st = psql(`select string_agg(whs_strokes(c,s)::text, ',' order by i) from (values ${cases.strokes.map((c, i) => `(${i},${c.ch},${c.si})`).join(',')}) v(i,c,s)`)[0]!.split(',').map(Number)
    expect(st).toEqual(cases.strokes.map((c) => c.expect))
    const idx = cases.index.map((c) => psql(`select coalesce(whs_index10(array[${c.diffs10.join(',')}]::int[])::text, 'null')`)[0])
    expect(idx.map((x) => (x === 'null' ? null : Number(x)))).toEqual(cases.index.map((c) => c.expect10))
    summary.sharedCases = { diff: cases.diff.length, courseHcp: cases.courseHcp.length, strokes: cases.strokes.length, index: cases.index.length, allAgree: true }
  })

  it('random course handicaps, differentials and strokes agree (2,000 each)', () => {
    const r = rng(20260930)
    const ch = Array.from({ length: 2000 }, () => ({ index10: int(r, -100, 540), slope: int(r, 55, 155), rating10: int(r, 550, 800), par: int(r, 66, 74) }))
    const sqlCh = psql(`select string_agg(whs_course_hcp(x,s,r,p)::text, ',' order by i) from (values ${ch.map((c, i) => `(${i},${c.index10},${c.slope},${c.rating10},${c.par})`).join(',')}) v(i,x,s,r,p)`)[0]!.split(',').map(Number)
    const tsCh = ch.map((c) => whsCourseHandicap(c.index10, c.slope, c.rating10, c.par))
    const chMismatch = ch.filter((_, i) => sqlCh[i] !== tsCh[i])
    const df = Array.from({ length: 2000 }, () => ({ ags: int(r, 55, 160), rating10: int(r, 550, 800), slope: int(r, 55, 155) }))
    const sqlDf = psql(`select string_agg(whs_diff10(a,r,s)::text, ',' order by i) from (values ${df.map((c, i) => `(${i},${c.ags},${c.rating10},${c.slope})`).join(',')}) v(i,a,r,s)`)[0]!.split(',').map(Number)
    const tsDf = df.map((c) => whsDiff10(c.ags, c.rating10, c.slope))
    const dfMismatch = df.filter((_, i) => sqlDf[i] !== tsDf[i])
    const sk = Array.from({ length: 2000 }, () => ({ ch: int(r, -10, 60), si: int(r, 1, 18) }))
    const sqlSk = psql(`select string_agg(whs_strokes(c,s)::text, ',' order by i) from (values ${sk.map((c, i) => `(${i},${c.ch},${c.si})`).join(',')}) v(i,c,s)`)[0]!.split(',').map(Number)
    const tsSk = sk.map((c) => whsStrokes(c.ch, c.si))
    const skMismatch = sk.filter((_, i) => sqlSk[i] !== tsSk[i])
    summary.random = { courseHcp: { n: ch.length, mismatches: chMismatch.slice(0, 5), count: chMismatch.length }, diff: { n: df.length, mismatches: dfMismatch.slice(0, 5), count: dfMismatch.length }, strokes: { n: sk.length, count: skMismatch.length, mismatches: skMismatch.slice(0, 5) } }
    expect(chMismatch.length + dfMismatch.length + skMismatch.length).toBe(0)
  })

  it('random index lists agree (1,000 lists of 0–25 differentials, many ties)', () => {
    const r = rng(7)
    const lists = Array.from({ length: 1000 }, () => Array.from({ length: int(r, 0, 25) }, () => (r() < 0.3 ? int(r, 80, 90) : int(r, -60, 620))))
    const sql = psql(`select string_agg(coalesce(whs_index10(d)::text,'null'), ',' order by i) from (values ${lists.map((l, i) => `(${i}, array[${l.join(',')}]::int[])`).join(',')}) v(i,d)`)[0]!.split(',')
    const mism = lists.map((l, i) => ({ l, sql: sql[i] === 'null' ? null : Number(sql[i]), ts: whsIndex10(l).index10 })).filter((x) => x.sql !== x.ts)
    summary.index = { n: lists.length, count: mism.length, mismatches: mism.slice(0, 5) }
    expect(mism.length).toBe(0)
  })

  it('engine courseHandicap (floats, tournaments) vs whsCourseHandicap (tenths, SQL/profiles) on 1-decimal inputs (20,000 cases)', () => {
    const r = rng(4242)
    const mism: unknown[] = []
    for (let i = 0; i < 20000; i++) {
      const index10 = int(r, -50, 540)
      const slope = int(r, 55, 155)
      const rating10 = int(r, 600, 790)
      const par = int(r, 68, 73)
      const eng = courseHandicap(index10 / 10, { slope, rating: rating10 / 10, par }).value
      const whs = whsCourseHandicap(index10, slope, rating10, par)
      if (eng !== whs) mism.push({ index: index10 / 10, slope, rating: rating10 / 10, par, eng, whs })
    }
    summary.engineVsWhsCourseHcp = { n: 20000, count: mism.length, examples: mism.slice(0, 5) }
    expect(mism.length).toBe(0)
  })

  it('adjusted gross: the SQL expression of refresh_round_results vs adjustedGross (1,000 cards)', () => {
    const r = rng(99)
    const cards = Array.from({ length: 1000 }, () => {
      const sis = Array.from({ length: 18 }, (_, i) => i + 1).sort(() => r() - 0.5)
      const ch = int(r, -5, 54)
      const holes: HoleIn[] = sis.map((si) => {
        const par = int(r, 3, 5)
        const picked = r() < 0.08
        return { par, si, strokes: picked ? null : int(r, 1, par + 9), pickedUp: picked }
      })
      return { ch, holes }
    })
    const rows = cards.flatMap((c, ci) => c.holes.map((h, hi) => `(${ci},${hi},${c.ch},${h.par},${h.si},${h.strokes ?? 'null'},${h.pickedUp})`))
    const sql = psql(`select string_agg(ags::text, ',' order by ci) from (select ci, sum(case when pu then par + 2 + whs_strokes(ch, si) else least(st, par + 2 + whs_strokes(ch, si)) end) as ags from (values ${rows.join(',')}) v(ci,hi,ch,par,si,st,pu) group by ci) x`)[0]!.split(',').map(Number)
    const ts = cards.map((c) => adjustedGross(c.holes, c.ch)!.ags)
    const mism = cards.map((c, i) => ({ i, ch: c.ch, sql: sql[i], ts: ts[i] })).filter((x) => x.sql !== x.ts)
    summary.ags = { n: cards.length, count: mism.length, mismatches: mism.slice(0, 5) }
    writeFileSync(OUT, JSON.stringify(summary, null, 1))
    expect(mism.length).toBe(0)
  })
})
