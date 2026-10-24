/**
 * The tree carries no personal data of the first tournament (CHAIR-02, 2026-10-24).
 * The repository was public with the twelve friends' names in the fixtures, the
 * seed and the brief, the owner's email, the trip's booking reference and hotel,
 * and one PIN for every Ensayo player. Making it private is Diego's (handoff,
 * item 1); the tree stops carrying them regardless, since every commit is
 * history. This reads every tracked file and fails on a real surname (listed
 * here only as the sha256 of the lowercased, unaccented name, compared after
 * hashing each word of the tree the same way, so the test spells none), on a
 * booking reference (two letters and five digits) on a line that says booking
 * or reserva, and on any Gmail address. What it leaves out is named below, each
 * with why.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

/** Files the test leaves out, with why. A prefix ends with a slash. */
const LEFT_OUT: Record<string, string> = {
  'docs/review/2026-09-30/': 'the frozen record of the review, kept as the panel wrote it',
  'supabase/migrations/0021_platform_admin.sql':
    'the platform admin’s seed, applied and immutable (§0.3); only making the repo private hides it',
  'supabase/migrations/0013_identity.sql':
    'a comment names a player as the handle example; applied and immutable (§0.3)',
  'supabase/migrations/0014_profile_name_hint.sql':
    'a comment names a player as the handle example; applied and immutable (§0.3)',
  'node_modules/': 'not ours',
}
/** What is not text. */
const BINARY = /\.(png|jpe?g|webp|gif|avif|ico|svg|woff2?|ttf|otf|mp4|webm|mov|pdf|gz|zip|jar)$/i

/**
 * The surnames, hashed: each is `sha256(norm(name))`, one to three words joined
 * by one space. A word of the tree is checked on its own, and after a lead word
 * (a first name, or the first word of a compound surname) with the next one or
 * two, so the common surnames are caught only with the first name they came with.
 */
const NAMES = new Set([
  '301e24f7cf8e7908034ec9d64a6fbbae497a37a7c33a2dad2f5a423b36994e2b',
  '69b797ae5c7e249b4968156e49213da84cfa504a0615e36af7a16aa808f4edde',
  'cb2d35d40a70a757df832d42207e9215531f9a7b5969a7c4f1a8c9abe0fed5c7',
  'ab3abc82ab808399de4d2a3cf9dee7405874b9590d16ec93f76113565704b0a0',
  'ba9ccef5409ef2771dfc88c513b30ada4485e1b7bb2e0727d354c1a7894aecf1',
  '0f4d7d5766e3ba74181b927fd407c84cd5b52bf53420286204eaefd00ac354b1',
  '578a79f4f5f71552b526b4859c8943c399a9ff1c46fcd7048eda31d97af93130',
  'c39179f2eefbaefe21dde5c34b897bd03f6d3f7f66243f4d47f51d8ffb6234e2',
  '966b5e9f8937619b8b82b09794cf66cb511e27ecf56d8532bcd97b102e63db81',
  'ecc6f820225305b810b31777c9606f2117dda36d29661831445830d809b58cfd',
  '4add62735530312399d256b6d4bc71ac9889e856d73428d127f4464bf5fb5b5f',
  '6183744ef51554c3f3a60c04169ec530395d7a69b0908c814e9f4518faad02fe',
  '473990c0efa4a26ff367ce98e797201ff0e045471d9cf55eeb7f8b20df04fbbc',
])
/** The words a two- or three-word name starts with, hashed the same way. */
const LEADS = new Set([
  'e61799194522fe780a7154ae8fd75f7ba7d39b14bd55fad7b9503f404101a02d',
  '00e48a815525529ba9d33f8761a167588fe00c47bc82f515cf791c482ed99ecc',
  '13ccdb4260cef6c73ab96a1594a6f1cfbe27a41e108bcbca6c629bcfc9112b98',
  'b6f8d434a847fb0f0c1a8d9b936b8ca952e224f205a55f4ba9b2c20f88fdc9e7',
  '34ddf679b4b0ed44ce874ec3e11cf84359acb7a09bacaa3e50232bbdce8da5b3',
  '807a09440428c0a8aef58bd3ece32938b0d76e638119e47619756f5c2c20ff3a',
  '0a92efb1b91ac02c858ab205fbb6baf44d67e8d1e625600a11020cfae50065da',
  'c9fd92c735c7609969a0ab48b6dc2fda85a06e135196571c06708222baf5a2e7',
  'c3584620a1582492b99778a334340055a0d3c91ee035f1c4427498e95d111cee',
])

const BOOKING_WORD = /\b(booking|reserva|reservaci[oó]n)\b/i
const BOOKING_REF = /\b[A-Z]{2}\d{5}\b/
const GMAIL = /[\w.+-]+@gmail\.com\b/i

/** Lowercase, accents off: «Zúñiga» and «Zuniga» are one word. */
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const hashes = new Map<string, string>()
function hash(s: string): string {
  let h = hashes.get(s)
  if (!h) {
    h = createHash('sha256').update(s).digest('hex')
    hashes.set(s, h)
  }
  return h
}

/** What git tracks (the index), or null outside a git checkout. */
function tracked(): string[] | null {
  try {
    return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean)
  } catch {
    return null
  }
}

const leftOut = (f: string) => Object.keys(LEFT_OUT).some((p) => (p.endsWith('/') ? f.startsWith(p) : f === p))

/** Each tracked text file's lines, read once for the three checks. */
function textFiles(files: string[]): Array<{ f: string; lines: string[] }> {
  const out: Array<{ f: string; lines: string[] }> = []
  for (const f of files) {
    if (leftOut(f) || BINARY.test(f)) continue
    try {
      out.push({ f, lines: readFileSync(join(root, f), 'utf8').split('\n') })
    } catch {
      // Deleted in the working tree, not yet in the index: nothing to read.
    }
  }
  return out
}

/** The names a line carries: each word alone, and each lead word with the one or two after it. */
function namesIn(line: string): string[] {
  const words = norm(line).match(/[a-z]+/g) ?? []
  const found: string[] = []
  for (const [i, w] of words.entries()) {
    if (NAMES.has(hash(w))) found.push(w)
    if (!LEADS.has(hash(w))) continue
    for (const n of [2, 3]) {
      if (i + n > words.length) continue
      const gram = words.slice(i, i + n).join(' ')
      if (NAMES.has(hash(gram))) found.push(gram)
    }
  }
  return found
}

const files = tracked()

describe.skipIf(!files)('what the tree carries about people (CHAIR-02)', () => {
  const texts = textFiles(files ?? [])

  it('reads the whole tree', () => {
    expect(texts.length).toBeGreaterThan(500)
    expect(texts.some((x) => x.f === 'CLAUDE.md')).toBe(true)
  })

  it('names none of the first tournament’s players', () => {
    const hits: string[] = []
    for (const { f, lines } of texts)
      for (const [i, line] of lines.entries()) for (const name of namesIn(line)) hits.push(`${f}:${i + 1}: «${name}»`)
    expect(hits).toEqual([])
  })

  it('carries no booking reference', () => {
    const hits: string[] = []
    for (const { f, lines } of texts)
      for (const [i, line] of lines.entries())
        if (BOOKING_WORD.test(line) && BOOKING_REF.test(line)) hits.push(`${f}:${i + 1}`)
    expect(hits).toEqual([])
  })

  it('carries no Gmail address', () => {
    const hits: string[] = []
    for (const { f, lines } of texts)
      for (const [i, line] of lines.entries()) if (GMAIL.test(line)) hits.push(`${f}:${i + 1}`)
    expect(hits).toEqual([])
  })
})
