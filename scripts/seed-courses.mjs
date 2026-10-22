#!/usr/bin/env node
/**
 * STRAT-14: seed the shared course catalog with Mexico's most-played courses (docs/strategy/course-catalog.md, step 2).
 *   node scripts/seed-courses.mjs                         a dry run: what it would import, and what is missing
 *   node scripts/seed-courses.mjs --apply                 imports into production (SUPABASE_SECRET_KEY)
 *   node scripts/seed-courses.mjs --apply --url http://127.0.0.1:54321    into a local Supabase instead
 *   --list <file>     the courses to look for (default docs/strategy/courses-mx.json)
 *   --report <file>   where the report goes (default seed-courses-report.json)
 *   --only <text>     only the courses whose name holds it
 *
 * For each course of the list it asks GolfCourseAPI (GOLFCOURSE_API_KEY) and OpenGolfAPI (OPENGOLF_API_KEY, optional:
 * its reads work without one) the same questions api/course-search.ts asks, through the same adapters
 * (src/lib/courseProviders), and imports only a complete card: every tee it keeps has par and stroke index on all 18
 * holes as the provider gave them (never a value the adapter filled in) and a rating and a slope. A tee short of that
 * is left out and named in the report; a course with no complete tee is reported missing, for a photo of its card.
 * The import is one call per course (catalog_import_course, 0075: the service role only), which refuses an
 * incomplete card again and never touches a course the catalog has: one from the same provider id, or one whose name
 * matches by course_dupe_key (as the Admin de Polo's duplicates are found) in a place that doesn't contradict it (0077:
 * when both the list's city and the catalog's location are known, one holds the other, folded). A dry run with the key
 * reads the catalog to say which it would leave alone; it writes nothing.
 *
 * The only targets are production and a local Supabase named with --url (localhost, 127.0.0.1, ::1); anything else
 * is refused before a request goes out. A local target never gets the production key from .env.local: its key has to
 * be in the environment. No key is ever printed.
 */
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as gca from '../src/lib/courseProviders/golfcourseapi.ts'
import * as oga from '../src/lib/courseProviders/opengolfapi.ts'
import {
  golfCourseHeaders,
  golfCourseSearchUrl,
  golfCourseUrl,
  openGolfCourseUrl,
  openGolfHeaders,
  openGolfSearchUrl,
} from '../src/lib/courseProviders/endpoints.ts'
import { loadEnv, root } from './lib/env.mjs'

export const PRODUCTION_URL = 'https://gmohwledjejlhcwqjnhd.supabase.co'
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

/**
 * Where the import may go: production, or a local Supabase named explicitly. Throws for anything else.
 * @param {string | undefined} url
 */
export function targetOf(url) {
  if (!url) return { url: PRODUCTION_URL, kind: 'production' }
  let u
  try {
    u = new URL(url)
  } catch {
    throw new Error(`--url ${url} is not a URL`)
  }
  const bare = `${u.protocol}//${u.host}`
  if (bare === PRODUCTION_URL && (u.pathname === '/' || u.pathname === ''))
    return { url: PRODUCTION_URL, kind: 'production' }
  if ((u.protocol === 'http:' || u.protocol === 'https:') && LOCAL_HOSTS.has(u.hostname))
    return { url: bare, kind: 'local' }
  throw new Error(`refusing ${bare}: the catalog is seeded into production or a local Supabase, nothing else`)
}

/**
 * A course name reduced to what makes two names the same course: public.course_dupe_key (0023), letter for letter.
 * @param {string | null | undefined} name
 */
