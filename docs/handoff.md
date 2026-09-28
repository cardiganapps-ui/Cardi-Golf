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
- ~~**Link bonito.**~~ **https://golf.cardigan.mx** en vivo con HTTPS; Claude creó el CNAME en Cloudflare con tu token de DNS. `cardi-golf.vercel.app` sigue funcionando. (2026-09-27)
- ~~**Correos de acceso.**~~ Supabase manda por Resend desde "Cardi-Golf" <golf@cardigan.mx>, hasta 30/hora. Probado con un correo real. (2026-09-27)
- ~~**Respaldos.**~~ Bucket R2 `cardi-golf-backups` creado y probado; las llaves están en Vercel para el respaldo nocturno. (2026-09-27)
- ~~**Subir el logo.**~~ `assets/nacho-logo.png`, 591×640 PNG con fondo transparente. (2026-09-26)
- ~~**Llaves para esta sesión.**~~ Diego pegó las llaves; quedaron en `.env.local` (ignorado por git). La `SUPABASE_SECRET_KEY` llegó truncada (32 de 41 caracteres); Claude tomó la real con el PAT desde la Management API. (2026-09-27)
- ~~**Cuenta de organizador.**~~ Claude creó `gaxioladiego@gmail.com` como dueño del torneo **Ensayo** (sin contraseña conocida: entra con "¿Olvidaste tu contraseña?" o "Mándame un link por correo"). (2026-09-27)

## Nombre nuevo: Polo

- [x] ~~**Nombre del remitente de los correos.**~~ Claude lo cambió a «Polo» con las llaves que pegaste (bloque SMTP completo, lo demás intacto). Verificado: un correo real de «¿Olvidaste tu contraseña?» salió de "Polo" <golf@cardigan.mx> y Resend lo marca entregado. (2026-09-28)
- [ ] **Reinstalar la app.** Cuando esto llegue a `main`, borra la app de la pantalla de inicio y vuelve a agregarla desde https://golf.cardigan.mx: el nombre bajo el ícono debe decir «Polo» y el ícono es la P cursiva trazada a lápiz, como en la hoja que aprobaste (`design/brand/polo-logo-sheet.jpg`).

## Limpieza tras la revisión (docs/audit-2026-09-28.md)

- [ ] **Probar la sincronización en cancha (PR 1).** En tu teléfono con la app instalada y dentro de `/t/ensayo` como Nico: (1) pon modo avión, cierra la app del todo y vuélvela a abrir: debe mostrar los tableros y la Tarjeta con el aviso «Sin señal: mostrando lo último guardado»; (2) sigue en modo avión, guarda un hoyo, quita el modo avión: el chip pasa de «1 pendiente» a «Sincronizado» solo, y los cuatro jugadores del hoyo llegan juntos (no uno primero y tres cinco segundos después); (3) cuando yo suba una versión nueva, la app te avisa «Hay una versión nueva» con un botón, ya no se recarga sola. Como jugador sin ser Comité (otro PIN), «Más» ya no debe mostrar «Consola del Comité».
- [ ] **Probar la Tarjeta y los tableros (PR 4).** En tu teléfono, en `/t/ensayo`: (1) Tarjeta: el botón «Guardar hoyo» ya no se esconde detrás de la barra de abajo en pantallas cortas; arrastrar dentro de la hoja «¿Quién embocó al último?» ya no cambia de hoyo; al guardar un hoyo que ya tenía valores, «Deshacer» de verdad regresa los valores anteriores (en un hoyo nuevo dice «Corregir»); (2) En vivo: «Grupo puntero en el hoyo N» y el hoyo del homenajeado siguen el orden de juego (salida por el 10); (3) Juegos: la columna «Hoyo» es el hoyo del día, no la suma de los dos días, y en Matrimonios el dinero ya no sale cortado; (4) Jugador: la tarjeta va en dos filas de nueve (Ida y Vuelta) sin desplazarse de lado; (5) «Compartir tabla» en iPhone: si el sistema rechaza compartir, descarga la imagen en vez de fallar; (6) Más › Tarjetas para imprimir: sale en horizontal y sin página en blanco al final; TV: la pantalla no se apaga y con más de 12 jugadores va paginando.
- [ ] **Probar el Comité endurecido (PR 3).** En `/t/ensayo` como Nico (Comité): (1) Comité › Grupos: contesta una víbora pendiente en Tarjetas, luego cambia una hora de salida y guarda: la respuesta sigue ahí; (2) Comité › Datos: descarga el respaldo JSON y vuelve a restaurarlo: te pide confirmar en una hoja (ya no un cuadro del navegador) y al terminar dice cuántos jugadores, rondas y hoyos entraron; (3) Comité › Tarjetas: corrige un hoyo con putts mayores que los golpes: se rechaza antes de mandar; en una tarjeta firmada te pide razón; (4) en tu teléfono, 5 PINs mal seguidos bloquean *ese teléfono* 5 minutos, pero el jugador sigue entrando desde otro; (5) Comité › Campos: como jugador admin ya puedes «Buscar campo» y «Subir tarjeta», y borrar solo los campos que tú creaste. Ojo: el bloque de scores cambió en la base; si un teléfono viejo del Comité corrige un hoyo antes de recargar la app, verá «permission denied» hasta que recargue.
- [ ] **Revisar las reglas de dinero afinadas (PR 2).** Nada cambia para el torneo de Nacho salvo tres casos raros que ahora se ven en vez de esconderse: (1) si un slot de la Calcutta no tiene a quién pagarse (por ejemplo los tres D empatan en el último lugar y ya cobran «Mejor D»), ese dinero se queda en el banco y sale un aviso en Comité › Torneo; antes se le daba en silencio al dueño del campeón; (2) un hoyo levantado cuenta 3 putts como mínimo aunque se hayan capturado 2; (3) en «Menos putts» ya no lidera quien lleva menos hoyos. En `/t/ensayo` › Juegos › Calcutta y Dinero tiene que verse igual que antes; en Comité › Torneo el cuadre ahora dice «$10,000» con coma.

