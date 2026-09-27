# Cardi-Golf

Plataforma para torneos de golf entre amigos: marcador en vivo, juegos, subasta Calcutta, dinero y liquidación. Cada torneo se crea y configura desde la app; el primero es el Nacho's Bachelor Invitational.

- Brief completo y reglas de trabajo: [`CLAUDE.md`](CLAUDE.md)
- Lo que falta de parte de Diego: [`docs/handoff.md`](docs/handoff.md)

## Desarrollo

```bash
npm install
cp .env.example .env.local   # valores públicos (VITE_*); los secretos van aparte
npm run dev                  # http://localhost:5173
npm run preflight            # typecheck → lint → test → build (lo mismo que CI)
```

| Carpeta | Qué hay |
|---|---|
| `src/engine/` | Motor puro: `computeTournament(snapshot, settings)`. `core/` (hándicaps, puntos, countback, dinero) y `modules/<juego>/` (un módulo por juego). Sin I/O ni React. |
| `src/engine/settings/` | Esquema (Zod) de `tournaments.settings`, presets (plataforma y primer torneo) y la validación de la bolsa de premios. |
| `src/app/`, `src/screens/`, `src/components/` | Shell PWA, router y pantallas. |
| `src/i18n/es-MX.ts` | Todo el copy de la app. |
| `src/styles/` | Tokens de diseño (§14) y estilos globales. |
| `src/data/` | Auth (organizadores por correo, jugadores anónimos + PIN), store del torneo (snapshot + engine + Realtime) y escrituras tipadas. |
| `src/screens/` | `organizer/` (login, Mis torneos, wizard), `tournament/` (Entrar, shell con tabs, En vivo, Más), `admin/` (Comité: torneo, jugadores, campos, rondas). |
| `api/` | Rutas serverless de Vercel: `course-search` (GolfCourseAPI) y `scorecard-extract` (foto de tarjeta → borrador, Claude). Llaves solo en Vercel. |
| `supabase/migrations/` | Schema, funciones/RPCs, RLS, Realtime y Storage. Se aplican con `node scripts/db.mjs migrate` (Management API). |
| `scripts/` | `preflight.sh` (candado local y CI), `prepush-guard.sh` (hook), `db.mjs` (SQL/migraciones), `rls-test.mjs` (aislamiento entre torneos, contra el proyecto real), `seed-ensayo.mjs` (torneo de ensayo), `simulate.mjs` (simulador de rondas, solo Ensayo; `--interval N` para tiempo real), `rehearse-auction.mjs` (una Calcutta de 12 lotes), `make-icons.mjs`. El runbook del torneo está en `RUNBOOK.md`. |
| `.github/workflows/` | `ci.yml` (job `check`) y `keepalive.yml` (ping diario a Supabase free). |

Producción: `main` → Vercel, en **https://golf.cardigan.mx** (también `cardi-golf.vercel.app`). Cada rama `claude/*` obtiene un preview.
