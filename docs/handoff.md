# Lo que espera a Diego

This is the only list of things this project needs from a human (CLAUDE.md §0.2). Claude keeps it current:
- A finished item gets struck through in the same commit that proves it's done.
- Anything new is added here, not only in chat.

Each item says **what**, **the exact steps**, and **how Claude will verify it**.

---

## Hecho

- ~~**Crear el repo en GitHub.**~~ `cardiganapps-ui/Cardi-Golf`, privado. Verificado: el primer push llegó. (2026-09-26)
- ~~**Dar acceso a Claude al repo.**~~ Verificado: `add_repo` con permiso de push funcionó. (2026-09-26)
- ~~**Proyecto de Supabase.**~~ Diego creó la organización gratis "Cardi-Golf" con el proyecto `gmohwledjejlhcwqjnhd`. Claude activó anonymous sign-ins y las URLs de redirect. (2026-09-27)
- ~~**Conectar el repo a Vercel.**~~ Diego importó `cardi-golf` (`prj_8JpqrzlqS3ZkYJB8JPlb35EvC9ZU`). (2026-09-27)
- ~~**Subir el logo.**~~ `assets/nacho-logo.png`, 591×640 PNG con fondo transparente. (2026-09-26)

---

## Pendiente: bloquea el primer deploy (M0)

### Poner las dos variables públicas en Vercel (1 minuto, desde el iPhone)
**Por qué:** el conector de Vercel de Claude es de solo lectura (403 al crear variables). Son valores públicos (van en el bundle del navegador), así que no hay riesgo en copiarlos de aquí.

1. Safari → vercel.com → proyecto **cardi-golf** → **Settings** → **Environment Variables**.
2. Key `VITE_SUPABASE_URL` · Value `https://gmohwledjejlhcwqjnhd.supabase.co` · Environments: **Production** y **Preview** → **Save**.
3. Key `VITE_SUPABASE_ANON_KEY` · Value `sb_publishable_AfdMuv4UnxfuskCeC-JCJw_iuEJB6sK` · Environments: **Production** y **Preview** → **Save**.
4. Dile a Claude "variables en Vercel listas".

(Alternativa sin clics futuros: crea un token en vercel.com → Settings → Tokens, scope el equipo, y guárdalo como `VERCEL_TOKEN` en el entorno de Claude Code, como en el paso de abajo. Claude entonces administra Vercel solo.)

**Verificación:** el siguiente deploy de Vercel arranca sin "Almacenamiento pendiente" y la app conecta a Supabase.

---

## Pendiente: secretos del entorno (bloquea M2, no M0/M1)

### Guardar las llaves de Supabase en el entorno de Claude Code
**Por qué:** el conector de Supabase de Claude está atado a la organización Cardigan y no ve el proyecto nuevo. Claude lo administra con la API usando dos llaves que **no pueden vivir en el repo**. Las que pegaste en el chat el 2026-09-26 hay que **rotarlas** (quedaron en el historial de la conversación) y guardar las nuevas en el entorno.

1. Supabase dashboard → proyecto **Cardi-Golf** → **Settings → API Keys → Secret keys** → en la llave `claude` toca **⋯ → Revoke**, luego **Create new secret key** (nombre `claude`). Copia el valor.
2. Supabase → tu avatar → **Account → Access Tokens** → revoca el token actual → **Generate new token** (nombre `claude-code`). Copia el valor.
3. Claude app → Code → abre cualquier sesión de Cardi-Golf → toca el nombre del entorno en la barra del título → **Edit** → en **Environment variables** agrega:
   - `SUPABASE_PAT` = el token del paso 2
   - `SUPABASE_SECRET_KEY` = la llave del paso 1
   Guarda. Una sesión nueva ya las ve.
4. Dile a Claude "llaves listas".

**Verificación:** desde una sesión nueva, Claude corre `curl -H "Authorization: Bearer $SUPABASE_PAT" https://api.supabase.com/v1/projects` y ve `gmohwledjejlhcwqjnhd`; y las llaves viejas responden 401.

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