export function dupeKey(name) {
  const from = 'áéíóúüñÁÉÍÓÚÜÑ'
  const to = 'aeiouunaeiouun'
  const translated = [...(name ?? '')].map((ch) => (from.includes(ch) ? to[from.indexOf(ch)] : ch)).join('')
  return translated
    .toLowerCase()
    .replace(/\b(golf|club|course|campo|de|del|la|el|the|country|cc|gc|resort|links)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Two keys that are probably the same course: public.course_keys_match (0023).
 * @param {string} a
 * @param {string} b
 */
export function keysMatch(a, b) {
  return !!a && !!b && (a === b || (Math.min(a.length, b.length) >= 5 && (a.startsWith(b) || b.startsWith(a))))
}

/** Lower case, no accents: how a city is compared with a provider's location. */
const fold = (/** @type {string} */ s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * Whether two places can be the same: either unknown (blank), or one holds the other, folded. catalog_import_course's
 * rule since 0077, so «Hacienda San Gaspar» in Cuernavaca is not «La Hacienda» in Atizapán.
 * @param {string | null | undefined} a
 * @param {string | null | undefined} b
 */
export function samePlace(a, b) {
  const x = a?.trim() ? fold(a.trim()) : null
  const y = b?.trim() ? fold(b.trim()) : null
  return !x || !y || x.includes(y) || y.includes(x)
}

/**
 * The catalog course the import would leave alone, if any: the same provider id, else a name that matches by
 * course_dupe_key in a place that doesn't contradict it. What catalog_import_course decides (0077).
 * @template {{ name: string; source: string; external_id: string | null; location?: string | null }} C
 * @param {C[] | null} catalog
 * @param {{ name: string; place?: string | null; source?: string | null; ext?: string | null }} q
 * @returns {C | null}
 */
export function findInCatalog(catalog, q) {
  if (!catalog) return null
  const key = dupeKey(q.name)
  return (
    (q.source && q.ext ? catalog.find((c) => c.source === q.source && c.external_id === q.ext) : undefined) ??
    catalog.find((c) => keysMatch(dupeKey(c.name), key) && samePlace(q.place, c.location)) ??
    null
  )
}

/**
 * A provider's tees split into the complete ones (what is imported) and the rest, each with why.
 * @param {import('../src/lib/courseProviders/types.ts').ProviderTee[]} tees
 */
export function completeTees(tees) {
  /** @type {import('../src/lib/courseProviders/types.ts').ProviderTee[]} */
  const complete = []
  /** @type {Array<{ tee: string; why: string }>} */
  const dropped = []
  for (const tee of tees) {
    const numbers = tee.holes.map((h) => h.number).sort((a, b) => a - b)
    const why =
      tee.holes.length !== 18 || numbers.some((n, i) => n !== i + 1)
        ? 'not 18 holes'
        : tee.assumed
          ? 'a par or stroke index missing'
          : tee.rating == null
            ? 'no rating'
            : tee.slope == null || !Number.isInteger(tee.slope) || tee.slope < 55 || tee.slope > 155
              ? 'no slope'
              : null
    if (why) dropped.push({ tee: tee.name, why })
    else complete.push(tee)
  }
  return { complete, dropped }
}

/**
 * The search hits that name the course on the list, the likeliest first: a name (or club name) that matches its key,
 * in its city before elsewhere, a provider that says it has a card before one that doesn't know.
 * @param {{ name: string; city?: string }} entry
 * @param {import('../src/lib/courseProviders/types.ts').ProviderSearchHit[]} hits
 */
export function candidates(entry, hits) {
  const key = dupeKey(entry.name)
  const city = entry.city ? fold(entry.city) : null
  return hits
    .filter((h) => keysMatch(dupeKey(h.name), key) || (h.clubName != null && keysMatch(dupeKey(h.clubName), key)))
    .map((h) => ({
      h,
      score:
        (city && h.location && fold(h.location).includes(city) ? 2 : 0) +
        (h.hasCard === true ? 1 : h.hasCard === false ? -2 : 0),
    }))
    .filter((x) => x.h.hasCard !== false)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.h)
}

/**
 * What catalog_import_course takes, from a provider's course and its complete tees.
 * @param {import('../src/lib/courseProviders/types.ts').ProviderCourse} c
 * @param {import('../src/lib/courseProviders/types.ts').ProviderTee[]} tees
 * @param {{ city?: string }} entry
 */
export function importPayload(c, tees, entry) {
  return {
    name: c.name,
    location: c.location ?? entry.city ?? null,
    // The place the server compares with the catalog's (0077): the list's city, else the provider's location.
    city: entry.city ?? null,
    source: c.provider,
    external_id: c.externalId,
    attribution: c.attribution,
    website: c.website,
    latitude: c.latitude,
    longitude: c.longitude,
    tees: tees.map((t) => ({
      name: t.name,
      color: t.color,
      gender: t.gender,
      rating: t.rating,
      slope: t.slope,
      holes: t.holes.map((h) => ({ number: h.number, par: h.par, stroke_index: h.strokeIndex, yards: h.yards })),
    })),
  }
}

/**
 * The run. Everything it reaches goes through `fetch`; nothing else leaves the process.
 * @param {{
 *   list: Array<{ region?: string; name: string; city?: string }>
 *   fetch: typeof globalThis.fetch
 *   env: Record<string, string | undefined>
 *   apply: boolean
 *   target: { url: string; kind: string }
 *   log?: (line: string) => void
 *   sleep?: (ms: number) => Promise<void>
 *   pauseMs?: number
 * }} o
 */
export async function seed(o) {
  const log = o.log ?? (() => undefined)
  const sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
  const gcaKey = o.env.GOLFCOURSE_API_KEY || null
  const ogaKey = o.env.OPENGOLF_API_KEY || undefined
  const dbKey = o.env.SUPABASE_SECRET_KEY || null
  if (o.apply && !dbKey) throw new Error('--apply needs SUPABASE_SECRET_KEY in the environment')
  const db = { apikey: dbKey ?? '', Authorization: `Bearer ${dbKey ?? ''}` }

  /** A provider that answered 429 is asked nothing more this run: its limit is a day's (OpenGolfAPI: 500 keyless). */
  const limited = { golfcourseapi: false, opengolfapi: false }
  /** @returns {Promise<any>} */
  const getJson = async (
    /** @type {'golfcourseapi' | 'opengolfapi'} */ provider,
    /** @type {string} */ url,
    /** @type {Record<string, string>} */ headers,
  ) => {
    if (limited[provider]) return null
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 15_000)
    try {
      const r = await o.fetch(url, { headers, signal: ctl.signal })
      if (r.status === 429) {
        limited[provider] = true
        log(`! ${provider} says its limit is reached: nothing more is asked of it this run`)
        return null
      }
      if (!r.ok) return null
      return await r.json()
    } catch {
      return null
    } finally {
      clearTimeout(timer)
    }
  }
  /** @param {any} body @param {(c: any) => any} map */
  const hitsOf = (body, map) => {
    if (!body || !Array.isArray(body.courses ?? [])) return null
    try {
      return (body.courses ?? []).slice(0, 25).map(map)
    } catch {
      return null
    }
  }

  // The catalog as it is, to leave alone what it has (the server checks again on every import).
  /** @type {Array<{ id: string; name: string; source: string; external_id: string | null; location?: string | null }> | null} */
  let catalog = null
  if (dbKey) {
    catalog = []
    for (let from = 0; ; from += 1000) {
      const r = await o.fetch(`${o.target.url}/rest/v1/courses?select=id,name,source,external_id,location&order=id`, {
        headers: { ...db, Range: `${from}-${from + 999}`, Prefer: 'count=exact' },
      })
      if (!r.ok) throw new Error(`reading the catalog failed: HTTP ${r.status}`)
      const rows = await r.json()
      catalog.push(...rows)
      const total = Number((r.headers.get('content-range') ?? '').split('/')[1])
      if (!rows.length || (Number.isFinite(total) && catalog.length >= total)) break
    }
  }
  const inCatalog = (
    /** @type {string} */ name,
    /** @type {string | null | undefined} */ place,
    /** @type {string | null} */ source = null,
    /** @type {string | null} */ ext = null,
  ) => findInCatalog(catalog, { name, place, source, ext })

  const report = {
    at: new Date().toISOString(),
    target: o.target.kind,
    apply: o.apply,
    catalogRead: catalog != null,
    providers: { golfcourseapi: !!gcaKey, opengolfapi: true },
    courses: /** @type {any[]} */ ([]),
  }
  for (const [i, entry] of o.list.entries()) {
    if (i > 0) await sleep(o.pauseMs ?? 400)
    const line = { region: entry.region ?? null, name: entry.name, city: entry.city ?? null }
    const known = inCatalog(entry.name, entry.city)
    if (known) {
      report.courses.push({ ...line, status: 'exists', existing: known.name })
      log(`= ${entry.name}: already in the catalog as «${known.name}»`)
      continue
    }
    const [g, oo] = await Promise.all([
      gcaKey
        ? getJson('golfcourseapi', golfCourseSearchUrl(entry.name), golfCourseHeaders(gcaKey))
        : Promise.resolve(null),
      getJson('opengolfapi', openGolfSearchUrl(entry.name), openGolfHeaders(ogaKey)),
    ])
    const gHits = hitsOf(g, gca.mapSearchHit)
    const oHits = hitsOf(oo, oga.mapSearchHit)
    if (!gHits && !oHits) {
      const why =
        limited.opengolfapi || limited.golfcourseapi
          ? 'provider limit reached: run it again tomorrow'
          : 'providers did not answer'
      report.courses.push({ ...line, status: 'missing', why })
      log(`? ${entry.name}: ${why}`)
      continue
    }
    const picks = candidates(entry, [...(gHits ?? []), ...(oHits ?? [])]).slice(0, 3)
    let best = null
    /** @type {Array<{ provider: string; externalId: string; tees: number; dropped: Array<{ tee: string; why: string }> }>} */
    const tried = []
    for (const h of picks) {
      const body =
        h.provider === 'golfcourseapi'
          ? await getJson(
              'golfcourseapi',
              golfCourseUrl(h.externalId),
              golfCourseHeaders(/** @type {string} */ (gcaKey)),
            )
          : await getJson('opengolfapi', openGolfCourseUrl(h.externalId), openGolfHeaders(ogaKey))
      if (!body) continue
      let course
      try {
        course =
          h.provider === 'golfcourseapi' ? gca.mapCourse(body.course ?? body) : oga.mapCourse(body.course ?? body)
      } catch {
        continue
      }
      const { complete, dropped } = completeTees(course.tees)
      tried.push({ provider: h.provider, externalId: h.externalId, tees: course.tees.length, dropped })
      if (complete.length) {
        best = { course, complete, dropped }
        break
      }
    }
    if (!best) {
      // A provider that stopped answering may have it: say so rather than «no provider has it».
      const unasked = (gcaKey && limited.golfcourseapi) || limited.opengolfapi
      const why = !picks.length
        ? unasked
          ? 'not found where asked; a provider hit its limit'
          : 'no provider has it'
        : !tried.length
          ? 'its card could not be read'
          : tried.every((x) => x.tees === 0)
            ? 'location only: no card'
            : 'no tee with a complete card'
      report.courses.push({ ...line, status: 'missing', why, tried })
      log(`- ${entry.name}: ${why}`)
      continue
    }
    const { course, complete, dropped } = best
    const same = inCatalog(course.name, entry.city ?? course.location, course.provider, course.externalId)
    if (same) {
      report.courses.push({
        ...line,
        status: 'exists',
        existing: same.name,
        provider: course.provider,
        externalId: course.externalId,
      })
      log(`= ${entry.name}: already in the catalog as «${same.name}»`)
      continue
    }
    const found = {
      ...line,
      provider: course.provider,
      externalId: course.externalId,
      providerName: course.name,
      tees: complete.map((t) => t.name),
      dropped,
    }
    if (!o.apply) {
      report.courses.push({ ...found, status: 'would-import' })
      log(
        `+ ${entry.name}: would import «${course.name}» from ${course.provider}, ${complete.length} tee(s)${dropped.length ? `, ${dropped.length} left out` : ''}`,
      )
      continue
    }
    const r = await o.fetch(`${o.target.url}/rest/v1/rpc/catalog_import_course`, {
      method: 'POST',
      headers: { ...db, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p: importPayload(course, complete, entry) }),
    })
    const answer = await r.json().catch(() => null)
    if (!r.ok || !answer) {
      report.courses.push({ ...found, status: 'failed', why: String(answer?.message ?? `HTTP ${r.status}`) })
      log(`! ${entry.name}: the import was refused: ${answer?.message ?? `HTTP ${r.status}`}`)
      continue
    }
    if (answer.status === 'exists') {
      report.courses.push({ ...found, status: 'exists', existing: answer.name })
      log(`= ${entry.name}: already in the catalog as «${answer.name}»`)
      continue
    }
    catalog?.push({
      id: answer.id,
      name: course.name,
      source: course.provider,
      external_id: course.externalId,
      location: course.location ?? entry.city ?? null,
    })
    report.courses.push({ ...found, status: 'imported', id: answer.id })
    log(`+ ${entry.name}: imported «${course.name}» from ${course.provider}, ${complete.length} tee(s)`)
  }
  const count = (/** @type {string} */ s) => report.courses.filter((c) => c.status === s).length
  return {
    ...report,
    limited: Object.entries(limited)
      .filter(([, v]) => v)
      .map(([k]) => k),
    totals: {
      imported: count('imported'),
      wouldImport: count('would-import'),
      exists: count('exists'),
      missing: count('missing'),
      failed: count('failed'),
    },
  }
}

