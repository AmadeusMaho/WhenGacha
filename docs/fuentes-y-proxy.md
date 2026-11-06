# Fuentes de datos, proxy y recolector

Lee esto antes de tocar `src/sources/`, `server/proxy.mjs`, `server/collector.mjs` o cómo se sincroniza la app.
Resume lo que se hizo el 5-6 nov 2026 y, sobre todo, **el incidente que bloqueó al servidor** para que no se repita.

## Cómo fluyen los datos

```
fuentes externas ──► server/proxy.mjs (cola, caché, pausas) ──► server/collector.mjs ──► .cache/snapshots/<juego>.json
                                                                                              │
navegador ◄── GET /data/<juego>.json (copia normalizada, ~10 KB gz) ◄──────────────────────────┘
        └── si no hay copia (o tiene >24 h): consulta las fuentes él mismo, SIEMPRE a través de /proxy
```

- **Recolector** (`server/collector.mjs`): cada 1–6 h (`staleMs` en `src/sources/index.ts`) ejecuta `syncSource` de cada juego,
  de uno en uno. Usa las mismas fuentes que la app, empaquetadas en `server/bundle/collector.mjs` (`npm run build:server`,
  parte de `build:prod`) con `linkedom` como DOM de Node. **El bundle se versiona** (el host no instala ni compila).
  Si una ejecución falla o sale vacía, conserva la copia buena anterior.
- **Proxy** (`server/proxy.mjs`): lista cerrada de fuentes (`SOURCES`), caché en memoria y en disco, refresco en segundo plano
  (sirve lo guardado y renueva detrás), cola por sitio, pausa tras bloqueos y límite por IP.
- **Cliente** (`src/store.ts` + `fetchSnapshot` en `src/net.ts`): pide primero la copia; si falta, usa el camino directo.
- Service worker (`public/sw.js`): `/data/` y `/proxy` van "red primero" y solo se guardan respuestas correctas.

## Estado actual: gachafocus DESACTIVADO (6 nov 2026)

La web de gachafocus muestra un aviso que **prohíbe la recolección automatizada** (scraping, navegadores automáticos, uso de sus rutas internas como API, IA) y dice que los datos
solo estarán en su **API oficial de pago** (aún sin abrir; contacto: gachafocus.com.br/en/contact). Por eso:

- `src/sources/index.ts` tiene un interruptor `GF_ON` (`GACHAFOCUS_ENABLED=1` en el servidor / `VITE_GACHAFOCUS_ENABLED=1` en la app sin servidor). **Por defecto está apagado**: nadie
  consulta gachafocus (ni el recolector, ni el flujo de Actions, ni el PC). El código de `gachafocus.ts` y su entrada en el proxy se conservan para usarlos con la API de pago si se contrata.
- **No lo reactives para scrapear.** Si hay API de pago, habrá que cambiar `gachafocus.ts` para usarla (clave en una variable del servidor).
- **Epic Seven** ya no depende de él: `src/sources/epic7.ts` = banners de `bannerhistory.app/en/e7-pickup-history` (datos incrustados en el HTML; robots.txt permite `/en/`; términos: acceso moderado,
  no presentar sus datos como registro oficial, crédito donde sea práctico; contacto waterbeetles.dev@gmail.com) + eventos de los avisos oficiales de STOVE (`api.onstove.com/cwms/v3.0/article_group/BOARD/988` Events y
  `986` Game Maintenance; es la API que usa su propia web, sin documentar). El periodo sale del texto ("Schedule: 10/29 (Thu) after the maintenance – 12/10 (Thu) 02:59 UTC"); "tras el mantenimiento" se
  resuelve con el aviso "Maintenance Notice (Completed)" (hora real) o, si no existe aún, 09:00 UTC marcado "≈"; si el resumen no trae el periodo se lee el aviso entero (máx. 8 por ciclo); los héroes nuevos
  que bannerhistory aún no lista salen de los avisos "Update Content". Medido el 6 nov 2026: **recupera los 12 elementos que daba gachafocus** (con las mismas horas) y añade 4 eventos menores semanales.
