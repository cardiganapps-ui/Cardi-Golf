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
- ~~**Llave de GolfCourseAPI.**~~ En Vercel (`GOLFCOURSE_API_KEY`). Probada: Quivira aparece con 5 tees completos; Solmar no está en la base (se carga por foto o a mano). (2026-09-27)
- ~~**Llave de Anthropic en Vercel.**~~ `ANTHROPIC_API_KEY` con workspace, modelo Haiku. Probada: leyó una tarjeta de prueba 18/18 por ~$0.0025. (2026-09-27)
- ~~**Llave de OpenGolfAPI.**~~ En Vercel (`OPENGOLF_API_KEY`), segunda fuente de campos. Probada: tiene Solmar y Quivira en su lista, pero sin tarjeta; los campos con datos (p. ej. Pebble Beach) traen tees, rating/slope, par y SI. (2026-09-27)
- ~~**Subir el logo.**~~ `assets/nacho-logo.png`, 591×640 PNG con fondo transparente. (2026-09-26)
- ~~**Llaves para esta sesión.**~~ Diego pegó las llaves; quedaron en `.env.local` (ignorado por git). La `SUPABASE_SECRET_KEY` llegó truncada (32 de 41 caracteres); Claude tomó la real con el PAT desde la Management API. (2026-09-27)
- ~~**Cuenta de organizador.**~~ Claude creó `gaxioladiego@gmail.com` como dueño del torneo **Ensayo** (sin contraseña conocida: entra con "¿Olvidaste tu contraseña?" o "Mándame un link por correo"). (2026-09-27)

## Para probar M2 y M3 (no bloquea nada)

- [ ] **Capturar un hoyo.** Entra como Nico (PIN 1234) → pestaña **Tarjeta** (el día 1 del Ensayo ya está en juego, grupo 3) → mueve golpes/putts → "Guardar hoyo". Con otro teléfono (o pestaña) entrando como Diego O. verás cambiar **En vivo** en menos de 2 s. Prueba en modo avión: la app guarda "1 pendiente" y sincroniza al volver la señal.
- [ ] **Ficha de jugador.** Toca cualquier fila del leaderboard: tarjeta por día, hándicap con "¿Cómo se calculó?", dinero si terminara ahora.

- [ ] **Instalar la app en tu teléfono.** Abre https://cardi-golf.vercel.app en Safari (iPhone) o Chrome (Android) → Compartir / menú ⋮ → "Agregar a pantalla de inicio". Debe abrir a pantalla completa con el ícono verde de la bandera.
- [ ] **Entrar como jugador.** Código **ENSAYO** (o https://cardi-golf.vercel.app/t/ensayo) → toca una cara → PIN **1234** (todos los del Ensayo tienen ese PIN; Nico es admin y ve el Comité).
- [ ] **Entrar como organizador.** https://cardi-golf.vercel.app/organizer/login → escribe tu correo → "¿Olvidaste tu contraseña?" → abre el correo en el teléfono → pon tu contraseña → verás "Mis torneos" con el Ensayo. Desde ahí, "Comité" para editar todo.
- [ ] **Crear un torneo desde cero** con "Nuevo torneo" y comprobar que el cuadre de la bolsa se pone en rojo si cambias un premio.

---

## Recomendado, no bloquea: rotar las llaves y guardarlas en el entorno

**Por qué:** las llaves que pegaste en el chat (secret key y PAT de Supabase, token de Vercel, GolfCourseAPI, OpenGolfAPI y las dos de Anthropic — la primera sin workspace ya no se usa: revócala) quedaron en el historial de dos conversaciones. Sirven para construir el proyecto, pero conviene rotarlas cuando el torneo esté cerca y guardar las nuevas en el entorno de Claude Code, donde las sesiones las leen sin que nadie las vuelva a pegar.

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

- [ ] **Tarjeta de Solmar Golf Links (día 1):** no está completo en ninguna de las dos bases de campos (OpenGolfAPI lo tiene sin tarjeta); manda una foto de la tarjeta o súbela en la app cuando M2 esté listo. Quivira (día 2) ya se puede importar desde la búsqueda. Para cada campo: par e índice de dificultad (SI) de los 18 hoyos por salida (tee), y rating/slope si los tienes. Una foto de cada tarjeta sirve. (Claude puede intentar sacarlas de las webs de los campos; lo que encuentre lo marca como "por confirmar" hasta que tú lo valides.)
- [ ] **Tiers y hándicap** de los 12 jugadores: índice WHS si lo tienen; si no, tres scores (buen día / normal / mal día) y la app estima uno (§13b). También qué tee juega cada uno.
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
