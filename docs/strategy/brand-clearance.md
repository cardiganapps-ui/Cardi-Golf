# El nombre «Polo»: qué sabemos y qué falta revisar

Escrito el 2026-10-16 para STRAT-13. No es una opinión legal: es lo que encontré con búsquedas gratuitas, y los pasos para que Diego haga la búsqueda oficial, también gratis, antes de invertir más en la marca. Contratar a un abogado o pagar un registro cuesta, así que es decisión de Diego (CLAUDE.md §0.1).

## Lo que encontré
- **«POLO» es de Ralph Lauren en ropa, accesorios y perfumes, y la defiende.** The Polo/Lauren Company y PRL USA Holdings llevan desde 1984 peleando la palabra contra la U.S. Polo Assn. en Estados Unidos, con un acuerdo parcial en 2003 y una orden permanente en 2011 ([Wikipedia](https://en.wikipedia.org/wiki/Polo_Ralph_Lauren_vs_U.S._Polo_Association), [Finnegan, 2013](https://www.finnegan.com/files/Upload/Newsletters/Incontestable/2013/June/Incontestable_Jun13_15.html)). También se ha opuesto fuera de Estados Unidos, incluso en la clase 9 (anteojos) en Singapur, donde perdió ([IPOS, 2015](https://www.ipos.gov.sg/manage-ip/resolveip-disputes-overview/legal-decisions/legal-decision-list/the-polo-lauren-company--l-p--v-united-states-polo-association--2015--sgipos-10/)), y en la Unión Europea contra un logo de un jinete en bicicleta, donde ganó ([Lexology](https://www.lexology.com/library/detail.aspx?g=d0af70e9-c661-4e76-8772-bb3097b74f44)).
- **En golf, Ralph Lauren vende ropa con la etiqueta «Polo Golf»** (y RLX). Es el mismo público que Polo: golfistas con dinero para un viaje.
- **No encontré una marca «POLO» de Ralph Lauren para software (clases 9 y 42)** en los resultados públicos que pude ver, ni una app de golf llamada Polo. Sí hay apps de polo, el deporte a caballo ([Scoreboard for Polo](https://apps.apple.com/us/app/scoreboard-for-polo/id6476451663), [Lineup Polo](https://apps.apple.com/app/id1624890876)). Que no aparezca en una búsqueda web no quiere decir que no exista: los registros se buscan en las bases oficiales (abajo).
- **En otros países sí han perdido oposiciones:** en Perú, Indecopi dejó registrar «Polo Hit's» contra su oposición. Eso dice que «polo» solo no se les da en todo, no que en México vaya a pasar igual.

## Lo que esto significa
- El riesgo no es que alguien ya tenga «Polo» para una app de golf. Es que **Ralph Lauren es una marca famosa con abogados que se oponen**, y en México una marca notoriamente conocida protege más allá de sus clases. Un registro de «Polo» en la clase 9 o 42 tiene buena probabilidad de recibir oposición, y usarlo sin registro tiene el riesgo de un aviso para dejar de usarlo, que es barato para ellos y caro para nosotros, sobre todo con usuarios y un ícono ya en sus teléfonos.
- Hoy cambiar el nombre cuesta poco: un torneo de prueba y un viaje. Cada mes de uso lo hace más caro. Por eso la búsqueda va antes de cualquier trabajo de marca más (el logo vectorial VIS-14, las piezas de marca VIS-15/STRAT-15).
- La infraestructura ya está separada del nombre (CLAUDE.md, «Name»): cambiar el nombre es cambiar textos, el ícono y el dominio, no los datos.

## La búsqueda oficial, gratis (Diego, 20 minutos)
1. **IMPI (México), búsqueda fonética.** https://marcia.impi.gob.mx (antes Marcanet, marcanet.impi.gob.mx). Busca «POLO» en **fonética**, y anota cuántos registros vigentes hay en las clases **9** (software descargable, apps), **41** (organizar torneos y competencias deportivas) y **42** (software como servicio). Anota los titulares; si aparece The Polo/Lauren Company o PRL USA Holdings en alguna de esas tres, es una señal fuerte para cambiar.
2. **WIPO Global Brand Database.** https://branddb.wipo.int → «POLO», filtro por las clases 9, 41 y 42 y por México y Estados Unidos.
3. **USPTO.** https://tmsearch.uspto.gov → «POLO», las mismas clases.
4. Si en ninguna de las tres hay un «POLO» vivo en esas clases, la decisión es tuya: seguir con Polo sabiendo que Ralph Lauren puede oponerse, o pagar una opinión de un abogado de marcas (💰). Si hay uno, propongo cambiar de nombre ahora.

## Si se cambia el nombre
- Busca primero los candidatos en las mismas tres bases, en las mismas clases, y que el dominio .mx y .com estén libres (comprar un dominio cuesta: es tu decisión).
- El cambio en el código es de un día: los textos (`src/i18n/es-MX.ts`), el ícono y el wordmark (`npm run icons`), el manifiesto, el correo que manda Supabase y los avisos legales (nueva versión). Las llaves de almacenamiento del teléfono no cambian, así que nadie pierde su sesión ni sus hoyos sin subir (como en el cambio a Polo del 2026-09-28).

## El dominio
Polo vive en `golf.cardigan.mx`, el dominio de Cardigan, que guarda datos de salud de pacientes. Las bases de datos, el almacenamiento y las cuentas están separadas (CLAUDE.md §3), pero el nombre del dominio mezcla las dos marcas y el aviso de privacidad las pone juntas. Un dominio propio cuesta, así que va en el handoff como decisión tuya; con él, el cambio es agregarlo en Vercel y en la lista de Supabase Auth, y dejar `golf.cardigan.mx` funcionando.