- **CZN** (`src/sources/czn.ts`, ayudantes comunes en `src/sources/stove.ts`): eventos desde su comunidad en STOVE (`page.onstove.com/chaoszeronightmare/en`, canal 11034; tablones Updates=142421,
  Current Events=139240, Announcements=139238). Cada "Update Notice" trae una sección "■" por evento con su periodo en `MM/DD/YYYY after the maintenance – MM/DD/YYYY before the maintenance` y su imagen;
  los sub-eventos (Visit Present, Attendance Check, Additional Aether Distribution...) salen como "<Evento>: <Sub>". "Después del mantenimiento" = hora real de su aviso "[Maintenance] ... (Completed)"
  (≈07:00 UTC si aún no existe); "antes del mantenimiento" = 00:00 UTC (aviso oficial de jul 2026: el mantenimiento semanal empieza a las 00:00 UTC). Banners siguen viniendo de Prydwen.
  Medido el 6 nov 2026: **recupera los 11 eventos de gachafocus con las mismas horas** (+ Overdrive: Simulation, VTS Nine y 2 concursos de comentarios menores). Imágenes: la de la sección del aviso; los
  "Virtual Tactical Simulation: X" usan el arte del banner de X (`withBannerArt` en index.ts).
- Las imágenes de STOVE (cloudfront, varios MB) se piden por `image.onstove.com/850x0//<host>/<ruta>/webp` (~60 KB): `sized()` en `stove.ts`.
- **Stella Sora: SIN fuente automática (eventos perdidos).** Su web oficial (`stellasora.global`, API `/api/resource/news?type=latest|activity|notice`) trae todo lo necesario (avisos "Version X is Now Live!" con
  `Period: Oct. 19, 2026 after maintenance – Nov. 09, 2026 19:59 (UTC-7)` y avisos de mantenimiento con inicio/fin), pero **sus Términos de Uso (Yostar, stellasora.global/agreement) prohíben el scraping y el acceso con
  "robots/spiders"** salvo buscadores. No se ha implementado. Opciones: pedir permiso a StellaSora.cs@yo-star.com, o un archivo de eventos escrito a mano. Los banners siguen viniendo de la wiki de Miraheze.
- **STOVE (Epic Seven y CZN)**: usamos la API interna de su web (`api.onstove.com/cwms`); `page.onstove.com/robots.txt` permite todo, pero el de `api.onstove.com` respondió 503 y **no se revisaron sus términos de uso**.
  Pendiente: contactar con Smilegate/STOVE para confirmar que está permitido a este ritmo (~10 peticiones por ciclo, caché de 2 h en el proxy).

### Traspaso: qué falta y cómo seguir (6 nov 2026)

**Objetivo del dueño:** dejar de depender de gachafocus **sin perder elementos**, usando fuentes oficiales o abiertas cuyos términos lo permitan, manteniendo imágenes propias de cada evento (como las de gachafocus; si un
juego no tiene arte distinto por evento, vale compartir la imagen del aviso). El dueño quiere **otra fuente para lo que falta** (la lista de abajo). El código de gachafocus se conserva por si contrata su API de pago.

