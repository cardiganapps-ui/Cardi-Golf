/**
 * Since 0030 every child of rounds, groups and calcutta_lots reaches its parent
 * by two foreign keys: the old one and the composite one that pins the
 * tournament (DB-12). PostgREST refuses an embed between them that doesn't say
 * which key it means (PGRST201, «more than one relationship»): the whole
 * request fails. PR 111's verifier found two such embeds in scripts (the
 * simulator and the live RLS test). This reads every request in the code and
 * holds each embed of one of those tables to a named key:
 * `group_members!group_members_group_id_fkey(player_id)`, never
 * `group_members(player_id)`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** The tables joined two ways since 0030: the 11 children and the parents they hang from. */
const TWO_WAYS = new Set([
  'groups', 'group_members', 'round_tees', 'scores', 'snake_tiebreaks', 'card_signatures', 'handicap_overrides',
  'hole_awards', 'photos', 'calcutta_bids', 'calcutta_buybacks', 'rounds', 'calcutta_lots',
])

function files(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...files(p))
    else if (/\.(m?js|tsx?)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

/** Every `.select('…')` text in the code, with where it is. */
function selects(): Array<{ where: string; text: string }> {
  const out: Array<{ where: string; text: string }> = []
  for (const root of ['src', 'scripts', 'api', 'e2e']) {
    for (const f of files(join(process.cwd(), root))) {
      const src = readFileSync(f, 'utf8')
      for (const m of src.matchAll(/\.select\(\s*(['"`])([\s\S]*?)\1/g)) out.push({ where: f.slice(process.cwd().length + 1), text: m[2]! })
    }
  }
  return out
}

/** The embeds in one select text: the resource name and whatever `!…` modifiers follow it, up to its `(`. */
function embeds(text: string): Array<{ name: string; mods: string[] }> {
  return [...text.matchAll(/(?:^|[\s,(:])([a-z_]+)((?:![a-z_]+)*)\(/g)].map((m) => ({ name: m[1]!, mods: m[2]!.split('!').filter(Boolean) }))
}

describe('embeds between tables joined two ways name their key (0030, PGRST201)', () => {
  it('reads the requests (the scan finds the app\'s own embed)', () => {
    expect(selects().some((s) => embeds(s.text).some((e) => e.name === 'rounds'))).toBe(true)
  })

  it('every embed of a child of rounds, groups or lots, or of those parents, says which key', () => {
    const unnamed = selects().flatMap((s) =>
      embeds(s.text)
        .filter((e) => TWO_WAYS.has(e.name) && !e.mods.some((m) => m !== 'inner' && m !== 'left'))
        .map((e) => `${s.where}: ${e.name}(…) in «${s.text}»`),
    )
    expect(unnamed).toEqual([])
  })

  it('catches the shape the verifier found', () => {
    const bad = embeds('id, number, group_members(player_id)').filter((e) => TWO_WAYS.has(e.name) && !e.mods.some((m) => m !== 'inner' && m !== 'left'))
    const inner = embeds('player_id, groups!inner(round_id)').filter((e) => TWO_WAYS.has(e.name) && !e.mods.some((m) => m !== 'inner' && m !== 'left'))
    const named = embeds('player_id, groups!group_members_group_id_fkey!inner(round_id)').filter((e) => TWO_WAYS.has(e.name) && !e.mods.some((m) => m !== 'inner' && m !== 'left'))
    expect([bad.length, inner.length, named.length]).toEqual([1, 1, 0])
  })
})
