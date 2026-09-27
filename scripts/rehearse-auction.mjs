#!/usr/bin/env node
// Runs a full Calcutta rehearsal on the "Ensayo" tournament (CLAUDE.md §16 M5):
// 12 lots in a random order, a few bids per lot, a hammer price, an owner who
// respects the 3-players-per-owner limit, and a buyback on some lots. The rows
// are exactly what the auctioneer console writes, so the console, the TV board
// and Dinero show the result live. Never touches any tournament but "ensayo".
//   node scripts/rehearse-auction.mjs [--slug ensayo] [--seed 7]
import { createClient } from '@supabase/supabase-js'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(new URL('..', import.meta.url).pathname)
if (existsSync(path.join(root, '.env.local'))) {
  for (const line of (await readFile(path.join(root, '.env.local'), 'utf8')).split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}
const URL_ = process.env.VITE_SUPABASE_URL
const SECRET = process.env.SUPABASE_SECRET_KEY
if (!URL_ || !SECRET) {
  console.error('Missing VITE_SUPABASE_URL / SUPABASE_SECRET_KEY')
  process.exit(1)
}
const args = process.argv.slice(2)
const arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
const slug = arg('--slug', 'ensayo')
if (slug !== 'ensayo' && !slug.startsWith('ensayo-')) {
  console.error('Refusing to run on a non-rehearsal tournament:', slug)
  process.exit(1)
}
let seed = Number(arg('--seed', Date.now() % 100000))
const rng = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648
  return seed / 2147483648
}
const pick = (arr) => arr[Math.floor(rng() * arr.length)]
const shuffle = (arr) => {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const sb = createClient(URL_, SECRET, { auth: { persistSession: false, autoRefreshToken: false } })
const must = (r, ctx) => {
  if (r.error) {
    console.error(ctx, r.error.message)
    process.exit(1)
  }
  return r.data
}

const t = must(await sb.from('tournaments').select('id, name, settings').eq('slug', slug).single(), 'tournament')
const cfg = t.settings.auction
const players = must(await sb.from('players').select('id, display_name').eq('tournament_id', t.id).order('sort_order'), 'players')
const nameOf = (id) => players.find((p) => p.id === id)?.display_name ?? id

// Clean slate for the rehearsal auction (Ensayo only).
must(await sb.from('calcutta_lots').delete().eq('tournament_id', t.id).select('id'), 'delete lots')

const holdings = new Map(players.map((p) => [p.id, 0]))
const canBid = (id) => holdings.get(id) < cfg.maxPlayersPerOwner
let pot = 0
let lotNumber = 0
const summary = []
for (const player of shuffle(players)) {
  lotNumber++
  const lot = must(
    await sb.from('calcutta_lots').insert({ tournament_id: t.id, player_id: player.id, lot_number: lotNumber, status: 'open' }).select('id').single(),
    'lot',
  )
  // 0–6 bids, each from an eligible bidder, strictly increasing.
  const nBids = Math.floor(rng() * 7)
  let amount = cfg.openingBid
  let bidder = player.id
  const bids = []
  for (let i = 0; i < nBids; i++) {
    const eligible = players.filter((p) => p.id !== bidder && canBid(p.id))
    if (eligible.length === 0) break
    amount += cfg.increment * (1 + Math.floor(rng() * 3))
    bidder = pick(eligible).id
    bids.push({ lot_id: lot.id, bidder_id: bidder, amount, created_at: new Date(Date.now() - (nBids - i) * 1000).toISOString() })
  }
  if (bids.length) must(await sb.from('calcutta_bids').insert(bids).select('id'), 'bids')
  if (bidder === player.id && !canBid(player.id) && cfg.selfOwnedCountsTowardMax) {
    // Owner at the limit buys himself anyway (rule: the player always opens his own lot).
  }
  must(
    await sb.from('calcutta_lots').update({ status: 'sold', price: amount, owner_id: bidder, sold_at: new Date().toISOString() }).eq('id', lot.id).select('id'),
    'sell',
  )
  holdings.set(bidder, holdings.get(bidder) + 1)
  pot += amount
  let buyback = 0
  if (bidder !== player.id && rng() < 0.4) {
    buyback = pick([25, 50].filter((x) => x <= cfg.buybackMaxPct))
    if (buyback) must(await sb.from('calcutta_buybacks').upsert({ lot_id: lot.id, pct: buyback, amount: Math.round((amount * buyback) / 100), paid: false }).select('lot_id'), 'buyback')
  }
  summary.push(`${String(lotNumber).padStart(2)}. ${player.display_name.padEnd(10)} → ${bidder === player.id ? 'él mismo' : nameOf(bidder).padEnd(10)} $${amount}${buyback ? ` (recompra ${buyback}%)` : ''}`)
}

console.log(`Calcutta de ${t.name}: ${lotNumber} lotes, pozo $${pot}`)
console.log(summary.join('\n'))
console.log('Slots:')
for (const s of cfg.payout) {
  const label = s.slot === 'place' ? `Lugar ${s.place}` : s.slot === 'bestOfTier' ? `Mejor ${s.tier}` : 'Último'
  console.log(`  ${label.padEnd(10)} ${(s.share * 100).toFixed(0)}% = $${Math.floor(pot * s.share)}`)
}