| Juego | Estado | Qué se perdió al apagar gachafocus | Ideas |
|---|---|---|---|
| Epic Seven | **HECHO** (`epic7.ts`) | nada (12/12) | — |
| CZN | **HECHO** (`czn.ts`) | nada (11/11 eventos) | — |
| **Stella Sora** | **PENDIENTE** | todos los eventos (banners sí, desde la wiki Miraheze) | La web oficial (`stellasora.global`) y sus redes (X, Facebook, YouTube, TikTok, Discord) **no son opción**: Términos de Yostar y de cada red prohíben el scraping/bots. Opciones: otra fuente abierta con eventos fechados; pedir permiso a StellaSora.cs@yo-star.com; o archivo de eventos escrito a mano (`stellasora-events.json`, `source: 'manual'`) a partir de los avisos "Version X is Now Live!". Ya se vio el formato: `Period: Oct. 19, 2026 after maintenance – Nov. 09, 2026 19:59 (UTC-7)`; el mantenimiento semanal acaba a las 21:00 (UTC-7) salvo versiones grandes (ver el aviso de mantenimiento). |
| NIKKE | pendiente (complemento: eventos 3→12, banners) | eventos menores y horas exactas | Avisos oficiales de NIKKE (comprobar términos/robots antes), Prydwen ya da banners |
| Arknights | pendiente (eventos 5→10) | eventos menores | anuncios oficiales de Arknights; la wiki wiki.gg ya da lo principal |
| Blue Archive | pendiente (eventos 4→22) | eventos menores | Cargo/wiki ya da 4; comunidad oficial en STOVE no (es de Nexon); mirar su sitio de noticias |
| Reverse: 1999 | pendiente (eventos 10→27) | eventos menores | avisos oficiales de Bluepoch (sitio/redes: comprobar términos) |
| WuWa | pendiente (complemento de eventos) | desafíos recurrentes y horas | Reverie + Game8 ya cubren lo principal; avisos oficiales de Kuro |
| NTE | pendiente (complemento de eventos) | horas exactas (Game8 solo da el día, "≈") | avisos oficiales de Hotta/Perfect World |

**Cómo medir cada sustituto:** `docs/baseline-gachafocus-2026-11-06/<juego>.json` son las copias con gachafocus de antes de apagarlo (ver su README: de Arknights y WuWa ya no hay). Se ejecuta la fuente nueva
(p. ej. el script de prueba: importar `server/proxy.mjs` y `server/bundle/collector.mjs`, `mod.setup(proxy.sourceFetch)`, `mod.collect('<juego>')`, tras `npm run build:server`) y se compara elemento a elemento
(título, inicio, fin, imagen). Lo que no se pueda fechar con seguridad se descarta en vez de inventarlo (o se marca `precision: 'approx'`, "≈").

**Antes de usar cualquier fuente nueva (obligatorio, es lo que nos bloqueó antes):** leer su `robots.txt` **y sus Términos de Uso** (en un navegador si se dibujan con JS; `page.evaluate`/`innerText`), no usar rutas internas
si los términos lo prohíben, poca frecuencia (caché del proxy 2–6 h, pausa entre peticiones en `GAP`), identificarse con el User-Agent propio, y añadir la fuente a `SOURCES` en `server/proxy.mjs` con la ruta exacta
(el proxy no es un relé abierto). Anotar aquí el resultado (permitido / prohibido / sin revisar).

**Estado del trabajo (no commiteado):** cambios hechos en el equipo del dueño, sin commit ni push: `src/sources/{epic7,czn,stove}.ts` (nuevos), `src/sources/index.ts` (interruptor `GF_ON`, `withBannerArt`),
`server/proxy.mjs` (fuentes `bannerhistory` y `stove`), `server/bundle/collector.mjs` y `dist/` recompilados (`npm run build:prod`), docs. **Falta**: revisar el diff, `git add -A` (incluye `dist/` y el bundle), commit y push; Botkeep
no compila. Tras el push el flujo de Actions (cada 3 h) y el recolector ya no tocan gachafocus. Ojo: el guard del 70 % del snapshot conserva hasta 12 h una copia vieja si la nueva trae mucho menos; los juegos con complementos
de gachafocus mostrarán los elementos antiguos hasta entonces y luego los perderán.

**Contactos pendientes (los hace el dueño):** gachafocus (API de pago / permiso), STOVE-Smilegate (confirmar el uso de `api.onstove.com/cwms` para Epic Seven y CZN; no se revisaron sus términos y el `robots.txt` de la API dio 503),
bannerhistory.app (waterbeetles.dev@gmail.com; pedir permiso y ofrecer crédito), Yostar (Stella Sora), Reverie y ennead (ver más abajo).

