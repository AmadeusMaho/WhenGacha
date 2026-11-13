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

## Fondos de las skins según la versión (`server/skin-live.mjs`, 10 nov 2026)

No son datos de eventos: es el vídeo/imagen de portada que tiene AHORA la web oficial de cada juego, para el fondo de las skins.
Cada 12 h (el primero, al minuto de arrancar) y **solo desde el servidor** (fuentes `internal` del proxy: `/proxy` las rechaza):

| Juego | Peticiones por ciclo | Qué se guarda (`shrinkText`/`shrink`) |
|---|---|---|
| Genshin | `genshin.hoyoverse.com/en/` (HTML, ~5 KB) + `act.hoyoverse.com/puzzle/hk4e/pz_…/config.<hash>.js` (~550 KB) | la URL del script; las URL de los `.mp4` |
| ZZZ | `zenless.hoyoverse.com/en-us/` (~11 KB) + su `config.<hash>.js` (~900 KB) | ídem |
| WuWa | `hw-media-cdn-mingchao.kurogame.com/…/G152/en/MainMenu.json` (~400 KB) | `pcTopPicture`: `backgroundVideo`, `coverImage` |

- El vídeo elegido es el más reciente (la ruta de HoYoverse lleva la fecha `/AAAA/MM/DD/`). El póster de HoYoverse es la captura que
  ofrece su propio CDN (`?x-oss-process=video/snapshot,…`, la que usa su web).
- **Los vídeos no se descargan**: se hace una petición `HEAD` (una sola vez por vídeo nuevo) para saber su peso; el navegador los
  reproduce desde el CDN oficial solo si pesan ≤ 12 MB (Genshin 4,6 MB y ZZZ 9,3 MB el 10 nov; WuWa 23 MB → se usa su imagen de portada).
- Resultado en `.cache/skin-live.json` y en `GET /data/skin-live.json` (`src/skins/liveFeed.ts` lo pide una vez por visita y lo pone delante
  de los fondos de la skin si no está ya entre ellos: campo `official` en `skins.ts`). Si una web falla, se conserva lo anterior.
- HSR no tiene vídeo en su portada; Umamusume, tampoco. NIKKE ya trae 24 live wallpapers en su página Art.
- Términos: no se revisaron los de HoYoverse ni Kuro para este uso; son 2–3 peticiones cada 12 h a páginas públicas de su web.

## Estado actual: gachafocus DESACTIVADO (6 nov 2026)

La web de gachafocus muestra un aviso que **prohíbe la recolección automatizada** (scraping, navegadores automáticos, uso de sus rutas internas como API, IA) y dice que los datos
solo estarán en su **API oficial de pago** (aún sin abrir; contacto: gachafocus.com.br/en/contact). Por eso:

- **El proxy tampoco lo admite** si no hay `GACHAFOCUS_ENABLED=1` (la entrada `gachafocus` de `SOURCES` depende de esa variable). Motivo (6 nov 2026, prueba local): el refresco en segundo plano
  vuelve a pedir durante 7 días cada URL que recuerda la caché en disco (`.cache/proxy-cache.json`), y la de este PC aún tenía las páginas de gachafocus → 403 de gachafocus con la app apagada.
  Ahora `loadSnapshot` y `refreshDue` descartan las URLs que ya no son de una fuente permitida (`allowed`). En Botkeep no pasaba (cada deploy borra `.cache/`), pero sí en equipos que ejecutan `snapshot:publish`.
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
- **BrownDust2** (`src/sources/bd2.ts`, añadido el 7 nov 2026): avisos oficiales desde la API de su web de noticias (`webapi.browndust2.com/api/notices?locale=en-us`, la que llama
  `api-client.*.js` de browndust2.com; `browndust2.com/robots.txt`: `Allow: /`; no se revisaron sus términos). 1 lista de 50 + hasta ~8 avisos por ciclo, caché de 3 h, 2 s entre peticiones.
  Lee "Events after the X Update" (eventos y misiones de pickup = banners), "Contents Schedule after X Update" (Golden Colosseum, Tower of Salvation), "X Routine Maintenance and Update"
  (horario del mantenimiento y evento de temporada) y "Notice of Live Update". "After the X maintenance" = fin real del mantenimiento (si no hay aviso, X+1 03:00 UTC "≈");
  "before the X maintenance" = su inicio (23:50 UTC por defecto). El JSON antiguo `browndust2.com/api/newsData_en.json` (8 MB) dejó de actualizarse en mayo de 2026: no usarlo.
  **Códigos**: avisos "… Coupon" (mensual y especiales; hasta 3 por ciclo), código + caducidad; la recompensa casi siempre va solo en la imagen, así que se muestra "Until <fecha>".
  **Recompensas**: casi todas van en imágenes (tablas `image.png`); se leen las que vienen en texto ("Draw Ticket x20 + Dia x600") y los regalos con plazo
  ("Claim Period" de compensaciones y directos). **Tiradas**: Draw Ticket = 1; 200 Dia = 1 (dato del dueño, 9 nov 2026).
- **Juegos candidatos revisados el 7 nov 2026 (sin añadir; ninguno tiene fuente completa permitida):**
  - **Girls' Frontline 2 (EN)**: eventos con hora exacta y servidor en iopwiki (`iopwiki.com`, página "GFL2 Events", plantillas `{{EventPeriod|…|server=EN}}`;
    la tabla Cargo `EventPeriods` pierde la zona horaria). robots.txt: Crawl-delay 20, API permitida. **Sin banners de personaje ni códigos** en la wiki.
  - **Infinity Nikki**: códigos con recompensas y caducidad en su Fandom (`Redeem Code`, `{{Code Row|CÓDIGO|Diamond*200;…|alta|caducidad}}`) y eventos
    con hora exacta (`{{Event Infobox|time_start|time_start_offset|…}}`), **pero la wiki va ~6 semanas atrasada** (último evento: 27 sep; la versión del 29 oct sin páginas).
    La web oficial carga las noticias desde `chaos.infoldgames.com` (API propia, no documentada): no se usó.
  - **Love and Deepspace**: Fandom con "Events" sin tocar desde abril de 2026; `loveanddeepspace.wiki.gg` activa pero sin lista de eventos ni códigos.
  - **Persona 5X**: Prydwen tiene la sección (`/persona-5x`) pero sin página de banners; sin wiki con eventos encontrada.
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
| NIKKE | **HECHO** (`nikkegg.ts`: notas de parche oficiales copiadas en nikke.gg; eventos, banners, raids y tiradas) | nada (9/9, mismas horas) | — |
| Arknights | **HECHO** (`akdata.ts`: datos del cliente EN, horas exactas + logins; wiki para lo futuro) | nada de lo que daba gachafocus el 6 nov (login + horas de inicio) | Eventos futuros con "≈" hasta que entren en el cliente |
| Blue Archive | **PARCIAL** (Bucket de la wiki: eventos y raids) | 10 campañas x2/x3 de Global, login de aniversario, 2.º periodo de Tiphareth | Sin fuente permitida: los avisos están en el foro de Nexon (`forum.nexon.com/bluearchive-en`, tablón Events 3218, API `/api/v1/board/3218/threads`), pero los **Términos de Nexon prohíben robots/spiders**; la hoja de ruta (`jarvis-api.nexon.com`) exige token; BlueArchive.gg (DotGG) solo publica spam; la wiki solo registra campañas de JP. Salidas: permiso de Nexon o archivo manual |
| Reverse: 1999 | **HECHO** (`bluepoch.ts`: avisos oficiales de Bluepoch; eventos y banners con imagen propia y tiradas) | nada (12/12; inicio = fin del mantenimiento, gachafocus usaba su inicio) | — |
| WuWa | **HECHO** (`kuro.ts`: notas de parche oficiales de Kuro, horas exactas; imágenes y eventos extra de Reverie; desafíos por ciclo fijo) | Endstate Matrix (Kuro no publica el calendario de sus fases; no se inventa) | Los desafíos Tower of Adversity y Whimpering Wastes se calculan con `wuwaChallenges` (ciclo de 28 días, lunes 04:00 hora del servidor; anclas de gachafocus; solo hasta `validUntil`, revisar cada versión). Sin imagen |
| NTE | **HECHO** (`nevernessgg.ts`: avisos oficiales copiados en neverness.gg, horas exactas; Game8 para imágenes y lo aún no anunciado, "≈") | nada (horas iguales a gachafocus) | — |

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

### Fuentes candidatas evaluadas el 6 nov 2026 (tarde; nada implementado aún)

- **Blue Archive → `bluearchive.wiki`, extensión Bucket (IMPLEMENTADO en `src/sources/mediawiki.ts`, `blueArchiveBucket`: 3 peticiones = `events` + `raids` + un `imageinfo` para las miniaturas; reestreno = `id` 10000+`original_id`; los Joint Firepower Exercise van como `minor`)** (`/w/api.php?action=bucket&query=bucket('<tabla>').select(...).where('server','GL').run()`; tablas en el espacio `Bucket:` (ns 9592):
  `events` (campos `category`, `name_en`, `start_date`, `end_date`, `promo`, `banner`), `raids` (`type`, `name`, `season`, `start_date`, `end_date`, `image`), `world_raids`, `banners`). Fechas ISO con zona.
  `raids` GL da Grand Assault / Final Restriction (Limit Break) / Total Assault **con las mismas horas que gachafocus** (Hod 03→09 nov 19:00Z, Tiphareth 14 oct→9 nov) y banner propio. `events` GL: 4 eventos vigentes (incl. mini-evento SCHALE y Joint Firepower Exercise).
  **No cubre** las campañas x2/x3 de Global (en `Events/Reward campaigns` solo hay entradas `Server = JP`) ni el login de cuenta atrás del aniversario. Misma wiki que ya usamos; ojo, su robots.txt veta `/w/` salvo `action=mobileview` (el uso actual ya hace `action=parse`; decidir/consultar).
- **Stella Sora → `stellasora.miraheze.org`**: cada evento grande tiene página con `{{EventData|image=…|start|end}}` y `{{Countdown|start-time=2026-10-19T13:00-07:00|end-time=…}}`; se listan con
  `generator=embeddedin&geititle=Template:EventData&prop=revisions&rvprop=content` (28 páginas, 1 petición). Cubre los eventos de historia y algunos minijuegos, **no** los 9 eventos que daba gachafocus el 6 nov (aniversario,
  Urgent Bounty, Menace Arena, Cataclysm Survivor…) y sus horas (13:00 UTC-7) **no cuadran** con gachafocus (21:00 UTC-7 = 04:00Z): sin verificar cuál es la buena. Útil como base + archivo manual para el resto.