async function main() {
  const args = process.argv.slice(2)
  const opt = (/** @type {string} */ name) => {
    const i = args.indexOf(name)
    return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : undefined
  }
  const apply = args.includes('--apply')
  const target = targetOf(opt('--url'))
  // A local target never gets production's key from .env.local: only what the environment already holds.
  const ownKey = process.env.SUPABASE_SECRET_KEY
  loadEnv()
  /** @type {Record<string, string | undefined>} */
  const env = {
    ...process.env,
    SUPABASE_SECRET_KEY: target.kind === 'local' ? ownKey : process.env.SUPABASE_SECRET_KEY,
  }
  const listFile = path.resolve(opt('--list') ?? path.join(root, 'docs', 'strategy', 'courses-mx.json'))
  const reportFile = path.resolve(opt('--report') ?? 'seed-courses-report.json')
  if (!existsSync(listFile)) throw new Error(`no list at ${listFile}`)
  const only = opt('--only')
  const list = JSON.parse(await readFile(listFile, 'utf8')).courses.filter(
    (/** @type {{ name: string }} */ c) => !only || fold(c.name).includes(fold(only)),
  )
  console.log(
    `${apply ? 'Importing into' : 'Dry run against'} ${target.kind} (${target.url}): ${list.length} course(s)${env.GOLFCOURSE_API_KEY ? '' : ', without GolfCourseAPI (no GOLFCOURSE_API_KEY)'}`,
  )
  const report = await seed({ list, fetch: globalThis.fetch, env, apply, target, log: (l) => console.log(l) })
  await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`)
  const t = report.totals
  console.log(
    `\n${apply ? `${t.imported} imported` : `${t.wouldImport} would be imported`}, ${t.exists} already in the catalog, ${t.missing} missing${t.failed ? `, ${t.failed} refused` : ''}. Report: ${reportFile}`,
  )
  if (!report.catalogRead)
    console.log(
      'The catalog was not read (no SUPABASE_SECRET_KEY): «would be imported» does not know what it already has.',
    )
  return t.failed ? 1 : 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      console.error(e instanceof Error ? e.message : e)
      process.exit(1)
    },
  )
}