## Rediseño

- [x] ~~**Aprobar la dirección de diseño.**~~ Decidido 2026-09-27: dirección A, «La tarjeta»; PR #11 fusionado; la fase 2 (sistema) va a `main` conforme quede verde y la fase 3 (pantalla por pantalla) sigue en PRs separados.
- [ ] **Probar el rediseño en tu teléfono y en la laptop.** Ya está todo en `main` (fase 2, el sistema, y fase 3, pantalla por pantalla: PRs #12 a #20). En https://golf.cardigan.mx borra la app de la pantalla de inicio y vuélvela a instalar: el ícono, el color de la barra y la pantalla de arranque deben ser los nuevos (ahora la P de Polo trazada a lápiz). Como jugador (`/t/ensayo`, PIN de Nico): En vivo con Puntos/Gross, la Tarjeta con el grupo en una pantalla y la cuadrícula, Juegos, un jugador (toca un hoyo para el «¿Cómo se calculó?»), Dinero. Como organizador (entra con tu correo): Mis torneos, el asistente de «Nuevo torneo» hasta el resumen del paso 3 (no lo crees si no quieres), y el Comité en la laptop (columna lateral, avisos en Tarjetas). En la tele: `/t/ensayo/tv` y `/t/ensayo/ceremonia`. Para ver todo con 60 jugadores y nombres largos: `/t/_/large60` y `/t/_/longnames`. Lo que decidí y lo que quedó pendiente está en `DESIGN_NOTES.md`; las capturas de antes y después en `design/shots/before` y `design/shots/after`. Responde con lo que no te convenza, pantalla por pantalla.

## Para probar M2 a M7 (no bloquea nada)

- [ ] **Ensayo completo (M7).** El Ensayo ya tiene el día 1 terminado (simulado) y el día 2 en juego con 9 hoyos. Léete `RUNBOOK.md` (una página, en español) y sigue "6. Cerrar una ronda" y "7. Ceremonia": termina el día 2 desde Comité › Rondas, pon el torneo en Terminado y corre la Ceremonia en una tele. Comité › **Datos**: descarga el respaldo JSON y el CSV, prueba "Restaurar desde JSON…" con ese mismo archivo, y "Ver tarjetas para imprimir" → guarda el PDF. "Duplicar torneo" crea un torneo nuevo para ensayar con tus amigos sin tocar el Ensayo.

- [ ] **Dazzle (M6).** En vivo ahora trae el feed ("birdie en el 7", "cambio de líder", "la víbora pasa a…") y "Compartir tabla" genera una imagen para WhatsApp. Más › **Stats y premios**: premios automáticos (Rey del Birdie, Mano de Piedra…), la carrera de puntos con ▶ para revivirla, el campo y la tabla por jugador. Más › **Reglamento**: las reglas leídas de la configuración. Más › **Modo TV** rota tableros (y el feed). Nico ve además **Ceremonia**: revela uno por uno hasta el campeón con confeti (en la tele se ve mejor).

- [ ] **Noche de Calcutta (M5).** Entra como Nico → Comité › **Calcutta** → "Borrar la subasta" (la del ensayo ya está corrida) → "Sacar del sombrero" → "Abrir lote 1". En la tele abre https://cardi-golf.vercel.app/t/ensayo/tv: mientras el torneo está en modo subasta, muestra el lote, la puja, el pozo y "Lo que está en juego". Toca un postor, +$250 / +$500 / +$1,000 u "Otra", "Deshacer", "¡Vendido!" y la recompra (0 / 25 / 50 %). Un postor con 3 jugadores se apaga solo.
- [ ] **Sorteo de parejas.** Al vender el último lote, "Sorteo de parejas": el homenajeado escoge (cuando marques a Nacho en Jugadores), el resto sale con anillos, nombra las parejas y guarda: genera los grupos del día 1 (ajusta horas en Grupos).
- [ ] **Dinero.** Pestaña Dinero: "Si terminara ahora" por persona con desglose al tocar; "Liquidación" con quién debe qué (inscripción, Calcutta, recompras) y botones "Pagado" (solo Comité), vía banco o sin banco, y "Compartir" a WhatsApp. El banco del Ensayo es Nico (Comité › Torneo para cambiarlo).

- [ ] **Juegos.** Pestaña Juegos: Individual con countback (⇄), Matrimonios con cara a cara por grupo, Mejor ronda, La Víbora (quién la tiene, historial, $600 en juego) y Menos putts.
- [ ] **Comité › Grupos / Hándicaps / Scores.** Genera los grupos del día 2 por tabla de parejas, revisa el recorte del día 2 y prueba un ajuste con razón, corrige un hoyo desde Scores.

- [ ] **Capturar un hoyo.** Entra como Nico (PIN 1234) → pestaña **Tarjeta** (el día 1 del Ensayo ya está en juego, grupo 3) → mueve golpes/putts → "Guardar hoyo". Con otro teléfono (o pestaña) entrando como Diego O. verás cambiar **En vivo** en menos de 2 s. Prueba en modo avión: la app guarda "1 pendiente" y sincroniza al volver la señal.
- [ ] **Ficha de jugador.** Toca cualquier fila del leaderboard: tarjeta por día, hándicap con "¿Cómo se calculó?", dinero si terminara ahora.

- [ ] **Instalar la app en tu teléfono.** Abre https://cardi-golf.vercel.app en Safari (iPhone) o Chrome (Android) → Compartir / menú ⋮ → "Agregar a pantalla de inicio". Debe abrir a pantalla completa con el ícono de la P a lápiz y el nombre «Polo».
- [ ] **Entrar como jugador.** Código **ENSAYO** (o https://golf.cardigan.mx/t/ensayo) → toca una cara → PIN **1234** (todos los del Ensayo tienen ese PIN; Nico es admin y ve el Comité).
- [ ] **Entrar como organizador.** https://golf.cardigan.mx/organizer/login → escribe tu correo → "¿Olvidaste tu contraseña?" → abre el correo en el teléfono → pon tu contraseña → verás "Mis torneos" con el Ensayo. Desde ahí, "Comité" para editar todo.
- [ ] **Crear un torneo desde cero** con "Nuevo torneo" y comprobar que el cuadre de la bolsa se pone en rojo si cambias un premio.

---

## Recomendado, no bloquea: rotar las llaves y guardarlas en el entorno

**Por qué:** las llaves que pegaste en el chat (secret key y PAT de Supabase, token de Vercel, GolfCourseAPI, OpenGolfAPI, las dos de Anthropic, Resend, el token de Cloudflare DNS, el token y el par de llaves de R2, y el token de GitHub (vence solo el 27-sep) — la primera sin workspace ya no se usa: revócala) quedaron en el historial de dos conversaciones. Sirven para construir el proyecto, pero conviene rotarlas cuando el torneo esté cerca y guardar las nuevas en el entorno de Claude Code, donde las sesiones las leen sin que nadie las vuelva a pegar.

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