- **NIKKE oficial (`nikke-en.com`)**: sin `robots.txt` (404); sus Términos (iframe `nikke-en.com/termsofservice/children/en.html`) dicen que "Services" incluye las webs, pero **no tienen cláusula contra bots/scraping**.
  La lista de noticias de la home es HTML (`newsdetail.html?content_id=…`), mayormente avisos técnicos; las notas de parche con eventos parecen estar en blablalink (sin revisar). Las wikis (Fandom) no listan los eventos menores (VOLT TRIP, Trail Marker…).
- **Reverse: 1999**: la wiki Fandom no tiene los eventos menores (Ephaistonos Open, Ducks in the Suitcase…). `re1999.bluepoch.com` no respondió desde aquí; términos sin revisar.
- **Arknights Global** es de Yostar (mismos términos que Stella Sora: prohíben robots) → la web oficial no es opción.
  La wiki (Cargo `EventServerDetails`, `server='global'`) da bien el **fin** (10:59:59 UTC) pero el **inicio** es un valor fijo (17:00 UTC) que no es real: los datos del cliente dan 15:00 para The Masses' Travels Rerun y 11:00 para el login.
  Gachafocus (copia en la caché local del 6 nov) solo añadía el login "To Look Back on Terra" (8 oct 11:00 → 16 nov 10:59:59 UTC) y esas horas de inicio.
  Datos del cliente EN: `Kengxxiao/ArknightsGameData_YoStar` está **archivado** (nov 2025); `ArknightsAssets/ArknightsGamedata` (Actions con arkprts, actualizado el 5 nov 2026, sin licencia) tiene `en/gamedata/excel/activity_table.json`
  (`basicInfo`: nombre, tipo, `startTime`/`endTime` en epoch exacto, incluye logins) pero pesa **18 MB**, solo trae lo que ya está en el cliente (no eventos futuros) y son datos extraídos del juego (zona gris con los Términos de Yostar). **El dueño decidió usarlo (6 nov 2026) → IMPLEMENTADO en `src/sources/akdata.ts`** (`withClientData`, llamado desde `syncArknights`):
  el proxy (fuente `akgamedata`, caché 6 h) admite hasta 48 MB para esa ruta y guarda solo el calendario (`shrink`: `basicInfo` de activity_table y periodos de `gacha_table`), unos KB; recolector y navegadores reciben eso.
  Los eventos de la wiki que coinciden (nombre + inicio a ≤3 días) toman las horas exactas y `official: true`; los que la wiki no tiene (logins) se añaden; los banners de la wiki se corrigen con el reclutamiento no estándar del mismo periodo.
  Los eventos futuros (aún no en el cliente) siguen con "≈" e inicio 17:00 de la wiki.
  **Banners Standard y Kernel** (la wiki dejó de registrarlos para Global en 2020): de `gacha_table` (`DOUBLE` y `CLASSIC_DOUBLE`), con los operadores del Kernel (`dynMeta`) traducidos con
  `character_table.json` (~20 MB, que el proxy recorta a "id → nombre", ~13 KB). Imágenes: si la tabla no trae, se prueban `EN <evento> [Rerun] banner.png` y `CN <evento> banner.png`.
- **WuWa (Kuro) → IMPLEMENTADO (`src/sources/kuro.ts`)**. Términos (`sdk-global.kurogames.com/pro/agreement/common/language_en/terms_of_service`, leídos en navegador): cubren las webs, **sin cláusula contra bots/scraping**;
  `wutheringwaves.kurogames.com/robots.txt` = `User-agent: *` sin `Disallow`; el CDN no tiene robots.txt. La web lee JSON estáticos: `hw-media-cdn-mingchao.kurogame.com/akiwebsite/website2.0/json/G152/en/ArticleMenu.json` (lista, ~26 KB)
  y `.../article/<id>.json`. 2 peticiones por ciclo (lista + la "Patch Notes for Wuthering Waves Version X.Y" más reciente; caché 3 h, pausa 3 s). Cada evento: `[Nombre] Tipo` + `✦Duration: … (server time)`; server time = América (UTC-5);
  "Version X.Y Update" = fin del mantenimiento del mismo aviso (UTC+8). Los eventos web (UTC+8) van como `minor`. Los avisos "Upcoming Events…" y "Event Preview" son solo imágenes. Medido el 6 nov: 7 eventos oficiales, todos
  emparejados con su imagen de Reverie, + Chord Cleansing (solo Reverie). Discrepancia: Cubie Wars cierra el 11 nov 11:59 hora del servidor (16:59Z) según Kuro; Reverie decía 05:00Z y gachafocus 12 nov 08:59Z.
- **NTE (Perfect World) → la web oficial NO es opción**: sus Términos prohíben "any robot, spider, crawler or other automatic device … that … scrapes" los Productos o Servicios. Sin robots.txt. Solo con permiso escrito.
- Descartados: **SchaleDB** (repositorio archivado desde mar 2025, `schale.gg` en mantenimiento); Game8 no tiene listas de eventos de Stella Sora, NIKKE, BA, R:1999 ni Arknights en inglés.

### Fechas de las versiones (parches) — corregido el 6 nov 2026

La wiki da solo el día de cada versión (00:00 UTC), que en América cae la víspera: la marca de la v3.8 de WuWa salía el 10/11 nov (GMT-3), antes de que acabaran
los banners de la 3.7. `alignPatches` (`src/sources/versions.ts`, aplicado en `syncSource`):
1. Si un banner empieza entre 1 día antes y 2 después de la fecha de la wiki, la versión toma su hora (WuWa 3.8 → 12 nov 03:00 UTC) y deja de ser estimada.
2. Si no, un día sin hora pasa a la hora habitual de lanzamiento (`LAUNCH_UTC_HOUR` en index.ts: 03:00 UTC = 11:00 UTC+8; Endfield 04:00).
3. Una versión estimada no empieza antes de que acaben los banners ya empezados (Endfield 1.7: 24 → 26 nov) ni antes del 80 % del ciclo típico
   (Genshin 7.3 salía el 24 nov, fin de la 1.ª fase de banners; ahora 15 dic).
4. Cada versión termina cuando empieza la siguiente.

### Juegos añadidos el 6 nov 2026 y comparación de cobertura

- **Punishing: Gray Raven** (`syncPgr` en `kuro.ts`): mismo sistema que WuWa en otro CDN (`media-cdn-zspms.kurogame.net/pnswebsite/website2.0/json/G167/`), sin robots.txt, Términos de Kuro.
  Lee el último "VERSION "…" UPDATE NOTE": banners (Omniframe, arma, CUB, "[Expedition Supply] Research"), eventos y tiradas (250 Black Card o 250 R&D Tickets por
  investigación, según sus notas). Se omiten los paquetes de revestimientos. Imágenes: la wiki de Fandom aún no tiene las de esta versión.
- **Honkai Impact 3rd** (`honkai3.ts`): eventos desde `honkaiimpact3.fandom.com` (robots.txt permite /api.php): `Category:Events` por fecha + `{{Event Entry|start|end|version}}`.
  Hora del servidor sin zona → UTC+8 y "≈". ennead solo tiene sus códigos; la wiki dejó de registrar los gachapones (Supply) en 2019 → banners solo vía Discord.
- **Azur Lane**: solo vía Discord (su web es de Yostar y su wiki azurlane.koumakan.jp pone una barrera anti-bots Anubis: no se usa). Sin canal configurado, vacío.
- **Comparación con gacha-event-tracker** (agregador público, JSON en GitHub Pages; solo para comparar): sin huecos en NTE, R:1999, Arknights, Blue Archive, Stella Sora.
  **Genshin, HSR y ZZZ → RESUELTO** (`hoyowiki.ts`): la plantilla `{{Event List|hidepast=1}}` de sus wikis de Fandom, renderizada con `action=parse`, da cada evento con su periodo exacto
  (`data-sort-value`, hora del servidor de Asia, UTC+8), imagen y tipos; `officialFirst(wiki, ennead)`: **la wiki manda en las horas** (decisión del dueño, 6 nov 2026: ennead daba el inicio a las 07:00 UTC+8, en pleno mantenimiento, y cierres redondos; la wiki da 11:00 UTC+8 tras la actualización y el cierre real 03:59 UTC+8) y ennead aporta recompensas, tiradas, banners, desafíos y lo que la wiki no tenga. Además, ennead lista algunos eventos sin fechas (0 → 0), que antes se descartaban. Tras el cambio:
  Genshin 7 → 20 elementos, HSR 20 → 22, ZZZ 11 → 19, y 0 huecos frente a gacha-event-tracker (salvo 2 indefinidos de HSR). `officialFirst` también empareja por mismo periodo y
  nombre casi igual (≥70 % de palabras; "Unjust Judgement" / "Judgment").
  Huecos que quedaban antes: **HI3** (banners y ventas, de arustats), **PGR** (desafíos recurrentes: War Zone, Phantom Pain Cage,
  Norman Revival Plan…), **ZZZ** (5 menores de Game8), **WuWa** (Moonlit Path y eventos permanentes), **Uma** (4 scouts garantizados), **FGO** (4 campañas). No tenemos Infinity Nikki,
  P5X ni GFL2.

### Recompensas e iconos (6 nov 2026, noche)

- **Recompensas de los eventos de la wiki (Genshin, HSR, ZZZ)**: `eventRewards` en `hoyowiki.ts` lee `{{Event Rewards |Primogem = 60}}` de la página de cada evento (todas en una consulta)
  y calcula las tiradas con las equivalencias de HoYoverse (`pulls.ts`: 160 de la moneda premium = 1, billetes = 1). Ej.: Encounter: Interlude of the Long Journey 60 Primogems.
- Un evento sin recompensas listadas ya no dice "Sin tiradas" (`verdict` en `logic.ts`): queda sin veredicto.
- NIKKE: "Selective Recruitment (Exclusive) Vouchers" cuentan como tirada (aniversario: 10 → 20).
- ennead puede repetir una recompensa (dos fases): `itemsOf` las suma en una línea.
- **Iconos de las recompensas** (`withItemIcons` en `collector.ts`, solo servidor): el archivo del objeto en la wiki del juego probando "Item X.png", "X.png", "X Icon.png", "Icon X.png",
  también en singular y sin "Exclusive" (NIKKE). Medido: Genshin 39/39, ZZZ 13/13, HSR 23/24, WuWa, R:1999, NIKKE y PGR completos.
