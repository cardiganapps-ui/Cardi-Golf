// Classify every source line in the repo into a product area and count (code vs tests).
import { execSync } from 'node:child_process'
import fs from 'node:fs'
const repo = '/home/user/Cardi-Golf'
const files = execSync('git ls-files src api supabase/migrations scripts e2e', { cwd: repo }).toString().trim().split('\n')
const rules = [
  // [area, regex] first match wins
  ['platform-admin', /^src\/screens\/platform\/|^src\/data\/platform|PlatformBanner|^src\/dev\/platformFixtures|^supabase\/migrations\/002[1-4]_|platform-test|e2e\/platform|platformGuard/],
  ['social-profile', /^src\/screens\/profile\/|^src\/engine\/profile\/|^src\/data\/(account|crews|profiles|publish|push|quick|social)|CrewField|ProfileLink|QuickFinish|^src\/dev\/(social|profile)Fixtures|^supabase\/migrations\/001[3-9]_|^api\/push-dispatch|push-check|e2e\/profile|noticeText|^src\/lib\/(push|profile|handle)/],
  ['formats-games', /^src\/engine\/formats\/|^src\/engine\/games\/|BracketBoard|AdminTeams|AdminGames|GameBoardView|^src\/screens\/organizer\/setup\/(FormatEditor|FormatPicker|GameCatalog)|^supabase\/migrations\/00(11|20)_/],
  ['design-dev', /^src\/design\/|^src\/dev\/|design-shots|design-organizer|make-icons|scripts\/brand/],
  ['core-tournament', /.*/],
]
const out = {}
for (const f of files) {
  if (!/\.(ts|tsx|css|sql|mjs|js|sh|py)$/.test(f)) continue
  const p = `${repo}/${f}`
  if (!fs.existsSync(p)) continue
  const n = fs.readFileSync(p, 'utf8').split('\n').length
  const area = rules.find(([, re]) => re.test(f))[0]
  const kind = /\.test\.|e2e\/|scripts\/.*test/.test(f) ? 'test' : 'code'
  out[area] ??= { code: 0, test: 0, files: 0 }
  out[area][kind] += n
  out[area].files++
}
let tot = { code: 0, test: 0, files: 0 }
for (const v of Object.values(out)) { tot.code += v.code; tot.test += v.test; tot.files += v.files }
console.log('area'.padEnd(18), 'files'.padStart(6), 'code'.padStart(7), 'code%'.padStart(6), 'test'.padStart(7))
for (const [k, v] of Object.entries(out).sort((a, b) => b[1].code - a[1].code))
  console.log(k.padEnd(18), String(v.files).padStart(6), String(v.code).padStart(7), (100 * v.code / tot.code).toFixed(1).padStart(6), String(v.test).padStart(7))
console.log('TOTAL'.padEnd(18), String(tot.files).padStart(6), String(tot.code).padStart(7), '100.0'.padStart(6), String(tot.test).padStart(7))