## El incidente: gachafocus nos bloqueó (403 en todas las páginas)

**Qué pasó.** Tras ampliar el uso de gachafocus (de 6 a 11 juegos, 2 páginas por juego) el servidor de Botkeep empezó a recibir
`upstream 403` en todas las rutas. Causas probables (no confirmadas; no hay forma de saberlo desde fuera):

1. **Ráfagas**: cada visitante disparaba hasta 22 peticiones casi simultáneas, y cada fallo hacía **dos** (UA de navegador y UA propio).
2. **Sin caché de errores**: tras un 403 cada visita volvía a pedir, agravando el bloqueo.
3. Tráfico que dependía de los visitantes (cada uno sincronizaba por su cuenta).

Puede ser un límite temporal por tráfico (se levanta solo en minutos u horas) o un filtro por IP/huella (no se levanta). No se
asumió cuál; el sistema está hecho para ser inofensivo en ambos casos.

**Reglas que salen de esto (no las rompas):**

- **Nunca consultes una fuente externa desde el navegador ni "por visita".** Todo va por `/proxy` (que cachea) o por el recolector.
- **No añadas páginas a gachafocus sin necesidad.** Hoy se piden ~12 por ciclo (ver tabla). Cada consulta cuenta ante su protección.
- **No metas reintentos en bucle ni dobles peticiones.** El proxy ya tiene pausa con retroceso (10 → 20 → 40 → 80 min, máx. 2 h)
  tras un 403/429 *por sitio*; un éxito la reinicia. No la acortes sin motivo.
- **Cola por sitio**: gachafocus 1 petición cada 2 s; Prydwen cada 10 s (es el `Crawl-delay` de su robots.txt).
- **Respeta el robots.txt** de cada fuente (gachafocus: solo `/en/<juego>/events|banners`; Prydwen: solo las páginas `/banners`).
- **No intentes saltarte bloqueos** (proxies rotativos, navegadores automatizados, etc.). La salida es contactar con ellos.
- El proxy **no es un relé abierto**: una fuente nueva necesita su entrada en `SOURCES`.

**Decisiones sobre el User-Agent y el cliente HTTP:**

- `GACHAFOCUS_UA` (variable del servidor): si se define, es el User-Agent exacto que se usa con gachafocus, sin alternar. Pensado para cuando gachafocus
  autorice un UA concreto; así se cambia sin tocar código. Sin definir: UA de navegador y, tras un fallo, el identificado.
- Identificación honesta: `WhenGacha/1.0 (+https://github.com/AmadeusMaho/WhenGacha)`. Solo para gachafocus, que rechaza ese UA
  desde algunos hosts (403 con curl desde un PC; con un UA de navegador responde 200), el dueño del proyecto decidió probar primero
  un UA de navegador y, tras un fallo, alternar con el propio. Su robots.txt permite esas rutas.
- **Prydwen rechaza el `fetch` de Node** (undici añade cabeceras que filtra) pero acepta una petición `node:https` simple con el UA
  propio. Por eso el proxy usa `https.request` (`httpsRequest` en `proxy.mjs`) y no `fetch`. Para pruebas: `setTransport()`.

## Qué fuente usa cada juego