- WuWa: las recompensas de la mayoría de eventos solo están en la infografía de Kuro ("Upcoming Events…", imagen; p. ej. Echo Erase 400 Astrite). El dueño decidió no usar OCR.

### Avisos oficiales en otros sitios y tiradas (6 nov 2026, noche)

- **Reverse: 1999 → `src/sources/bluepoch.ts`** (fuente `bluepoch` del proxy). La portada `re1999.bluepoch.com/en/home` carga los avisos con
  `POST /activity/official/websites/information/query` `{gameId: 60001, current, pageSize}` (la lista ya trae el HTML). El proxy admite `post: true` en una fuente: la URL con parámetros
  es la clave de caché y se envía como POST con esos parámetros en JSON. Se leen los "Ver. X.Y … Preview" (un bloque por evento: imagen, nombre, subtítulo, `[Duration]: … (UTC-5)`)
  y los "Version Update Maintenance Notice" (hora real de "After the version update"). Banners con sus personajes (RATE UP). Se omiten trajes y paquetes de pago. Se combina con la wiki
  (`officialFirst`: manda la oficial; la wiki añade lo que falte).
- **NIKKE → `src/sources/nikkegg.ts`**: nikke.gg (DotGG) copia íntegro el aviso oficial ("Major Updates:") en su API de WordPress (`/wp-json/wp/v2/posts?categories=1`). Secciones numeradas
  ("5.7 Trail Marker Event") + `* Event duration: From … to … (UTC+9)`. "Special Recruit" → banner; "Pilgrim Selective Recruitment" → un banner con los tres; Union/Solo Raid y Coordinated Operation → desafíos.
  La web oficial (nikke-en.com) solo publica avisos técnicos y blablalink/playerinfinite usa una API firmada (v2): no se replica la firma.
- **NTE → `src/sources/nevernessgg.ts`**: neverness.gg (DotGG) copia los avisos de Perfect World ("Source: Perfect World"). Última "Patch Notes" + avisos de mantenimiento posteriores
  (actualizaciones a mitad de versión, p. ej. Gold Clash). `● "Nombre" Tipo` + `Duration: … (UTC+8 | server time)`; server time = América (UTC-5). Los banners siguen de Prydwen.
  Desde la nota de la 1.5 (9 nov 2026) el formato cambió: meses abreviados ("Nov 11"), "Maintenance Period" y "Event Duration", y algún evento bajo un
  apartado numerado (`5. New Mystery Box Event "…"`); con el formato viejo el lector no sacaba nada y solo quedaba Game8, sin recompensas.
  Recompensas: las "Nombre xN" cuentan tiradas; las monedas y materiales que el aviso nombra sin cifra (Annulith, Solid/Fabricated Dice, Fons…)
  se listan sin cantidad (`NAMED`). Se ignoran lo de pago ("Purchase …"), lo que se gasta (Fons/Annulith de las cajas) y las notas "※".
  Ojo: Perfect World prohíbe el scraping de *sus* servicios; neverness.gg es un tercero cuyos robots.txt y Términos (DotGG) lo permiten. Si se prefiere no depender de una copia, quedaría Game8 ("≈").
- DotGG (nikke.gg, neverness.gg): robots.txt `User-agent: *` sin `Disallow` salvo su buscador `?s=` (no se usa: se filtra por categoría); Términos (`/terms`) sin cláusula contra el acceso automatizado.
  Proxy: fuente `nikkegg` (solo `/wp-json/wp/v2/posts[/id]` con `categories`, `per_page`, `_fields`), pausa 5 s, caché 3 h.
