/**
 * VIS-17: one button. Every button is `.btn` with a variant (global.css), drawn by `Button` or, on a link, by
 * `buttonClass` (src/components/buttonClass.ts). Screens used to spell the classes by hand (277 uses), and the
 * style guide's `Button` was a second system no screen shipped, so a fix to one never reached the other.
 *
 * No file may spell a `btn--` class by hand, except the ones below, each at most as often as it does now. The list
 * only shrinks: a file that converts some of its buttons lowers its number here, one that converts all of them
 * leaves the list. What it holds is the Comité's, the organizer's, the profile's and the Admin de Polo's screens;
 * every player screen has none.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = new URL('../', import.meta.url).pathname
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)) out.push(p)
  }
  return out
}
// The design fixtures are data; the style guide draws buttons through Button like everyone.
const files = walk(ROOT)
  .map((p) => relative(ROOT, p))
  .filter((f) => !f.startsWith('dev/'))
const handSpelled = (f: string) => (readFileSync(join(ROOT, f), 'utf8').match(/\bbtn--[a-z]+/g) ?? []).length

/** Files still spelling their buttons by hand, and how many `btn--` classes each spells. */
const STILL: Record<string, number> = {
  'screens/LegalScreen.tsx': 8,
  'screens/admin/AdminAuction.tsx': 21,
  'screens/admin/AdminData.tsx': 6,
  'screens/admin/AdminDraw.tsx': 8,
  'screens/admin/AdminGames.tsx': 8,
  'screens/admin/AdminGroups.tsx': 18,
  'screens/admin/AdminHandicaps.tsx': 5,
  'screens/admin/AdminHistory.tsx': 4,
  'screens/admin/AdminLayout.tsx': 3,
  'screens/admin/AdminPlayers.tsx': 19,
  'screens/admin/AdminRounds.tsx': 17,
  'screens/admin/AdminScores.tsx': 19,
  'screens/admin/AdminTeams.tsx': 7,
  'screens/admin/AdminTournament.tsx': 11,
  'screens/admin/CorrectionsCard.tsx': 2,
  'screens/admin/CourseEditor.tsx': 8,
  'screens/admin/DevicesCard.tsx': 2,
  'screens/admin/PinInvites.tsx': 8,
  'screens/admin/ProfileLink.tsx': 7,
  'screens/admin/RejectedInbox.tsx': 8,
  'screens/admin/SpectatorLinkCard.tsx': 7,
  'screens/organizer/MyTournamentsScreen.tsx': 7,
  'screens/organizer/NewTournamentScreen.tsx': 5,
  'screens/organizer/OrganizerLoginScreen.tsx': 14,
  'screens/organizer/ResetPasswordScreen.tsx': 3,
  'screens/organizer/setup/FormatEditor.tsx': 2,
  'screens/organizer/setup/GameCatalog.tsx': 9,
  'screens/organizer/setup/MoneyEditor.tsx': 4,
  'screens/organizer/setup/PlayStep.tsx': 2,
  'screens/platform/AuditScreen.tsx': 3,
  'screens/platform/CatalogCourses.tsx': 1,
  'screens/platform/CatalogCrews.tsx': 9,
  'screens/platform/CourseDetail.tsx': 2,
  'screens/platform/HealthScreen.tsx': 6,
  'screens/platform/NoticesScreen.tsx': 4,
  'screens/platform/PeopleScreen.tsx': 1,
  'screens/platform/PersonDetail.tsx': 15,
  'screens/platform/PlatformLayout.tsx': 2,
  'screens/platform/TournamentDetail.tsx': 20,
  'screens/platform/TournamentsScreen.tsx': 1,
  'screens/platform/ViewReason.tsx': 2,
  'screens/profile/Achievements.tsx': 2,
  'screens/profile/AdminAccesses.tsx': 2,
  'screens/profile/CrewScreen.tsx': 12,
  'screens/profile/CrewsScreen.tsx': 5,
  'screens/profile/EntrarScreen.tsx': 10,
  'screens/profile/FriendsScreen.tsx': 12,
  'screens/profile/MiPolo.tsx': 13,
  'screens/profile/MyDataSection.tsx': 4,
  'screens/profile/OAuthReturnScreen.tsx': 5,
  'screens/profile/ProfileEditScreen.tsx': 6,
  'screens/profile/ProfileScreen.tsx': 16,
  'screens/profile/PushToggle.tsx': 4,
  'screens/profile/QuickRoundScreen.tsx': 4,
  'screens/profile/VersusScreen.tsx': 9,
  'screens/spectator/SpectatorNote.tsx': 4,
}

describe('one button (VIS-17)', () => {
  it('no file spells a button class by hand beyond what it did', () => {
    const over = files.map((f) => [f, handSpelled(f)] as const).filter(([f, n]) => n > (STILL[f] ?? 0))
    expect(over.map(([f, n]) => `${f}: ${n} (allowed ${STILL[f] ?? 0})`)).toEqual([])
  })
  it('keeps the list honest: lower a number, or drop the file, once it converts', () => {
    const stale = Object.entries(STILL).filter(([f, n]) => !files.includes(f) || handSpelled(f) < n)
    expect(stale.map(([f, n]) => `${f}: ${files.includes(f) ? handSpelled(f) : 'gone'} (listed ${n})`)).toEqual([])
  })
  it('leaves every player screen and the shared components with none', () => {
    const main = Object.keys(STILL).filter((f) => /^(components|app)\//.test(f) || /^screens\/tournament\//.test(f) || /^screens\/(HomeScreen|NotFoundScreen)\.tsx$/.test(f))
    expect(main).toEqual([])
  })
})
