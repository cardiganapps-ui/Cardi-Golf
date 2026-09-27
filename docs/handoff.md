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
- ~~**Conectar el repo a Vercel.**~~ Diego importó `cardi-golf` (`prj_8JpqrzlqS3ZkYJB8JPlb35EvC9ZU`); Claude puso `VITE_SUPABASE_*` en Production + Preview y el preset Vite con el token de Vercel. (2026-09-27)
- ~~**Subir el logo.**~~ `assets/nacho-logo.png`, 591×640 PNG con fondo transparente. (2026-09-26)
- ~~**Llaves para esta sesión.**~~ Diego pegó las llaves; quedaron en `.env.local` (ignorado por git) y funcionan. (2026-09-27)

## Para probar M0 (no bloquea nada)

- [ ] **Instalar el preview en tu teléfono.** Abre la URL del preview que te mandó Claude en Safari (iPhone) o Chrome (Android) → Compartir / menú ⋮ → "Agregar a pantalla de inicio". Debe abrir a pantalla completa con el ícono verde de la bandera. Dile a Claude si algo se ve mal.

---

## Recomendado, no bloquea: rotar las llaves y guardarlas en el entorno

**Por qué:** las tres llaves que pegaste en el chat (secret key y PAT de Supabase, token de Vercel) quedaron en el historial de dos conversaciones. Sirven para construir el proyecto, pero conviene rotarlas cuando el torneo esté cerca y guardar las nuevas en el entorno de Claude Code, donde las sesiones las leen sin que nadie las vuelva a pegar.

1. Supabase dashboard → proyecto **Cardi-Golf** → **Settings → API Keys → Secret keys** → en la llave `claude` toca **⋯ → Revoke**, luego **Create new secret key** (nombre `claude`). Copia el valor.
2. Supabase → tu avatar → **Account → Access Tokens** → revoca el token actual → **Generate new token** (nombre `claude-code`). Copia el valor.
3. Claude app → Code → abre cualquier sesión de Cardi-Golf → toca el nombre del entorno en la barra del título → **Edit** → en **Environment variables** agrega:
   - `SUPABASE_PAT` = el token del paso 2
   - `SUPABASE_SECRET_KEY` = la llave del paso 1
   - `VERCEL_TOKEN` = un token nuevo de vercel.com → Settings → Tokens (scope: el equipo), tras revocar el actual
   Guarda. Una sesión nueva ya las ve.
4. Dile a Claude "llaves listas".

**Verificación:** desde una sesión nueva, Claude corre `curl -H "Authorization: Bearer $SUPABASE_PAT" https://api.supabase.com/v1/projects` y ve `gmohwledjejlhcwqjnhd`; y las llaves viejas responden 401.

---

## Pendiente: datos del torneo (bloquean M2+, no M0/M1)

Mándalos en el chat como texto, foto o captura, como te quede más fácil. Claude los carga al admin.

- [ ] **Tarjetas de los dos campos:** Solmar Golf Links (día 1) y Quivira (día 2): par e índice de dificultad (SI) de los 18 hoyos por salida (tee), y rating/slope si los tienes. Una foto de cada tarjeta sirve. (Claude puede intentar sacarlas de las webs de los campos; lo que encuentre lo marca como "por confirmar" hasta que tú lo valides.)
- [ ] **Tiers y hándicap base** de los 12 jugadores (§5.1–5.2).
- [ ] **Jugador 12** y **quién es Nacho**.
- ~~**Fechas.**~~ Confirmadas con la reserva de Golfbreaks (US61296): cena Calcutta jue 8 abr 2027; día 1 vie 9 abr en Solmar Golf Links 09:00; día 2 sáb 10 abr en Quivira 09:00. Hotel Pueblo Bonito Pacifica. (2026-09-27)
- [ ] **Horarios de salida por grupo** (la primera salida es 09:00 ambos días; faltan los de los grupos 2 y 3, normalmente cada 10 min).
- [ ] **Banquero** y **miembros del Comité**.
- ~~**Agencia de viajes.**~~ Golfbreaks. (2026-09-27)
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
