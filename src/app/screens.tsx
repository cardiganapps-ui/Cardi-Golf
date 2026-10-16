/**
 * Every screen the router opens, each loaded when first needed (PERF-02, src/app/lazyScreen.tsx). The router,
 * the link to watch's routes and the design fixtures use these, never the screens' own modules: one static
 * import anywhere in the entry's graph puts that screen back in every first load.
 *
 * Grouped as they are used together:
 * - `player`: the tournament's gate (Entrar), its header and tab bar, En vivo and the Tarjeta. A link from
 *   WhatsApp is the entry and this chunk, side by side once the router has matched.
 * - The other tabs (Juegos, Dinero, Más, Reglamento) each on their own, fetched once the header has painted
 *   and again on a tap's first touch (TournamentShell).
 * - The organizer's screens, one chunk; the Comité's layout, then each section; the Admin de Polo, one chunk.
 */
import { lazyGroup, lazyScreen } from './lazyScreen'

const player = lazyGroup(() => import('../screens/tournament/player'))
export const TournamentGate = player((m) => m.TournamentGate)
export const TournamentShell = player((m) => m.TournamentShell)
export const LiveScreen = player((m) => m.LiveScreen)
export const ScorecardScreen = player((m) => m.ScorecardScreen)

export const GamesScreen = lazyScreen(() => import('../screens/tournament/GamesScreen'), (m) => m.GamesScreen)
export const MoneyScreen = lazyScreen(() => import('../screens/tournament/MoneyScreen'), (m) => m.MoneyScreen)
export const MoreScreen = lazyScreen(() => import('../screens/tournament/MoreScreen'), (m) => m.MoreScreen)
export const RulesScreen = lazyScreen(() => import('../screens/tournament/RulesScreen'), (m) => m.RulesScreen)
export const StatsScreen = lazyScreen(() => import('../screens/tournament/StatsScreen'), (m) => m.StatsScreen)
export const TvScreen = lazyScreen(() => import('../screens/tournament/TvScreen'), (m) => m.TvScreen)
export const CeremonyScreen = lazyScreen(() => import('../screens/tournament/CeremonyScreen'), (m) => m.CeremonyScreen)
export const PrintScreen = lazyScreen(() => import('../screens/tournament/PrintScreen'), (m) => m.PrintScreen)

const spectator = lazyGroup(() => import('../screens/spectator/SpectatorGate'))
export const SpectatorGate = spectator((m) => m.SpectatorGate)
export const SpectatorMoney = spectator((m) => m.SpectatorMoney)

export const HomeScreen = lazyScreen(() => import('../screens/HomeScreen'), (m) => m.HomeScreen)

const organizer = lazyGroup(() => import('../screens/organizer'))
export const OrganizerLoginScreen = organizer((m) => m.OrganizerLoginScreen)
export const MyTournamentsScreen = organizer((m) => m.MyTournamentsScreen)
export const NewTournamentScreen = organizer((m) => m.NewTournamentScreen)
export const ResetPasswordScreen = organizer((m) => m.ResetPasswordScreen)

export const EntrarScreen = lazyScreen(() => import('../screens/profile/EntrarScreen'), (m) => m.EntrarScreen)
export const OAuthReturnScreen = lazyScreen(() => import('../screens/profile/OAuthReturnScreen'), (m) => m.OAuthReturnScreen)
export const ProfileScreen = lazyScreen(() => import('../screens/profile/ProfileScreen'), (m) => m.ProfileScreen)
export const ProfileEditScreen = lazyScreen(() => import('../screens/profile/ProfileEditScreen'), (m) => m.ProfileEditScreen)
export const FriendsScreen = lazyScreen(() => import('../screens/profile/FriendsScreen'), (m) => m.FriendsScreen)
export const InboxScreen = lazyScreen(() => import('../screens/profile/InboxScreen'), (m) => m.InboxScreen)
export const VersusScreen = lazyScreen(() => import('../screens/profile/VersusScreen'), (m) => m.VersusScreen)
export const QuickRoundScreen = lazyScreen(() => import('../screens/profile/QuickRoundScreen'), (m) => m.QuickRoundScreen)
export const CoursesScreen = lazyScreen(() => import('../screens/profile/CoursesScreen'), (m) => m.CoursesScreen)
const crews = lazyGroup(() => import('../screens/profile/CrewsScreen'))
export const CrewsScreen = crews((m) => m.CrewsScreen)
export const CrewJoinScreen = crews((m) => m.CrewJoinScreen)
export const CrewScreen = lazyScreen(() => import('../screens/profile/CrewScreen'), (m) => m.CrewScreen)
export const LegalScreen = lazyScreen(() => import('../screens/LegalScreen'), (m) => m.LegalScreen)

export const AdminLayout = lazyScreen(() => import('../screens/admin/AdminLayout'), (m) => m.AdminLayout)
export const AdminTournament = lazyScreen(() => import('../screens/admin/AdminTournament'), (m) => m.AdminTournament)
export const AdminPlayers = lazyScreen(() => import('../screens/admin/AdminPlayers'), (m) => m.AdminPlayers)
export const AdminCourses = lazyScreen(() => import('../screens/admin/AdminCourses'), (m) => m.AdminCourses)
export const AdminRounds = lazyScreen(() => import('../screens/admin/AdminRounds'), (m) => m.AdminRounds)
export const AdminGroups = lazyScreen(() => import('../screens/admin/AdminGroups'), (m) => m.AdminGroups)
export const AdminGames = lazyScreen(() => import('../screens/admin/AdminGames'), (m) => m.AdminGames)
export const AdminHandicaps = lazyScreen(() => import('../screens/admin/AdminHandicaps'), (m) => m.AdminHandicaps)
export const AdminScores = lazyScreen(() => import('../screens/admin/AdminScores'), (m) => m.AdminScores)
export const AdminAuction = lazyScreen(() => import('../screens/admin/AdminAuction'), (m) => m.AdminAuction)
export const AdminDraw = lazyScreen(() => import('../screens/admin/AdminDraw'), (m) => m.AdminDraw)
export const AdminTeams = lazyScreen(() => import('../screens/admin/AdminTeams'), (m) => m.AdminTeams)
export const AdminHistory = lazyScreen(() => import('../screens/admin/AdminHistory'), (m) => m.AdminHistory)
export const AdminData = lazyScreen(() => import('../screens/admin/AdminData'), (m) => m.AdminData)

const platform = lazyGroup(() => import('../screens/platform'))
export const PlatformGate = platform((m) => m.PlatformGate)
export const PlatformLayout = platform((m) => m.PlatformLayout)
export const PlatformOverview = platform((m) => m.OverviewScreen)
export const PlatformTournaments = platform((m) => m.TournamentsScreen)
export const PlatformTournament = platform((m) => m.TournamentDetail)
export const PlatformPeople = platform((m) => m.PeopleScreen)
export const PlatformPerson = platform((m) => m.PersonDetail)
export const PlatformCourses = platform((m) => m.CatalogCourses)
export const PlatformCourse = platform((m) => m.CourseDetail)
export const PlatformCrews = platform((m) => m.CatalogCrews)
export const PlatformCrew = platform((m) => m.CrewDetail)
export const PlatformNotices = platform((m) => m.NoticesScreen)
export const PlatformAudit = platform((m) => m.AuditScreen)
export const PlatformHealth = platform((m) => m.HealthScreen)
