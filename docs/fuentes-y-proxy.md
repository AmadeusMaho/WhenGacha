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
  de elementos. Quién la ejecuta: (1) el flujo **GitHub Actions** `.github/workflows/snapshots.yml` (cada 3 h; usa el token de la ejecución, sin claves propias; sus IP de datacenter
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

## Huecos de los juegos existentes (9 nov 2026)

- **Tiradas** (`RULES` en `src/sources/pulls.ts`), comprobadas en su wiki o en varias guías que coinciden: Blue Archive 120 Pyroxene, Limbus 130 Lunacy,
  FGO 3 Saint Quartz (Summon Ticket = 1), HI3 280 Crystals (Supply Card = 1), CZN 160 Crystals (Rescue Anchor/Amplifier = 1), Endfield 500 Oroberyl (HH Permit = 1),
  NTE 160 Annulith (Solid/Fabricated Dice = 1), Umamusume 150 Carats (Scout Ticket = 1). `pullsIn` acepta juegos sin reglas: lista las recompensas sin calcular tiradas.
  **Confirmadas por el dueño (9 nov 2026):** Stella Sora 300 Stellanite Dust; Epic Seven 5 Covenant Bookmarks = 100 Skystones = 1 tirada; CZN "Signal Amplification Anchor" = 1
  (banner limitado); Blue Archive "1-Recruitment Ticket" = 1 y "10-Recruitment Ticket" = 10 (`pullsIn` los reescribe como "Single/Ten Recruitment Ticket" para leerlos).
  Epic Seven lee las recompensas de sus avisos (tablas aplanadas "Covenant Bookmark 50"), salvo los de recompensas por compras. BrownDust2: 200 Dia = 1 (dato del dueño). Azur Lane: 2 Wisdom Cubes = 1 (construcción limitada: 2 cubos + 1500 monedas, wiki koumakan "Building"; los grupos permanentes cuestan 1).
- **Recompensas en el texto**: ahora se leen en CZN (secciones de los avisos de STOVE, y cada sub-evento con lo suyo), NTE (apartado "●" de neverness.gg) y en
  cualquier juego con canal de Discord (apartado del evento en el mensaje). Uma, FGO, Limbus, HI3, Endfield y BA (wiki) no traen recompensas en sus fuentes: siguen en 0.
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