| Juego | Fuente principal | Gachafocus |
|---|---|---|
| Genshin, Star Rail, ZZZ | ennead (epoch exacto) + wikis para versiones | no |
| FGO | Atlas Academy (API abierta, epoch exacto) | no |
| Limbus | Eldritch Tools (solo fechas, **hora supuesta** → "≈") | no |
| Wuthering Waves | **Prydwen** (banners, ISO exacto) + **Reverie** (eventos con hora al minuto; API sin documentar, ver abajo) | complemento: eventos (añade desafíos y corrige); si Prydwen falla, también sus banners |
| NTE | **Prydwen** (banners, ISO exacto) + **Game8** (eventos, solo el día; horas habituales del juego, "≈") | complemento: eventos (las hora exactas solo vienen de aquí); si Prydwen falla, también sus banners |
| CZN | **Prydwen** (banners, ISO exacto) | **solo eventos** (imprescindible; la página de Game8 de CZN tiene otro formato y no se ha implementado) |
| NIKKE | Prydwen (inicio exacto; fin = 04:59:59 KST, "≈") + wiki Fandom (eventos) | complemento: eventos y banners |
| Arknights | wiki.gg Cargo: eventos (`EventServerDetails`) y banners (`Banners`), **horas en UTC** | complemento: eventos |
| Arknights: Endfield | wiki.gg Cargo (`Ameu*` ya viene en **UTC**, no UTC‑5) | opcional (`GACHAFOCUS_EXTRAS`) |
| Umamusume | uma.moe (`is_confirmed` decide "≈") | opcional |
| Blue Archive | bluearchive.wiki | complemento: eventos |
| Reverse: 1999 | wiki Fandom (`Events`, `Summons`, horas con "(UTC-5)") | complemento: eventos |
| Stella Sora | wiki comunitaria `stellasora.miraheze.org` (portada: banners con ISO exacto, UTC-7; la wiki no fecha los eventos) | **solo eventos** (imprescindible); si la wiki falla, también sus banners |
| **Epic Seven** | **solo gachafocus** (probado epic7db.com y se quitó: ver abajo) | obligatorio (eventos y banners) |

`GACHAFOCUS_EXTRAS` (variable del servidor): `0` = solo donde es imprescindible; `1` = también para todos los demás; lista de ids
(`nikke,arknights`) = solo esos. Sin definir: Arknights, Blue Archive y Reverse: 1999 (eventos) y NIKKE (eventos y banners).
Cuánto aporta gachafocus (medido): NIKKE 3 → 12 elementos, Blue Archive 4 → 22, Reverse: 1999 10 → 27, Arknights 5 → 10.
**"Tener fuente propia" no es "tener la misma información"**: las wikis no listan los eventos menores (logins, minijuegos…).

## Otras fuentes evaluadas (nov 2026)

- **Game8** (`game8.co/games/<juego>/archives/<id>`): sus banners de WuWa y NTE coinciden con Prydwen y gachafocus. Los eventos traen solo el día y
  alguna fecha de inicio puede estar mal (p. ej. un evento de NTE con inicio distinto al de gachafocus), por eso se marcan "≈". Su robots.txt
  no restringe a bots genéricos. Ya usado para WuWa (453473) y NTE (592073) en `src/sources/game8.ts`. Cubre muchos más juegos (HSR, Genshin, CZN,
  NIKKE…), pero cada página tiene su formato; Epic Seven ya no lo cubre y no encontré lista de eventos de Stella Sora.
- **WuWa Tracker** (`wuwatracker.com/es/timeline`): el calendario se dibuja en el navegador con datos de su API (`/api/*`), que su robots.txt
  **prohíbe** a los bots. Sus repositorios públicos no incluyen los datos del calendario. **No usar.**
- Wikis de Fandom de WuWa/NTE: eventos con día sin hora (WuWa, lista atrasada) o sin fechas (NTE). No sirven.
- **gacha-event-tracker** (`stereotypicalcat.github.io/gacha-event-tracker`, JSON en `data/events.v1.json`): agrega las mismas fuentes que nosotros
  (Game8, wikis) y marca la precisión; para WuWa y NTE usa Game8, o sea solo el día. Sin licencia y de un solo mantenedor: no se usa como dependencia.
  Sirvió para descubrir la wiki de Stella Sora, que sí trae hora exacta en los banners.
