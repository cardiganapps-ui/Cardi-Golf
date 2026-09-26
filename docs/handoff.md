# Lo que espera a Diego

This is the only list of things this project needs from a human (CLAUDE.md §0.2). Claude keeps it current:
- A finished item gets struck through in the same commit that proves it's done.
- Anything new is added here, not only in chat.

Each item says **what**, **the exact steps**, and **how Claude will verify it**.

---

## Hecho

- ~~**Crear el repo en GitHub.**~~ `cardiganapps-ui/Cardi-Golf`, privado. Verificado: el primer push llegó. (2026-09-26)
- ~~**Dar acceso a Claude al repo.**~~ Verificado: `add_repo` con permiso de push funcionó. (2026-09-26)
- ~~**Subir el logo.**~~ `assets/nacho-logo.png`, 591×640 PNG con fondo transparente. (2026-09-26)

---

## Pendiente: bloquea M0

### 1. Decidir el proyecto de Supabase (💰 decisión de dinero)
**Por qué:** la organización "Cardigan" está en el plan gratis, y el plan gratis permite 2 proyectos activos. Los dos ya están ocupados:
- `cardigan`: producción, datos clínicos.
- `angus`: en vivo, lo usa Andrea.

`cardigan-staging` está pausado. Claude no puede crear un tercero sin que alguien pague o pause algo.

**Opciones:**
- **A (recomendada): subir la organización "Cardigan" a Pro.** Revisa el precio actual en supabase.com/pricing antes de confirmar.
  1. Supabase dashboard → organización **Cardigan** → **Billing** → **Change plan** → **Pro**.
  2. Dile a Claude "ya está en Pro". Claude crea el proyecto `cardi-golf` en `us-east-2`.
- **B: otra cuenta/organización gratis** que no tenga proyectos. Dile a Claude cuál y dale acceso.
- **C: no pausar nada en producción.** Pausar `angus` o `cardigan` tumbaría una app en uso. No es opción.

**Verificación:** Claude crea el proyecto, ve `ACTIVE_HEALTHY` y lo anota en CLAUDE.md §3.

### 2. Conectar el repo a Vercel (gratis, 1 minuto)
**Por qué:** el conector de Vercel que usa Claude puede leer el equipo pero no crear proyectos (403), y este entorno no tiene un token de Vercel.

Elige una:
- **A (recomendada): importarlo tú.**
  1. vercel.com → equipo **cardiganapps-4938's projects** → **Add New…** → **Project**.
  2. En "Import Git Repository" busca **Cardi-Golf** → **Import**.
  3. Framework Preset: **Vite**. No cambies nada más. **Deploy** (el primer deploy puede fallar; no importa, aún no hay app).
  4. Dile a Claude "Vercel listo".
- **B: darle un token a Claude.** vercel.com → Settings → Tokens → Create, scope **cardiganapps-4938's projects**. Guárdalo como `VERCEL_TOKEN` en los secretos del entorno de Claude Code (Settings → Environments). Claude crea el proyecto por la API.

**Verificación:** Claude ve el proyecto `cardi-golf` en el equipo, con el repo conectado, y anota su `prj_…` en CLAUDE.md §3.

---

## Pendiente: datos del torneo (bloquean M2+, no M0/M1)

Mándalos en el chat como texto, foto o captura, como te quede más fácil. Claude los carga al admin.

- [ ] **Tarjeta del campo:** par e índice de dificultad (SI) de los 18 hoyos para cada salida (tee), y el rating/slope si los tienes. Una foto de la tarjeta sirve.
- [ ] **Tiers y hándicap base** de los 12 jugadores (§5.1–5.2).
- [ ] **Jugador 12** y **quién es Nacho**.
- [ ] **Fechas** del torneo y de la cena de la Calcutta, y los horarios de salida.
- [ ] **Banquero** y **miembros del Comité**.
- [ ] **Nombre de la agencia de viajes** (el trofeo Putter).
- [ ] **Sección 18:** o "quedan los defaults", o tus respuestas punto por punto. (Todo esto se captura en el wizard del torneo; no hay que tocar código para el siguiente torneo.) En particular: ¿link de espectador (9)? ¿dominio propio (10)? El dominio cuesta dinero.

---

## Opcional

### Proteger `main` en GitHub (💰 en un repo privado)
El candado local (el hook de pre-push) y el CI (`check`) ya evitan que llegue código roto. Un ruleset además impediría que *cualquiera* empuje directo a `main`. En repos **privados**, GitHub solo aplica rulesets con un plan de pago (GitHub Pro), así que es opcional.

Si lo quieres:
1. Repo → **Settings** → **Rules** → **Rulesets** → **New ruleset** → **New branch ruleset**.
2. Name: `main` · Enforcement: **Active** · Target branches: **Include default branch**.
3. Marca:
   - **Require a pull request before merging** (0 approvals).
   - **Require status checks to pass**, y agrega `check`.
   - **Block force pushes**.
4. **Create**.

**Verificación:** en el siguiente PR, GitHub muestra "Merging is blocked" hasta que `check` pasa.
