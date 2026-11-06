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

- **Refresco desde el PC del dueño** (idea pensada, no implementada, por si gachafocus sigue bloqueando a Botkeep por IP): un comando `npm run snapshot` que
  ejecute el recolector en local (donde gachafocus sí responde) y guarde las copias en `server/seed/`; el servidor las cargaría al arrancar si no tiene otras más
  recientes. Cuidar que el recolector no sustituya una copia rica por una pobre (p. ej. NIKKE 3 elementos en vez de 12) cuando gachafocus falla: solo reemplazar si
  la nueva trae al menos tanto como la anterior. El cliente (`fetchSnapshot`) hoy rechaza copias de más de 24 h: habría que subir ese límite.
- Que el refresco en segundo plano del proxy solo renueve URLs de **datos** (`action=parse|cargoquery`) y no las búsquedas de
  imágenes de las wikis (hoy se renuevan todas las vistas en los últimos 7 días).
- Bajar el ritmo de renovación: gachafocus 1 h → 3 h, Prydwen 2 h → 3 h, ennead 10 → 30 min (el recolector solo los usa cada 3–6 h).
- Mover las búsquedas de imágenes al recolector (hoy las hace el navegador de cada visitante vía `/proxy`).
- Contactar con gachafocus (`/en/contact`) y Prydwen para pedir autorización/uso formal; es la solución de fondo.
- Epic Seven y Stella Sora no tienen otra fuente abierta; eventos menores de NIKKE/Arknights/Blue Archive/R99 solo vienen de gachafocus.