- **epic7db.com** (Epic Seven): se implementó (avisos "Update Content" y de eventos) y **se quitó por aportar muy poco** (2 elementos exactos frente a 12 con gachafocus) para unas 13 peticiones a un sitio de fans. Limitaciones medidas: muchos periodos dicen "after the maintenance"
  y el fin real del mantenimiento varía (aviso del 29 oct: 03:00-10:00 UTC; gachafocus: 09:00 UTC), así que se **descartan** en vez de estimarlos; epic7db
  **reutiliza slugs** (un evento nuevo con el mismo título que uno viejo muestra el contenido viejo), por eso se compara la fecha de la página con la de la lista.
  Si se retoma, rehacerlo desde cero. e7leaks.pages.dev: datos de mayo-junio sin actualizar.
- Antes: epic7db.com solo publicaba noticias sueltas con la fecha de publicación; Stella Sora: solo guías de blogs.

### Reverie (eventos de WuWa) y otras fuentes con hora exacta evaluadas

- **Decisión del dueño del proyecto: para las horas se confía en gachafocus.** Cuando responde, sus horas mandan sobre las de cualquier otra fuente
  (`withGachafocus` en `src/sources/index.ts`); las demás fuentes solo aportan lo que gachafocus no tiene o lo que sirve si está bloqueado.
- **Reverie** (`reveriegacha.gg`; API `gachalife-production.up.railway.app/events/wuwa`): eventos curados a mano con hora al minuto. Es una API
  **sin documentar** de un sitio de terceros: pedir permiso/dar crédito (el dueño del proyecto va a contactarles). `src/sources/reverie.ts`.
  Tipos de hora: `server` = hora local de cada servidor (se usa América, UTC-5; coincide con gachafocus en Echo Erase, Chord Cleansing y Beyond the
  Waves); `fixed` = mismo instante para todos, valor en UTC. **Discrepancias vistas frente a gachafocus**: los `fixed` empiezan a las 03:00Z (lanzamiento de
  Asia) y gachafocus-América dice 02:00Z; el cierre de *Cubie Wars* es el 11 nov 05:00Z en Reverie (y "11 nov" en Game8) y el 12 nov 08:59Z en gachafocus.
  Cubre menos eventos que gachafocus (7 vs 13: faltan desafíos recurrentes).
- **Irminsul** (`api.irminsul.gg/v2/<juego>/banner-*.json`): API abierta, solo banners (WuWa, NTE, Endfield, ZZZ, HSR, Genshin, Uma); algunas horas vienen
  sin zona. Posible segunda fuente de banners; no integrada.
- **Ennead Revenue** (`revenue.ennead.cc`): hora por región para 32 juegos (incl. NTE, CZN, Stella Sora, R99…), pero su API (`/api`) exige un token de
  cliente y la página solo trae 20 eventos. **No replicar el acceso por token**: usarlo solo si su autor da acceso (el dueño del proyecto les va a escribir).
- NTEBUILD: solo el día; GameWith: artículos por versión (obsoletos); wuwatracker: su API está vedada por robots.txt.

## Horas: lo aprendido

- Todo se guarda como instante UTC (ISO). La interfaz lo muestra en la zona del navegador (`fmtDateTime`, `ZoneTag`).
- "≈" (`precision: 'approx'|'estimated'`) = hora supuesta. Gachafocus, cuando responde, manda en las horas (`withGachafocus` en
  `src/sources/index.ts`) y quita el "≈" de lo que coincide (mismo tipo, inicio a ≤3 días, nombre parecido).
- Convenciones comprobadas: NIKKE cierra banners a las 04:59:59 KST; Reverse: 1999 cambia a las 05:00 (UTC‑5); Arknights global
  termina a las 10:59:59 UTC (03:59:59 UTC‑7); Umamusume global cambia a las 22:00 UTC.
- No fíes una hora "exacta" sin compararla con otra fuente.

## Despliegue en Botkeep

- Botkeep ejecuta `npm start` **sin compilar ni instalar**: hay que subir `dist/` y `server/bundle/collector.mjs` ya compilados
  (`npm run build:prod`, luego `git add -A`).