- **WuWa, Pioneer Podcast**: del fin del mantenimiento de la versión al inicio del de la siguiente (su "Update Maintenance Notice"; si aún no existe, el día del "Version Preview … Scheduled for
  Release on …" a las 04:00 UTC+8, "≈").
- `officialFirst` también empareja por mismo nombre + mismo fin (±1 día) aunque la comunidad dé otro inicio (Game8 ponía Blackbird's Invitation el 8 oct).
- **Tiradas (`src/sources/pulls.ts`)**: `pullsIn(juego, líneas)` suma las recompensas del bloque de cada evento en los avisos oficiales ("Radiant Tide x5", "Clear Drop x400", "10 Advanced Recruit
  Vouchers"): WuWa 160 Astrite = 1 y Radiant/Forging/Lustrous Tide = 1; R:1999 180 Clear Drop = 1 y Unilog = 1; NIKKE 300 Gems = 1 y Advanced Recruit Voucher = 1. Se ignoran compensaciones y precios.
  `segments` reparte el texto: de su título al siguiente; las cabeceras sin evento (p. ej. "Sign-in Event" con partes I y II) se suman al evento siguiente. Si el aviso no da recompensas, queda 0
  (sin veredicto; `detailsPulls` sigue limitado a HoYoverse). Medido: Gifts of Singing Drizzle 10, login de R:1999 14, A Glimpse of the Legend 2,2, 4th Anniversary (NIKKE) 10.

### Qué usa gachafocus para lo que nos falta (analizado el 6 nov 2026 con su HTML ya guardado en la caché local, sin pedirle nada)

Su web dice "Source: Collected automatically, checked hourly" y enlaza la fuente de cada elemento:
- **Blue Archive**: los hilos del foro de Nexon Global (`forum.nexon.com/bluearchive/board_view?board=3218&thread=3572532` "November Rewards Campaign", `thread=3572008` login de aniversario). Los Términos
  de Nexon prohíben robots/spiders, así que no lo replicamos.
- **Stella Sora, Limbus, R:1999, códigos…**: enlaces a **su propio servidor de Discord** (`discord.com/channels/1459254954232647680/…`). Usan la función "Seguir" de los canales de anuncios de Discord: cada
  servidor oficial publica en su canal de anuncios y Discord copia el mensaje en el canal de gachafocus, donde un bot lo lee.
- **Vía equivalente para nosotros: IMPLEMENTADA, a la espera de configurarla** (`src/sources/discord.ts`; guía en **`docs/discord-bot.md`**). Lo que sigue es el plan original: crear un servidor de Discord propio, "Seguir" los canales de anuncios oficiales de Stella Sora y Blue Archive Global, crear un bot
  (aplicación de Discord) con el permiso de leer mensajes en ese servidor y guardar su token en una variable del servidor (`DISCORD_TOKEN`, nunca en el repositorio). El recolector leería
  `GET https://discord.com/api/v10/channels/<id>/messages` con `Authorization: Bot <token>` (solo en el servidor; el proxy tendría que añadir la cabecera y no exponer el token). Antes: confirmar
  que los canales oficiales permiten "Seguir" y revisar los Términos para desarrolladores de Discord (un bot en tu propio servidor leyendo tus canales está permitido). Los mensajes tienen formato de
  aviso oficial ("Period: Oct. 19, 2026 after maintenance – Nov. 09, 2026 19:59 (UTC-7)"), así que el parser sería como los de Kuro/Bluepoch.

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
| Wuthering Waves | **Prydwen** (banners, ISO exacto) + **notas de parche oficiales de Kuro** (`kuro.ts`, eventos con hora exacta; manda en horas) + **Reverie** (imágenes de esos eventos y los que Kuro no lista; `officialFirst` en index.ts) | complemento: eventos (añade desafíos y corrige); si Prydwen falla, también sus banners |
| NTE | **Prydwen** (banners, ISO exacto) + **Game8** (eventos, solo el día; horas habituales del juego, "≈"; imagen de cada evento desde `data-src`) | complemento: eventos (las hora exactas solo vienen de aquí); si Prydwen falla, también sus banners |
| CZN | **Prydwen** (banners, ISO exacto) | **solo eventos** (imprescindible; la página de Game8 de CZN tiene otro formato y no se ha implementado) |
| NIKKE | Prydwen (inicio exacto; fin = 04:59:59 KST, "≈") + wiki Fandom (eventos) | complemento: eventos y banners |
| Arknights | wiki.gg Cargo: eventos (`EventServerDetails`) y banners (`Banners`), **horas en UTC** | complemento: eventos |
| Arknights: Endfield | wiki.gg Cargo (`Ameu*` ya viene en **UTC**, no UTC‑5) | opcional (`GACHAFOCUS_EXTRAS`) |
| Umamusume | uma.moe (`is_confirmed` decide "≈") + **umapyoi.net** `/api/v1/character/list` (retrato oficial de cada destacado por nombre; 1 petición, caché 24 h; robots.txt `Allow: /`) | opcional |
| Blue Archive | bluearchive.wiki: banners (`action=parse`) + **Bucket** `events` y `raids` (eventos, ejercicios conjuntos, Total/Grand Assault, Final Restriction; hora exacta). Si Bucket falla, tabla HTML de `Events`. Avisos del #game-news oficial vía Discord (canal propio desde el 6 nov 2026; "Event Period: Now through …" empieza a la hora del mensaje). **Códigos**: el aviso los trae solo en la imagen, así que van a mano en `BA_CODES` (`mediawiki.ts`), que caducan solos | complemento: eventos (apagado) |
| Reverse: 1999 | wiki Fandom (`Events`, `Summons`, horas con "(UTC-5)") | complemento: eventos |
| Stella Sora | **PENDIENTE** | 8 eventos del aniversario (banners sí, wiki) | Sin fuente permitida: web de Yostar (Términos prohíben robots); la wiki solo tiene los eventos grandes (`EventData`, sin los del aniversario) y sus páginas de versión llegan a la 1.6; no hay sitio DotGG. Salidas: permiso de Yostar o archivo manual |
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

- **Decisión del dueño del proyecto (actualizada el 6 nov 2026): las fuentes oficiales mandan sobre gachafocus.** Los eventos de avisos oficiales llevan `official: true`
  (Kuro, STOVE: `kuro.ts`, `epic7.ts`, `czn.ts`) y `withGachafocus` no les cambia la hora salvo que vengan marcados "≈". Para wikis y agregadores, gachafocus (si se reactiva con su API) sigue corrigiendo horas.
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
  de elementos **vigentes o futuros** (`alive`; desde el 12 nov 2026 los ya terminados no cuentan, ni aquí ni al adoptar: en un cambio de versión la copia nueva
  pierde de golpe los de la anterior y se rechazaba hasta 12 h). Quién la ejecuta: (1) el flujo **GitHub Actions** `.github/workflows/snapshots.yml` (cada 3 h; usa el token de la ejecución, sin claves propias; sus IP de datacenter
  podrían estar bloqueadas por gachafocus, y en ese caso el script conserva la copia anterior más completa) y (2) cualquier equipo que ejecute `npm run snapshot:publish`
  (p. ej. el PC del dueño; una tarea programada de Windows con `scripts/run-snapshot.ps1`, que **hay que crear a mano**: un agente no debe crear tareas persistentes sin permiso). Comandos para crearla, ocultarla, ejecutarla y revisarla: `docs/tarea-copias-pc.md`.
  Las copias remotas solo se adoptan si tienen menos de 48 h (el cliente también rechaza copias de más de 48 h).
- Que el refresco en segundo plano del proxy solo renueve URLs de **datos** (`action=parse|cargoquery`) y no las búsquedas de
  imágenes de las wikis (hoy se renuevan todas las vistas en los últimos 7 días).
- Bajar el ritmo de renovación: gachafocus 1 h → 3 h, Prydwen 2 h → 3 h, ennead 10 → 30 min (el recolector solo los usa cada 3–6 h).
- **Imágenes en el recolector (HECHO, 6 nov 2026)**: `withWikiImages` en `src/collector.ts` ilustra lo que la fuente no ilustra (eventos y desafíos; banners solo si no tienen personajes):
  1) archivo `<título>.png` o imagen del artículo con ese título exacto (una consulta), 2) búsqueda en la wiki del juego, aceptada solo si el artículo comparte alguna palabra (≥4 letras) con el título
  (antes la búsqueda del navegador ponía cruces como "Hedone/Gallery" o la página genérica "Events"). Máx. 15 títulos por juego y ciclo, en serie; el proxy los guarda 12 h. La búsqueda del navegador (`images.ts`) sigue
  para el camino sin servidor. Medido el 6 nov: Arknights, WuWa, Blue Archive y NTE sin huecos; R:1999 6 y Endfield 2 sin imagen en su wiki (la app pone el fondo del juego).
- Contactar con gachafocus (`/en/contact`) y Prydwen para pedir autorización/uso formal; es la solución de fondo.
- Epic Seven y Stella Sora no tienen otra fuente abierta; eventos menores de NIKKE/Arknights/Blue Archive/R99 solo vienen de gachafocus.

## Rotatorios (desafíos) por juego — revisado el 7 nov 2026

| Juego | Rotatorios | Fuente | Recompensas |
|---|---|---|---|
| Genshin / HSR | Abyss, Theater, Stygian / MoC, PF, AS… | ennead + wiki | ennead |
| ZZZ | Shiyu Defense, Deadly Assault (+ Annihilation Simulacrum) | wiki + ennead | total por ciclo de la wiki (`challenges.ts`, tabla "Total Rewards") |
| WuWa | Tower of Adversity, Whimpering Wastes, Endstate Matrix | ciclo fijo de 28 días / fases = versiones (`kuro.ts`) | wiki: solo lo que se reinicia (Hazard Zone, Respawning Waters) y total del ciclo de la Matrix |
| NIKKE | Union Raid, Solo Raid, Coordinated Operation | notas oficiales (nikke.gg) | según ranking: descripción sin cifras |
| Arknights | Annihilation (una barra por semana: el tope de 1800 Orundum se reinicia los lunes a las 11:00 UTC; el mapa rota cada ~3 meses), Contingency Contract | datos del cliente (`campaign_table`, `stage_table`) | 1800 por semana + Orundum de primera vez del mapa en su primera semana |
| Blue Archive | Total/Grand Assault, Final Restriction Release, Joint Firing Drill | bucket `raids`/`events` de bluearchive.wiki | según rango: descripción |
| HI3 | Memorial Arena | ciclo fijo documentado (martes 04:00 – lunes 02:00, UTC+8) en `cycles.ts` | según grupo: descripción |
| R:1999 | Limbo | ciclo fijo documentado (días 1 y 16, 05:00 UTC+8) en `cycles.ts` | descripción |
| CZN | Full-Scale Offensive, Virtual Tactical Simulation (+ Spiral Tower si aparece) | avisos de STOVE (VTS) + lista de Game8 (`game8Recurring`, sección "List of Current Events"; su "Permanent Events" agrupa los modos recurrentes) | lista de recompensas de Game8, sin cifras |
| NTE | Hunter's Crucible | eventos (Game8/neverness), reclasificado | descripción |
| Endfield, Uma, Limbus, BD2 | propios de cada fuente | — | — |

**Sin rotatorios por falta de fuente fiable:** PGR (la página "War Zone" de la wiki es de 2023), HI3 Abyss (horario no documentado),
Epic Seven (STOVE solo publica el resumen al acabar cada temporada de World Arena; Game8 no tiene lista de eventos de E7) y Stella Sora (sin información). PGR y HI3 no están en Game8. FGO no tiene.

## AFK Journey (añadido el 7 nov 2026) y candidatos descartados

- **AFK Journey** (`src/sources/afkjourney.ts`): wiki de Fandom `afk-journey.fandom.com`, al día. Eventos de "Category:Events" (`{{Event Infobox |time_start |time_end |group}}`)
  con recompensas sumadas de sus `Card List`/`Item List` (sin tarjetas de enemigo ni "Event Points"); las ediciones con fecha de modos de Guild/Strategy
  ("Horn Rally/2026-11-02", "Treasure Rush/…") son rotatorios. Banners: subpáginas "Rate Up Recruitment/<fecha>" (`{{Rate Up Info |hero |time_start |time_end}}`).
  Horas en UTC (documentación de sus plantillas). Arte de banners: imagen de la página o "Recruitment Rate Up <héroe>.png" (los Rate Up Return reutilizan la del original). Tiradas: Invite Letter = 1, 300 Diamonds = 1. **Sin códigos**: la página "Redemption Code"
  está marcada para rehacer y su lista de activos es de 2024. 3 consultas por ciclo.
- **Descartados (7 nov 2026)**: Solo Leveling: Arise (su Fandom dejó de registrar eventos en primavera de 2026), Duet Night Abyss, Ananta, Honkai: Nexus Anima y
  Snowbreak (wikis sin actividad desde jul–sep), Etheria Restart y Silver and Blood (sin wiki en Fandom); Prydwen solo tiene página de banners de WuWa, NTE, CZN y NIKKE.

## Infinity Nikki (añadido el 7 nov 2026)

- **Wiki** (`src/sources/infinitynikki.ts`, `infinity-nikki.fandom.com`): eventos de "Category:Events" (`{{Event Infobox}}` con hora y zona, UTC-7) con recompensas
  de sus `Card List`; banners de "Category:Resonances by Date Descending" (`{{Resonance Infobox}}`); códigos de "Redeem Code" (`{{Code Row}}`, solo no caducados).
  La wiki tarda en registrar la 2.ª fase de cada versión y los banners (el 7 nov el último banner registrado era del 23 sep).
- **Discord** (`infinitynikki:1568519866464600217` en `DISCORD_CHANNELS`): sigue `#game-news` y `#redeem-codes` del Discord oficial. Sus anuncios mandan sobre la wiki
  (`officialFirst`) y cubren lo que esta no tiene; `discord.ts` ahora también extrae **códigos** ("Redemption Code: …", o el código solo en una línea) con sus
  recompensas y caducidad, y reconoce "Resonance" como banner. Discord no copia mensajes antiguos: solo llega lo publicado desde el 7 nov.
- Tiradas: Revelation Crystal = 1; 120 Diamonds = 1 (precio en tienda). La web oficial firma sus peticiones (`chaos.infoldgames.com`): no se usa. Game8 abandonó el juego en 2025.

## Duet Night Abyss (añadido el 12 nov 2026)

Se había descartado el 7 nov porque su Fandom (`duetnightabyss.fandom.com`) dejó de actualizarse en marzo de 2026; ahora va con Game8 + Discord (`src/sources/dna.ts`).
- **Game8** (3 páginas por ciclo, caché de 6 h; añadidas a la lista del proxy): eventos de "List of All Events and Schedule" (`archives/559948`, tablas de vigentes
  y próximos; solo el día → horas del servidor y "≈"), banners Myriad limitados de "Banners" (`archives/554952`; el fin, si no lo dice, es el del otro banner que
  empezó el mismo día) y códigos de "Redeem Codes" (`archives/557781`, `syncGame8Codes`). La versión (p. ej. 1.7) sale de la frase del banner.
- **Servidor**: Asia (UTC+8), Europa (UTC+1) y América (UTC-5) cambian a la misma hora local (inicio 10:00, fin 05:00). La app usa **América (UTC-5)**,
  en Game8 y en Discord (`pickRegion` deja solo la línea de América de los avisos con un periodo por región; `SERVER_ZONE` para "(server time)" en los tuits).
- **Discord** (`dna:1570290121004294244` en `DISCORD_CHANNELS`): anuncios oficiales y tuits reenviados de @DNAbyss_EN. Mandan sobre Game8 (`officialFirst`).
  El lector entiende ahora los rótulos entre corchetes ("◈ [Event Duration]"), la línea del autor de un tuit, y las recompensas "◈ [Rewards]" +
  "[Pristine Hourglass], [Coin]" (sin cantidad: salen en la ficha sin cifra y sin tiradas).
- **Desafío**: Immersive Theatre, ciclo de 28 días desde el 20 oct 2026 (Game8 y allthings.how), calculado (`dnaTheatre`).
- **Tiradas**: solo hay gacha de cosméticos (Myriad); personajes y armas se consiguen con Secret Letters, no con tiradas. 1 Hourglass (Prismatic = limitado,
  Pristine = permanente) por tirada; 160 Phoxene / Phoxene Plumule = 1 Hourglass; pity 90 (Game8, "Myriad Gacha Currency").
- **Calculadora**: sin ingresos diarios fijos (el Phoxene llega de eventos, códigos y Trial Rank, sin tabla fiable); pase mensual 90 Plumule/día (allthings.how).
- **Recompensas con cantidades**: Game8 solo da un resumen por evento (abrir cada página costaría ~15 consultas por ciclo); las cantidades llegan por Discord.

## Trickcal: Chibi Go (añadido el 12 nov 2026)

Versión global (Epid Games / Bilibili), **un solo servidor en UTC+9**: no tiene selector de servidor. Fuente: `src/sources/trickcal.ts`.
- **lootandwaifus** (2 páginas por ciclo, caché de 1 h, 3 s entre peticiones; añadidas a la lista del proxy):
  - Banners: "Banner history" (`/trickcal-chibi-go-banner-history/`, lista GLOBAL, mismo HTML que la de NIKKE). Un banner por Apóstol, con retrato, rol,
    personalidad, posición y las insignias ELDYNE / RE-RUN. Las fechas son días UTC: el aviso oficial "2026/11/12 04:00 - 2026/11/19 10:59 (UTC+9)" sale como
    "Nov 11 - Nov 19". Inicio 19:00 UTC y fin 01:59 UTC, marcados "≈" hasta que llega el aviso oficial.
  - Códigos: "free codes" (`/guides/trickcal-revive-codes/`, tabla "Active codes"; se quitan las fichas emergentes de cada objeto).
- **Discord** (`trickcal:1570298824088363058` en `DISCORD_CHANNELS`): tuits oficiales de @trickcal_en reenviados por Readybot. Son la **única fuente de
  eventos** y la de las horas exactas (mandan sobre lootandwaifus con `officialFirst`; el banner conserva el retrato de lootandwaifus si los nombres coinciden).
  Cambios en el lector, probados con los tuits de Vivi/Rohne y Dreamland: se quita el autor del tuit ("Trickcal:Chibi Go" + "@trickcal_en", y el título
  "**… (@trickcal_en) on X**"), los emojis delante de la línea ("💜The Dreamland event…" → "Dreamland") y "★3 Vivi,★3 Rohne Limited-Time Rate Up" da un banner
  por Apóstol. Comparado con los mensajes reales de los otros 9 canales: mismo resultado que antes.
- **Sin fuente**: lista de eventos en la web (lootandwaifus no la tiene, Prydwen rechaza el `fetch`, Fandom abandonada), rotatorios con calendario fijo (PvP y
  Yggdrasil Dig Site no publican su ciclo) e ingresos diarios de Crystal Leaf o pase mensual (ninguna guía da cifras).
- **Tiradas**: 100 Crystal Leaf por reclutamiento, 1000 el x10 (Prydwen; lootandwaifus: "500 gems (5 singles)"); Recruitment Ticket = 1. Sin pity:
  Devotion canjea el Apóstol a las 200 tiradas (300 si es Eldyne). Los Card Ticket (gacha de cartas) no cuentan.

## Girls' Frontline 2, Monster Hunter Outlanders y BLEACH: Soul Resonance (añadidos el 12 nov 2026)

Pensados para tener **varias fuentes** cada uno: la web de la comunidad da la base y los anuncios oficiales por Discord (canales `gfl2`, `mho`, `bleach`, que el dueño
añade a `DISCORD_CHANNELS`) mandan en nombres y horas (`officialFirst`). Fuentes nuevas en la lista del proxy: `iopwiki.com/api.php` (dentro de `wiki`, 2 s entre peticiones),
`gamewith` (4 páginas, 6 h, 3 s) y `gameguide` (1 página, 6 h, 3 s); Game8 suma la página de códigos de MHO.

**Girls' Frontline 2: Exilium** (`src/sources/gfl2.ts`; servidor global, horas UTC-4). IOP Wiki, 3 consultas por ciclo:
- Eventos: "GFL2 Events", plantillas `{{EventPeriod|…|server=EN}}` con inicio y fin **exactos**; imagen de cada sección. Recompensas: tabla "Event Shop" de la página de
  cada evento (Collapse Piece, Access Permission y Targeted Access Permission; una sola consulta `prop=revisions` para todas). Concurso de popularidad: menor.
- Banners: "GFL2 Banners", sección EN por años. Primera muñeca = la limitada (nueva si la wiki la enlaza; si no, "Rerun"), con su arma limitada como etiqueta; las otras dos, SR.
  El retrato sale de la wiki (página de la muñeca; para las reposiciones, la del enlace de su primer banner, o "<nombre> (GFL2)").
- **Sin fuente**: códigos (la wiki no los lista; los agregadores se contradicen) → solo por Discord. Rotatorios (Gunsmoke Frontline, Expansion Drills, Military
  Simulation): la wiki da recompensas pero no fechas, no salen en la línea de tiempo.
- Tiradas: 150 Collapse Piece; Targeted Access Permission = 1 (Access Permission es del permanente: se lista, no cuenta). Calculadora con "Monthly currency income"
  de la wiki: diarias 110, semanales 345, 175 al mes y Military Simulation 300; sin Gunsmoke ni Expansion Drills (sin fechas de reinicio). Pity 80.

**Monster Hunter Outlanders** (`src/sources/mho.ts`; versión global de Level Infinite, NA/JP/EU; la de Garena no se cubre). GameWith (gamewith.ai, en inglés, actualizado a diario):
- Eventos ("Event List") con imagen y recompensas de sus tablas ("Rutacoin ×750", "Day 3 | Featured Contract ×2"); los permanentes no salen.
- Banners ("Current Banners"): destacado y rotatorio con su adventurer; el de principiante y el permanente no caducan y no salen.
- Rotatorios: la temporada ("Season Guide", con su jefe) y Monster Challenge (Master), fases de 2 semanas desde el 3 nov 2026.
- Códigos: "Redeem Codes" de GameWith (con la nota "Global only") + Game8 (archives/634765), sin repetir.
- Horas: solo días "(server time)". Se supone el reinicio de las 05:00 en UTC+8 (la zona en que GameWith da sus horarios) y todo va "≈" hasta que lleguen los avisos por Discord.
- Tiradas: 150 Rutacoin; Featured Contract = 1 (Standard Contract no cuenta). Calculadora: diarias 50, semanales 100, meta 120 (destacado garantizado).

**BLEACH: Soul Resonance** (`src/sources/bleach.ts`; global de Crunchyroll). Códigos de game.guide (lista activa comprobada a diario).
- **Sin fuente web** de eventos ni banners: la web oficial es la de Asia y carga las noticias por JS desde otra API; la wiki de Fandom está abandonada (25 páginas);
  Game8, GameWith, Prydwen y lootandwaifus no lo cubren; las guías de banners son artículos sueltos sin fechas. Llegan **solo por Discord** (canal `bleach`).
  Por eso va como `wip` ("En construcción") hasta que su copia traiga eventos vigentes.
- Tiradas: 160 Spiritual Jade (también "Jades" en los códigos); billete = 1; pity 80 sin 50/50. Sin tabla fiable de ingresos diarios.

## Onmyoji, Path to Nowhere, Sword of Convallaria y MONGIL: STAR DIVE (añadidos el 13 nov 2026)

Fuentes nuevas en la lista del proxy: `gamewith-net` (gamewith.net, 2 páginas de SoC, 6 h, 3 s), `starforce` + `xdcdn` (avisos oficiales de SoC),
`pocketgamer` (códigos de SoC, PtN y MONGIL; 1 página por juego, 6 h, 3 s; robots.txt "Allow: /") y la página `other-games/mongil-star-dive` de Prydwen.
Las wikis (Fandom y wiki.gg) ya entraban por `wiki`. Steam se probó y no sirve: SoC dejó de publicar avisos en 2025 y Onmyoji en 2022; PtN y MONGIL no están.

**Azur Lane** (`src/sources/azurlane.ts`; 13 nov 2026). El canal de Discord (tuits de @AzurLane_EN) perdía avisos y daba títulos malos, así que se le sumó la web oficial:
los avisos de mantenimiento de azurlane.yo-star.com/news/ (fuente `yostar-al`; WordPress, robots.txt sin reglas), con bloques `<strong>New Events</strong>`,
`New Characters` ("Rate up in event construction pool" → banner de construcción limitada), skins, tienda, muebles… (menores) y su periodo. Hasta 3 avisos de los
últimos 40 días. Si un cosmético llega por las dos vías, se queda el de la web (`azurDedupe` en index.ts). Lector de Discord: títulos sacados de frases sin "The
following new …" y guiones dentro del nombre ("Battle UI - Angels' Stage is available between 11/12 - 11/26").

**Onmyoji** (`src/sources/onmyoji.ts`; servidor global). Sin avisos oficiales legibles: su web en inglés (en.onmyojigame.com) dejó de publicar noticias en abril
de 2020 y su Discord está abandonado. Wiki de Fandom, página "Events/Global": una tabla por año con la imagen de cada evento
(el nombre es el del archivo) y su periodo solo en días ("November 11th - December 8th"). Día entero 00:00 → 23:59 en hora del servidor global, EST (UTC-5; reloj "Server Time" de la portada de la wiki), todo "≈". Un solo servidor: sin selector de región.
- Banners: "Memory Scrolls …" y "Starry Return - …", con los shikigami del título; retrato de su página en la wiki ("SP Hyakuwa Hououka" → página "SP Hououka").
- Tiendas, packs, pases y aspectos: campaña menor (ocultos por defecto).
- **Sin fuente**: recompensas (los eventos nuevos no tienen página; los avisos oficiales no se pueden leer) y **códigos** (Onmyoji global no los publica con
  regularidad y nadie mantiene una lista).
- Tiradas: Mystery Amulet = 1; 100 Jade por invocación (wiki, "Summon"). Sin pity fijo.

**Path to Nowhere** (`src/sources/ptn.ts`; tres servidores: América UTC-7, Europa UTC+2 y Asia UTC+7, cada uno con su "Server Time"; los datos van en hora de América y el selector de región de servers.ts los desplaza). La wiki de Fandom dejó de seguir los eventos en 2024; la de wiki.gg
(pathtonowhere.wiki.gg) los pone en su portada, plantilla "MP/Middle": `{{MPEvent|nombre|fecha con hora (Server Time)|tipo}}` (Story/Event, SO = pase,
LA = arresto limitado, EA = arresto de evento) y los Sinners nuevos (`{{CharacterPortal|Requiem|S}}`). Imagen "<nombre> Banner.png", retrato "<nombre> Skin1 Icon.png".
- Reparto de los Sinners nuevos (la wiki no dice cuál va en cada arresto): la S con "·" (variantes limitadas) al limitado; el resto, y la A nueva, al de evento.
- Códigos: PocketGamer (sin el detalle de recompensas). **Sin fuente** de recompensas de eventos.
- **Avisos oficiales de la web** (fuente `aisno`): ptn.aisnogames.com pide su lista a `/api/news?offset=0&limit=6&locale=en-EN` y cada aviso es `/en-EN/news/<id>`
  (Next.js, texto en `__NEXT_DATA__`). Sale uno grande por versión con todos sus eventos numerados y hora exacta (`ptnNotice`); mandan sobre la wiki, que aporta la
  imagen y los arrestos (no van en esos avisos). El 13 nov 2026 dio 12 eventos de "The Dying Echo".
- **Próximos banners y reposiciones** (p. ej. una vuelta de Clementine): la wiki no los anuncia; solo salen en el X oficial (@PathtoNowhereEN), que no se puede
  leer. Con un canal de Discord "ptn" en `DISCORD_CHANNELS` (siguiendo sus anuncios) entran solos: el lector entiende "Rerun Exclusive Arrest", "S-Class Sinner
  [Clementine] or [Shalom]" y "(Server Time)" = UTC-7.
- Tiradas: 180 Hypercubes por arresto (dos guías coinciden; la wiki no tiene los precios). Pity 80.

**Sword of Convallaria** (`src/sources/soc.ts`; servidor global, UTC-4).
- GameWith (gamewith.net): "List of Available Banners" (banners en curso con su fecha de FIN y los iconos de todos los personajes) y "List of All Available
  Events" (eventos en curso con fin y descripción).
- Avisos oficiales de mantenimiento (la API de noticias de soc.xd.com): cada evento con inicio y fin exactos. Si un banner oficial acaba a la misma hora que uno de
  GameWith, este toma su inicio; si no hay aviso (los parches pequeños no lo tienen), el inicio se estima (14 días antes del fin, sin pasar de hoy) y se marca estimado.
- Códigos: PocketGamer. **Sin fuente** de recompensas con cifras.
- Discord (canal `soc`, 13 nov 2026, sigue #official-news y #social-media-news): los tuits dan la hora exacta de lo que la web no avisa. El lector entiende
  "A new event, The Frontier Line, will be available…", "Upcoming Limited-Time Summon Event: Get Together" (banner; destacados de 'the probability of summoning
  "Lukamar" and "Pooch Runrun"') y los sorteos de aspectos ('Live Skin "After the Midnight Snow" event', menor). Periodo "12:00, Nov 13, 2026 – 23:59, Dec 3, 2026 (UTC-4)".
- Próximo personaje: "List of Upcoming and New Characters" de GameWith (70901; p. ej. "Arman?"), sin fecha: banner estimado de 14 días tras el de personaje en curso.
- Tiradas: 150 Hope Luxite o 1 Secret Fate (BlueStacks, GameWith). Calculadora con meta 180 (destacado garantizado).

**MONGIL: STAR DIVE** (`src/sources/mongil.ts`). Banners de Prydwen (hora exacta, misma lectura que WuWa o NTE) y códigos de PocketGamer.
- Eventos: avisos oficiales del tablón "Events" del foro de Netmarble (fuente `netmarble` del proxy: la API pública que usa la web, lista y aviso suelto; la
  lista mezcla idiomas y solo se leen los avisos en inglés). Cada aviso trae varios eventos ("🌠 Event 3. M.A.D.'s 7-Day Gifts") con periodo en UTC, imagen,
  cómo participar y recompensas ("Compass of Destiny x1" → tiradas). "After the 11/10 maintenance" no da hora: se usa el inicio del banner de la versión.
  GameWith y la wiki.gg se quedaron en mayo/octubre de 2026 y no se usan para eventos.
- Próximo personaje anunciado sin fecha (tarjeta "teased" de Prydwen, p. ej. Lou): banner estimado a continuación del actual, con su misma duración.
- Retratos de mongil.wiki.gg ("<Nombre>Portrait.png") cuando la wiki los tiene (M.A.D. aún no).
- Tiradas: Compass of Destiny = 1; 160 Starlight Crystal = 1 Compass. Pity 90.

**Retratos de los destacados** (`withFeaturedIcons` en `src/collector.ts`, 13 nov 2026). Antes solo los buscaba cada navegador con la imagen principal de la página del
personaje (PageImages), que las wikis de wiki.gg no tienen: faltaban en 15 juegos. Ahora el recolector prueba el archivo de icono de cada wiki ("<nombre> icon.png",
"Resonator <nombre>.png" en WuWa, "<nombre> Covenant Avatar.png" en la IOP Wiki, "<nombre> Skin1 Icon.png" en PtN…) y después PageImages, en lotes de 50, y la copia
ya sale con el retrato. Juegos sin wiki (BD2, MHO, Stella Sora) siguen sin retrato salvo que su fuente lo traiga.

**Iconos de recompensas** (13 nov 2026). `withItemIcons` (recolector) prueba primero los archivos de icono y, si no hay, la imagen principal de la página del objeto
(PageImages, para aspectos, trajes y objetos con nombre propio). MONGIL toma el icono de la imagen que su aviso pone delante de cada recompensa. Revisión:
`node scripts/check-icons.mjs`. **Sin fuente de iconos**: CZN (su wiki de Fandom está vacía y ni Game8 ni GameWith listan sus objetos con imagen), "Radiant Coin"
y los sellos de MHO (no están en la lista de objetos de GameWith), y algunos trajes y cosméticos sin página en su wiki (Infinity Nikki, Honkai 3rd, AFK Journey).

## Iconos, lector de avisos y webs oficiales (12 nov 2026, segunda parte)

- **Iconos de recompensas** sin wiki (`withItemIcons` de `src/sources/index.ts`, después de unir Discord): MHO, de la "Item and Material List" de GameWith
  (`/en/items`, ~680 objetos con imagen en `img.gamewith.jp`); BLEACH, los iconos oficiales de la web global (Spiritual Jade, Kan, SR Character Recruit Letter;
  CDN de A PLUS JAPAN). GFL2 ya los trae el recolector de la IOP Wiki ("Item Collapse Piece.png"). Moneda de la calculadora: `iconUrl` en `pullPlan.ts`.
- **Lector de avisos** (`discord.ts`), probado con los mensajes reales de MHO y BLEACH (12 nov 2026) y comparado con los 10 canales anteriores (mismo resultado):
  "from <t:…>" / "to" / "<t:…>" en tres líneas; "Unlocks on …, lasts for 21 days"; fin abierto ("to the end of the special edition", "End of Season 0");
  nombre en la línea de encima del periodo; "Event Preview:", "Limited-Time Gacha", "Themed Event:" y "… Starts Today!" fuera del nombre; destacados
  'Limited SSR Character "Candice"'; horas por juego para los días sin hora (`DAY_HOURS`: BLEACH 11:00 → 08:00 UTC, mantenimiento de los miércoles; MHO
  03:00 → 14:59 UTC); "maintenance on <fecha hora>" sin fin como inicio aproximado de lo "after maintenance"; "Apex 8" ya no se lee como "Ape ×8".
  El analizador está separado (`parseNotices`) para leer avisos que no vienen de Discord.
- **Trickcal, web oficial**: "Event Notice" de trickcal.biligames.com/news/en/ (API `l11-web-api.biligames.com/game/news/page|detail`, responde sin la firma;
  servidor 113406, que cuadra con el global). Lector propio (`trickcalNotice`): apartados "1." y "①", periodo del apartado para sus Apóstoles, sin gachas de
  cartas, muebles ni plazos de canje. Mandan sobre lootandwaifus. 1 lista + hasta 3 avisos por ciclo (caché 2 h).
- **GFL2, web oficial** (12 nov 2026): `gf2-web-us-api.sunborngame.com/website/news_list/4` (eventos y banners, sin claves) y `/website/news/<id>`: un aviso
  por evento o banner ("[Themis' Game]", "Faelynn Rate Up!") con su **imagen** y "[Duration] 2026/10/29 9:00 ~ 2026/11/18 18:59 (UTC-4)". Mandan sobre la
  IOP Wiki (que completa recompensas, retratos y "Rerun"); corrigen la fecha de los banners (la wiki decía 28 oct; el aviso, 29 oct 09:00 UTC-4).
- **MHO, web oficial**: la sección Announcements del servicio de noticias de Level Infinite (`sg-community.playerinfinite.com`, POST con JSON y las
  cabeceras `x-gameid: 30075`, `x-areaid: global`; el proxy arma el cuerpo con `body(u)`). Sus "Update Notice" traen los "Event Preview" con hora exacta
  (Golden Check-In: 2026/11/05 21:00 – 11/19 20:59 UTC). La sección Events casi no se usa. Imágenes de los rotatorios: las de la Season Guide de GameWith.
- **Imágenes que faltan**: Trickcal (ni la web ni lootandwaifus ilustran los eventos; llegan con los tuits de Readybot por Discord), BD2 (sus avisos solo
  tienen tablas "image.png"), algunos menores de GFL2 y FGO. La app muestra el arte del juego en su lugar.
- BLEACH: la web global (playbleachsr.com) no tiene noticias, solo la del lanzamiento en PC; sigue dependiendo de Discord.
- Sin selector de servidor en los tres juegos nuevos: MHO avisa en UTC para "All Servers", BLEACH da un horario para EU y NA, GFL2 tiene un único servidor global.

## Servidor por juego y fichas de Endfield (12 nov 2026)

- **Selector de servidor** (`src/servers.ts`; chip al pie de cada tarjeta de "Mis gachas", `ServerChip` en `Views.tsx`): HoYoverse (Genshin, HSR, ZZZ, HI3; datos en Asia), WuWa y DNA (datos en América)
  y Endfield (datos en AMEU). Las horas se desplazan la diferencia de zonas salvo las pegadas a una versión (de 2 h antes a 6 h después de su inicio),
  y nada cruza un inicio de versión. Endfield usa las horas exactas de Asia de su wiki (columnas `Asia*` de la misma tabla Cargo, `GameEvent.servers`):
  no son un desplazamiento fijo. La elección se guarda en el navegador (`AppState.servers`), sin cuenta. Pedido por usuarios (comentarios del 12 nov).
- **Revisión de regiones (12 nov 2026)**: con selector, Genshin, HSR, ZZZ, HI3, WuWa, Endfield, DNA y **NTE** (añadido: cuatro servidores aislados con
  reinicio a las 05:00 locales). Por defecto, América. Reglas por juego en `REGIONS` (`servers.ts`): `maint` (horas de mantenimiento antes de la fecha de
  la versión; WuWa 7, el resto 5), `onlyOfficial` (NTE: solo se desplazan los avisos oficiales, en hora de América; los banners de Prydwen y los eventos
  de Game8 van en hora de Asia y se dejan), `localLaunch` (DNA: hasta la versión sale a la hora local de cada región). Las versiones estimadas no cuentan.
  Sin fecha de versión (NTE), los instantes en que empiezan o acaban 3+ cosas a la vez (con un banner) se toman como actualización/mantenimiento.
  **Horas no exactas (para revisar a mano)**: HI3 (toda la wiki, servidor supuesto Asia), DNA (Game8 da solo el día), NTE (eventos solo de Game8),
  WuWa (Endstate Matrix y los ciclos estimados de Torre/Whimpering Wastes) y los inicios/fines que dependen de una versión estimada (HSR 4.8, ZZZ 3.4).
- **Fichas de Endfield**: una consulta más por ciclo a `endfield.wiki.gg` (las páginas de los eventos vigentes, máx. 50): cita, requisitos y hasta 2 detalles (sin fechas ni horas, que ya salen en la ficha) y
  recompensas (también las que no dicen cantidad, para que salgan con icono) `{{I|…|n}}` / `{{Item|…|n}}` sumadas, con sus tiradas (Oroberyl y los HH Permit de evento).

## FGO: lo que viene a NA según JP, y NTE China (12 nov 2026)

- **FGO** (`fromJp` en `src/sources/fgo.ts`): NA repite el calendario de JP con unos dos años de retraso. Eventos de
  `api.atlasacademy.io/export/JP/basic_event_lang_en.json` (mismos ids que NA: lo que ya está en NA no se repite; sin nombre en inglés, permanentes ni
  Recollection Quest) y banners de la "Summon Banner List" de GamePress (`grandorder.gamepress.gg/summon-banner-list`, JSON `summonEventList` dentro de
  la página: nombre en inglés, servants, imagen, fechas JP y NA; robots.txt solo cierra `/admin/`; sin Lucky Bag). El retraso, en días, es la mediana de
  los 5 más recientes que ya salieron en los dos (sin reediciones ni lo simultáneo): 729 días el 12 nov 2026 (Mystery House Crafters, JP 6 nov 2024 →
  NA 5 nov 2026). Horas de NA: abre a las 04:00 UTC y cierra a las 03:59 UTC (todos sus eventos y banners de 2026 en Atlas). Todo sale "estimado" con
  la explicación (`d.fgoJp`). 2 consultas más por ciclo (12 h de caché). grandorder.wiki, que citaba GamePress, ya no existe (dominio en venta).
- **NTE China** (opción `cn` del selector, `servers.ts`): el servidor chino recibe cada versión unos 6 días antes (1.0: 23/29 abr; 1.2: 2/9 jul; 1.5:
  5/11 nov, avisos oficiales de Bilibili y nte.perfectworld.com). Su web oficial (yh.wanmei.com) tarda mucho desde fuera de China, así que no se lee:
  se adelanta todo el calendario global 6 días (versiones incluidas), en hora UTC+8, marcado "≈". Comprobado: los banners de la 1.5 caen el 5 nov a las
  11:00 (UTC+8), el fin del mantenimiento chino.

## Huecos de los juegos existentes (9 nov 2026)

- **Tiradas** (`RULES` en `src/sources/pulls.ts`), comprobadas en su wiki o en varias guías que coinciden: Blue Archive 120 Pyroxene, Limbus 130 Lunacy,
  FGO 3 Saint Quartz (Summon Ticket = 1), HI3 280 Crystals (Supply Card = 1), CZN 160 Crystals (Rescue Anchor/Amplifier = 1), Endfield 500 Oroberyl (HH Permit = 1),
  NTE 160 Annulith (Solid/Fabricated Dice = 1), Umamusume 150 Carats (Scout Ticket = 1). `pullsIn` acepta juegos sin reglas: lista las recompensas sin calcular tiradas.
  **Confirmadas por el dueño (9 nov 2026):** Stella Sora 300 Stellanite Dust; Epic Seven 5 Covenant Bookmarks = 100 Skystones = 1 tirada; CZN "Signal Amplification Anchor" = 1
  (banner limitado); Blue Archive "1-Recruitment Ticket" = 1 y "10-Recruitment Ticket" = 10 (`pullsIn` los reescribe como "Single/Ten Recruitment Ticket" para leerlos).
  Epic Seven lee las recompensas de sus avisos (tablas aplanadas "Covenant Bookmark 50"), salvo los de recompensas por compras. BrownDust2: 200 Dia = 1 (dato del dueño). Azur Lane: 2 Wisdom Cubes = 1 (construcción limitada: 2 cubos + 1500 monedas, wiki koumakan "Building"; los grupos permanentes cuestan 1).
- **Recompensas en el texto**: ahora se leen en CZN (secciones de los avisos de STOVE, y cada sub-evento con lo suyo), NTE (apartado "●" de neverness.gg) y en
  cualquier juego con canal de Discord (apartado del evento en el mensaje). Uma, FGO, Limbus, Endfield y BA (wiki) no traen recompensas en sus fuentes: siguen en 0.
  - **HI3** (11 nov 2026, `honkai3.ts`): de la página de cada evento, `{{currency|Nombre|N}}` y `{{item|Nombre|quantity=N}}`. Por objeto, el MAYOR entre
    el resumen de arriba y la suma del desglose (no se suman los dos); "Choose one of the following" = una opción (la que más tiradas vale) × los días
    citados ("3/5/7 days" = 3); fuera las notas de Ai-chan, las secciones de contenido/botín de suministros, las líneas de gasto o precio y los eventos
    de pago (Battle Pass, Spend Bonuses, rebajas, Time Capsule).
  - **HoYoverse**: los eventos sin recompensas buscan su página en la wiki por título (`{{Event Rewards}}`); en ZZZ, el `polychrome` de ennead se muestra.
  - **Arknights**: el proxy suma lo que reparten los logins del cliente (`akCheckinRewards` en proxy.mjs) y akdata lo pone en el evento.
  - **Blue Archive**: "up to 200 FREE recruitments" = 200 tiradas.
  - Epic Seven: sus tablas de recompensas son iconos sin nombre en el texto; no se pueden leer.
- **Discord** (`discord.ts`): quita la mención del rol ("@News Feed", "@Schale news"), los enlaces y "A new tweet has been posted!"; salta saludos ("Dear Commander,");
  saca el nombre de frases ("The collab event, X, will be available…"); entiende "11:59 P.M."; descarta los avisos de mantenimiento como eventos.
  Azur Lane (que sigue `#game-news`, tuits reenviados) ya da su primer evento bien: antes salía "@News Feed https://…" y cerraba 5 h antes.
- **Códigos de Game8** (`syncGame8Codes` en `codes.ts`): CZN (`archives/557967`) y Endfield (`archives/571509`), tabla de activos (código en `input.a-clipboard__textInput`).
  Sin fuente de códigos: NIKKE, PGR, AFK Journey, Epic Seven y Arknights (ni wiki ni Game8 ni nikke.gg) → seguir su canal de códigos/anuncios oficial en Discord.
  Umamusume Global aún no tiene códigos públicos (Game8); Limbus y FGO (NA) no tienen sistema de códigos.
- **Arte de FGO** (`fgo.ts`): banners = `static.atlasacademy.io/NA/SummonBanners/img_summon_<imageId>.png` (de `nice_gacha`); eventos = campo `banner` de
  `/nice/NA/event/<id>` (hasta 6 por ciclo, fuente `atlasacademy-event` del proxy, 24 h). Las campañas que citan un evento entre comillas toman su arte.
- **Stella Sora**: su wiki (Miraheze) va muy atrasada (último evento fechado: jun 2026) y su `#game-news` de Discord no ha publicado nada desde el 6 nov:
  sigue sin eventos. Si el canal oficial de anuncios es otro, seguir ese.
- **BrownDust2**: las imágenes de sus avisos son tablas de recompensas (comprobado), no arte; sus eventos se quedan con el fondo del juego.

## Revisión de datos (12 nov 2026, noche)

- **WuWa 3.8 sin eventos**: Kuro tituló las notas "Patch Notes for Version 3.8: …" (sin "Wuthering Waves"), así que `syncKuro` seguía leyendo las de la 3.7,
  ya caducadas. El filtro acepta ahora las dos formas, y la duración "✦Duration✦ Version 3.8 Update - …" (sin dos puntos) también se lee. Vuelven 6 eventos con hora exacta.
- **GFL2, avisos que faltaban**: la lista oficial se pedía con 10 avisos y los ~10 de una versión la llenan; los eventos que salen después (Para Bellum,
  Simulation Exercise, Equipment Analysis) tienen un Id menor y quedaban fuera. Se piden 2 páginas (la API empieza en `page=1`; `page=0` repite la primera).
  Las recompensas que el aviso enumera ("[Collapse Piece ×700]") pasan a la ficha y a las tiradas (Para Bellum: 4,7).
- Los canales de Discord de DNA, GFL2, MHO y BLEACH se siguieron el 12 nov: aún no tienen ningún aviso, así que todavía no aportan nada (se llenarán solos).
- **Stella Sora, web oficial** (`syncStellaSoraNews` en `src/sources/stellasora.ts`; fuente `stellasoraweb` del proxy, 3 s entre peticiones, caché 3 h):
  `stellasora.global/api/resource/news?index=1&size=12&type=` y `/news/detail?id=…` (sin claves ni robots.txt). Las notas de versión traen todos los
  eventos con hora exacta en UTC-7; se leen con `parseNotices` y se limpian cabeceras ("Recruitment Period ✦", "Zone 2 – …", packs de la tienda).
  En la 2.1 pasa de 1 evento a 11 (Cooling Supply Station, Cataclysm Survivor, Urgent Bounty, A Finale Echoing, Call for Best Records…) y los
  reclutamientos de Leafia y del disco. Discord solo reenvía algunos tuits (2 de ~12). Sin imagen por evento (las notas no ilustran cada uno).

## Descripciones resumidas y recompensas (12 nov 2026, noche)

- **Resumen de cada evento** (`src/sources/summary.ts`), al estilo de las fichas de Endfield: una o dos frases de presentación, los requisitos
  (`⟦d.efReq|…⟧`) y hasta dos detalles con viñeta; sin fechas, horas, recompensas (salen aparte), compensaciones, saludos ni notas "※". Sale del
  texto que cada fuente **ya descarga** (sin peticiones nuevas): lector de avisos (`parseNotices`: Discord, Trickcal, MHO, Stella Sora), notas de Kuro
  (WuWa, PGR), avisos de GFL2, Bluepoch (R:1999), nikke.gg, neverness.gg (NTE), BD2, STOVE (CZN, Epic Seven) y la wiki de HoYoverse (`eventPages`
  en `hoyowiki.ts`: `{{Description|…}}` del juego y los subapartados Requirements/Summary de "Event Details"; también para los eventos que ya tenían
  recompensas, en la misma consulta). Las descripciones que ya traían las fuentes se limpian (`shortDescription`: sin HTML ni "As of <fecha> (UTC),").
  Cobertura de eventos vigentes con texto, antes → después: Genshin 3→14/17, HSR 4→9/16, ZZZ 0→10/13, WuWa 0→5, PGR 0→7/7, Stella Sora 0→10/11,
  Trickcal 0→8/8, GFL2 1→10/14, R:1999 0→12/22, NIKKE 0→7/8, CZN 0→6/17, BD2 0→7/9, NTE 0→9/16. Siguen sin texto: los eventos de GameWith (MHO),
  AFK Journey, Honkai 3rd, Arknights, Blue Archive, Infinity Nikki, Limbus, FGO y Azur Lane (sus fuentes no traen el texto del evento).
- La ficha ya no repite "Fechas reales, horas aproximadas" (la etiqueta ≈ Hora aprox. lo dice); la fecha estimada sí se explica.
- **Endfield, recompensas**: el total que anuncia el texto con la cantidad fuera de la plantilla (`[{{Item|Oroberyl|gv=no}}]x1000`) se leía como 0 y
  solo contaba la tabla de tareas (Yuanyuan's Blazing Stoves: 600 en vez de 1000). Ahora, si el texto anuncia más, manda el texto.
- **Unión de fuentes** (`officialFirst`): una lista oficial que solo nombra objetos sin cantidad (avisos de NTE) ya no tapa la de la comunidad si esta trae cifras.

## Búsqueda de fuentes (12 nov 2026, noche): BLEACH, Steam y juegos con huecos

- **Steam (`src/sources/steam.ts`, fuente `steam` del proxy; API pública `ISteamNews/GetNewsForApp`, sin clave)**: solo los anuncios de la página
  del juego (`steam_community_announcements`), leídos con `parseNotices`. Mandan sobre las fuentes de siempre (`officialFirst` en `syncSource`).
  - **DNA**: sus notas de versión dan el periodo de cada evento en "(server time)", que aquí es América (UTC-5; `SERVER_TIME`). De 20 eventos "≈"
    (Game8, solo el día) a 9 con hora exacta; Game8 daba mal los cierres (05:00 en vez de 17:00).
  - **Infinity Nikki**: los eventos y banners de la 2.11, que la wiki aún no tiene (6 → 16 vigentes).
  - Descartados: Epic Seven (repite STOVE, con HTML suelto), Honkai 3rd ("From 12:00, OCT 29 to 12:00, NOV 19": el lector aún no entiende ese
    formato; sería lo siguiente), Limbus, Blue Archive y Uma (sin periodos legibles). BLEACH y MHO no están en Steam.
- **Unión de fuentes**: un rotatorio y un evento solo se unen si el nombre del evento es el del rotatorio o lo contiene ("Stygian Onslaught" ↔
  "Stygian Onslaught: Battle…", sí; "Immersive Theatre" ↔ "Immersive Theatre – Rhythm: Flamewrought", no: el rotatorio desaparecía).
- **AFK Journey**: la wiki da 00:00/23:59 UTC pero cada servidor cambia a su medianoche local: esas fechas salen ahora "≈ Hora aprox.".
- **BLEACH: Soul Resonance**, revisado a fondo; sigue dependiendo de Discord:
  - Web global (playbleachsr.com): su API (`am-web-api` / `eu-web-api.aplus-games.com`) solo tiene el prerregistro (correo, estado); sin noticias.
  - Wiki de wiki.gg (bleachsoulresonance.wiki.gg): abandonada (última edición: ago 2026; la cronología, ene 2026). La de Fandom, también.
  - gacha.gg (/bleach-soul-resonance/banners): robots lo permite y no lo prohíbe, pero solo da días y va con retraso (el 12 nov no tenía el
    banner de Urahara del 4 nov). No se usa.
  - anigacha.com y hideoutgacha.com: tienen los avisos, pero **sus condiciones prohíben el scraping** ("Not use automated scripts, bots, or
    scraping tools… without our express permission"; "Use automated tools to scrape…"). No se usan sin permiso escrito.
  - TapTap: su robots.txt bloquea a los bots de IA. No se usa.
  - **De dónde sacan ellos la información**: de la cuenta oficial de X **@BleachSRgame** (los artículos de hideoutgacha enlazan sus tuits) y del
    Discord oficial; el texto de anigacha es el del aviso oficial ("Event Period: November 4, 2026 (after maintenance) to November 25, 2026,
    03:59:59"), que nuestro lector ya entiende. Es decir, la misma fuente que nuestro canal de Discord `bleach`.
  - **Lo que falta (dueño)**: el canal `bleach` sigue el #game-news y el #codes del Discord oficial EU&NA desde el 12 nov, sin avisos aún. Para tener
    todos los avisos, añadir también al canal un reenvío de los tuits de **@BleachSRgame** (como el "News Feed" que ya tienen Stella Sora y Trickcal).
- **Duplicados por prefijo** (`dedupeEvents` en `syncSource`): el mismo evento con y sin "Limited Event:" / "New Event:" / "Limited Recruitment:"
  (el tuit de Stella Sora lo deja; su web no) se une si coincide el tipo y el periodo (±1 h), con la imagen y la descripción de cualquiera de los dos.

## Próximos gachas (12 nov 2026)

Sección "Próximos gachas" al final de la pestaña **Parches** (`UpcomingGames` en `src/Views.tsx`), pedida por usuarios: juegos aún sin lanzar
o sin lanzar en global, con fecha, región, editor, plataformas, estado y botón de prerregistro/web oficial.

- **Fuente: lista curada a mano en `src/upcoming.ts`** (sin consultas externas: la app no pide nada a nadie para esta sección).
  Cada entrada lleva `date` + `precision` (`day`/`month`/`quarter`/`spring`/`half`/`year`/`tba`), `confirmed` (true solo si lo dice el
  editor), `sources` (enlaces que respaldan la fecha, no se muestran) y `checked` (última revisión). Cuenta atrás solo con día exacto;
  "≈" + "Estimado" cuando la fecha sale de una tienda o calendario. Una entrada desaparece sola 14 días después de su ventana.
- **Imágenes**: icono de la App Store (como el catálogo); si no hay ficha, Steam (LIMIT ZERO BREAKERS), TapTap (Azure Haven) o el
  arte de la nota de prensa oficial (Guardian Maiden, `iconPos` para recortarlo).
- **Webs de calendarios** (usadas solo como pista para buscar, a mano): gacha.gg/upcoming (robots.txt solo cierra `/api/`; sin
  condiciones de uso publicadas), revenue.ennead.cc/upcoming (su API exige token, ver arriba). **anigacha y hideoutgacha prohíben el
  scraping: no se usan.**
- **Se actualiza sola** (`server/upcoming-live.mjs`, desde el 12 nov 2026). Cada 3 h el servidor lee los titulares RSS de **Gematsu**
  (`/feed`, robots.txt con Crawl-delay 10: el proxy espacia sus peticiones 10 s), **GamingonPhone** y **Siliconera** (`/feed/`; Siliconera solo
  cierra el feed a Amazonbot). De los titulares que hablan de anuncio, prerregistro, beta, lanzamiento o fecha saca el nombre del juego (`nameOf`:
  corta en el primer verbo; "Honkai: Nexus Anima" se queda entero) y lo busca en la **API pública de Apple** (`itunes.apple.com/search`, tienda de EE. UU.).
  Solo se añade si hay una ficha de **juego en reserva** (fecha de salida futura), sin precio y de un género típico de gacha (rol, estrategia,
  cartas; o aventura/simulación/acción con una descripción que lo delate). Así el ruido de los titulares se queda fuera y la fecha, el icono y el
  editor salen de la tienda. Cada ciclo revisa las ya guardadas de una vez (`/lookup?id=…`): pone la fecha al día y las quita 14 días después de salir.
  - Se guardan en `.cache/upcoming.json` y se sirven en `GET /data/upcoming.json`. De la noticia solo se guardan el titular y el enlace (se muestra
    "vía Gematsu" con enlace). `scripts/snapshot.mjs` (GitHub Actions, cada 3 h) también publica la lista acumulada en la rama `data`
    (`snapshots/upcoming.json`) y el servidor la une a la suya: un deploy de Botkeep, que borra `.cache/`, no la pierde. Render
    (`COLLECTOR_ENABLED=0`) no consulta nada: solo adopta esa copia. `UPCOMING_ENABLED=0` lo apaga.
  - La app une las dos listas (`upcomingList` en `src/upcoming.ts`): **la curada manda**. Una automática no se muestra si ya está en la curada
    o en el catálogo, y la fecha de la App Store solo sustituye a una curada con día **estimado**. Las automáticas salen como "≈ Estimado".
  - Límites: un juego sin ficha en la App Store de EE. UU. (solo PC/consola, o solo CN/JP/KR) no se descubre solo; para eso sigue la lista
    curada. Los RSS guardan poco (Gematsu ~8 h, GamingonPhone 10 titulares), de ahí el ciclo de 3 h. Como mucho 25 búsquedas nuevas por ciclo.
- Botón **"Próximos gachas (n) ↓"** arriba de Parches (`UpcomingJump`), con los iconos de los más cercanos: baja a la sección, que va al final.

## Copias que no pierden una fuente caída (`carryOver`, 13 nov 2026)

- Caso: la copia de DNA de las 23:41 UTC del 12 nov la publicó **GitHub Actions**, cuya IP bloquea Game8 (como la de Botkeep). Salió solo con
  lo de Steam (16 eventos) y sin los banners Myriad, que solo da Game8; como aún tenía bastantes eventos, la regla "no sustituir una copia
  buena por una peor" (×1,4) la dejó pasar y la web se quedó sin banners de DNA. Lo mismo, en menos, en CZN (Game8) y Stella Sora.
- Ahora (`carryOver` en `src/collector.ts`, usado por `scripts/snapshot.mjs` —tu PC y Actions— y por `server/collector.mjs`): los eventos
  vigentes de la copia anterior que la nueva no tiene, ni con otro nombre (mismo tipo, un nombre contiene al otro, fin a ±2 días), se
  conservan con `seen` = la última vez que una fuente los dio. A las 24 h sin confirmarse se sueltan. Sin fallos, no añade nada.
- Recuerda actualizar el secreto `DISCORD_CHANNELS` de Actions con los 13 canales: si no, cada copia de Actions sale sin esos avisos.
- **Rechazos en Botkeep (13 nov 2026)**: game8.co y webapi.browndust2.com bloquean su IP (ya sabido; las copias llegan desde el PC por la rama
  `data` y `carryOver` evita perderlas). **iopwiki.com** pide `Crawl-delay: 20` y el proxy esperaba 2 s: ahora 20 s (`GAP`). **Siliconera**
  (RSS de próximos gachas): Cloudflare corta las IP de servidores; el servidor ya no lo pide (`notServer`), solo el PC y Actions (`allFeeds`).
