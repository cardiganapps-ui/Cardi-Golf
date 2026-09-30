// Record Ensayo's state (ids, statuses, counts, score rows; no names) with Nico's session.
// usage: node record-state.mjs <outfile.json> [--claim]
import { launch, newPhone, claim, sessionOf, rest, rpc, saveJson, E, BASE } from './lib.mjs'
import { existsSync } from 'node:fs'

const out = process.argv[2] ?? 'ensayo-state.json'
const statePath = `${E}/state/nico-A.json`
const b = await launch()
const ctx = await newPhone(b, statePath)
const page = await ctx.newPage()
if (!existsSync(statePath) || process.argv.includes('--claim')) {
  await claim(page)
  await ctx.storageState({ path: statePath })
  console.log('claimed Nico, storage saved')
} else {
  await page.goto(`${BASE}/t/ensayo`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('text=Individual', { timeout: 40000 })
}
const s = await sessionOf(page)
const jwt = s.access_token
console.log('session user', s.user?.id?.slice(0, 8), 'anon', s.user?.is_anonymous, 'expires_at', new Date(s.expires_at * 1000).toISOString())
const t = (await rest('tournaments?slug=eq.ensayo&select=id,slug,status,current_round_id,banker_player_id', jwt)).body[0]
const tid = t.id
const mem = (await rpc('my_membership', { tid }, jwt)).body
const rounds = (await rest(`rounds?tournament_id=eq.${tid}&select=id,number,status,holes,course_id,date&order=number`, jwt)).body
const rids = rounds.map((r) => r.id)
const inR = `(${rids.join(',')})`
const groups = (await rest(`groups?round_id=in.${inR}&select=id,round_id,number,start_hole,tee_time&order=round_id,number`, jwt)).body
const gids = groups.map((g) => g.id)
const members = gids.length ? (await rest(`group_members?group_id=in.(${gids.join(',')})&select=group_id,player_id`, jwt)).body : []
const players = (await rest(`players?tournament_id=eq.${tid}&select=id,sort_order,tier,is_admin,is_honoree&order=sort_order`, jwt)).body
const scores = (await rest(`scores?round_id=in.${inR}&select=id,round_id,player_id,hole,strokes,putts,picked_up,entered_by,client_ts,disputed,previous,reason,updated_at&order=round_id,player_id,hole`, jwt)).body
const sigs = (await rest(`card_signatures?round_id=in.${inR}&select=round_id,pair_id,signed_by,signed_at`, jwt)).body
const tbs = (await rest(`snake_tiebreaks?round_id=in.${inR}&select=round_id,group_id,hole,last_holed_player_id,decided_by`, jwt)).body
const awards = (await rest(`hole_awards?round_id=in.${inR}&select=round_id,group_id,hole,game_id,player_id,decided_by`, jwt)).body
const overrides = (await rest(`handicap_overrides?round_id=in.${inR}&select=round_id,player_id,playing_hcp`, jwt)).body
const pairs = (await rest(`pairs?tournament_id=eq.${tid}&select=id,player1_id,player2_id,kind`, jwt)).body
const lots = (await rest(`calcutta_lots?tournament_id=eq.${tid}&select=id,status`, jwt)).body
const payments = (await rest(`payments?tournament_id=eq.${tid}&select=id,kind,paid`, jwt)).body
const state = {
  at: new Date().toISOString(),
  tournament: t,
  membership: mem,
  rounds,
  groups: groups.map((g) => ({ ...g, members: members.filter((m) => m.group_id === g.id).map((m) => m.player_id) })),
  players,
  counts: {
    scores: scores.length,
    scoresPerRound: Object.fromEntries(rids.map((r) => [r, scores.filter((x) => x.round_id === r).length])),
    disputed: scores.filter((x) => x.disputed).length,
    signatures: sigs.length,
    tiebreaks: tbs.length,
    awards: awards.length,
    overrides: overrides.length,
    pairs: pairs.length,
    lots: lots.length,
    payments: payments.length,
  },
  scores,
  signatures: sigs,
  tiebreaks: tbs,
  awards,
}
saveJson(`state/${out}`, state)
console.log(JSON.stringify({ tournament: { status: t.status, current_round_id: t.current_round_id }, rounds: rounds.map((r) => ({ n: r.number, status: r.status, id: r.id })), counts: state.counts, me: mem }, null, 1))
await ctx.storageState({ path: statePath })
await b.close()