- **Botkeep reemplaza los archivos en cada deploy**: `.cache/` (copias del recolector y caché del proxy) se pierde y el servidor
  arranca vacío; el recolector tarda unos 2–3 min en llenarlo (la app usa el camino directo mientras tanto). Si hay una carpeta
  persistente fuera del proyecto, apunta `DATA_DIR` ahí. **Junta los cambios en pocos deploys**: cada uno repite la ráfaga inicial.
- Tras desplegar, mira el log:
  - `[collector] 16 juegos, N copias guardadas` y luego `[collector] <juego>: N elementos`.
  - `[proxy] <host> respondió 403: sin nuevas peticiones durante X min` = bloqueo; esperar. Si tras 24 h todas las pruebas siguen
    en 403, es un bloqueo fijo → escribir a gachafocus/Prydwen (el proyecto es gratuito y sin anuncios; ofrecer crédito visible).
  - `[collector] desactivado…` = falta o falla el bundle; la app sigue funcionando por el camino directo.

## Trampas técnicas

- Las fuentes se escriben para el navegador (`DOMParser`) pero también corren en Node con `linkedom`: **no uses `table.rows` /
  `row.cells`** (linkedom no los tiene; usa `querySelectorAll('tr')` y `children`) ni APIs de layout.
- Cargo (wiki.gg): una cláusula `<>''` en `where` da `db_error`; filtra en código.
- `import.meta.env` en las fuentes: el bundle del servidor las resuelve en compilación; la app sin servidor lee `VITE_*`.
- Al cambiar `src/sources/` o `src/catalog.ts` hay que recompilar el bundle (`npm run build:prod`) y subirlo.

## Pendiente / ideas (no hechas)

- **Copias publicadas desde otra IP (implementado)**: gachafocus bloquea la IP de Botkeep (403 también con UA de navegador) pero no la de otros equipos. `scripts/snapshot.mjs`
  (`npm run snapshot` / `npm run snapshot:publish`) ejecuta el mismo recolector en ese equipo y publica las copias en la rama **`data`** del repositorio (un solo commit forzado,
  sin historial). El servidor las lee cada 20 min de `raw.githubusercontent.com/AmadeusMaho/WhenGacha/data/snapshots/<juego>.json` (`pullRemote` en `server/collector.mjs`; sin
  claves ni despliegues) y adopta la copia si es más reciente o más completa que la suya; el recolector propio, a su vez, no sustituye una copia reciente por otra con menos del 70 %
  de elementos. Quién la ejecuta: (1) el flujo **GitHub Actions** `.github/workflows/snapshots.yml` (cada 3 h; usa el token de la ejecución, sin claves propias; sus IP de datacenter
  podrían estar bloqueadas por gachafocus, y en ese caso el script conserva la copia anterior más completa) y (2) cualquier equipo que ejecute `npm run snapshot:publish`
  (p. ej. el PC del dueño; una tarea programada de Windows con `scripts/run-snapshot.ps1`, que **hay que crear a mano**: un agente no debe crear tareas persistentes sin permiso).
  Las copias remotas solo se adoptan si tienen menos de 48 h (el cliente también rechaza copias de más de 48 h).
- Que el refresco en segundo plano del proxy solo renueve URLs de **datos** (`action=parse|cargoquery`) y no las búsquedas de
  imágenes de las wikis (hoy se renuevan todas las vistas en los últimos 7 días).
- Bajar el ritmo de renovación: gachafocus 1 h → 3 h, Prydwen 2 h → 3 h, ennead 10 → 30 min (el recolector solo los usa cada 3–6 h).
- Mover las búsquedas de imágenes al recolector (hoy las hace el navegador de cada visitante vía `/proxy`).
- Contactar con gachafocus (`/en/contact`) y Prydwen para pedir autorización/uso formal; es la solución de fondo.
- Epic Seven y Stella Sora no tienen otra fuente abierta; eventos menores de NIKKE/Arknights/Blue Archive/R99 solo vienen de gachafocus.
