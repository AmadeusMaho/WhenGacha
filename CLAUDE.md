# WhenGacha: reglas del proyecto

## `dist/` se versiona: recompílalo y súbelo en cada entrega

El host (Botkeep) ejecuta `npm start` **sin compilar**, así que sirve lo que haya en `dist/` del repositorio.
Si haces push solo del código de `src/`, el deploy sigue mostrando la versión anterior.

Antes de cada commit/push que cambie código, estilos, `public/` o `server/`:

```bash
npm run build:prod   # tsc -b && vite build -> regenera dist/
git add -A           # incluye dist/ (assets con hash nuevo, index.html, sw.js)
```

Comprueba que `git status` muestre cambios en `dist/` antes de hacer push. Si no hay, no se compiló.

Hay un segundo despliegue en **Render** (`render.yaml`, guía en `docs/render.md`) que compila solo en cada push; no sustituye a Botkeep.
Render es el **respaldo automático**: un Worker de Cloudflare (`cloudflare/failover/`, guía en `docs/cloudflare-worker.md`) manda las visitas
a Botkeep y, si falla, a Render. Render corre con `COLLECTOR_ENABLED=0` (no recolecta, solo adopta las copias de la rama `data`).
`dist/skins/` no se versiona (es copia de `public/skins/`); el servidor sirve las skins desde `public/` si faltan en `dist/`.

`build:prod` también regenera `server/bundle/collector.mjs` (el recolector del servidor, con las fuentes de `src/sources` y `linkedom` ya dentro).
Ese archivo **también se versiona**: el host no instala dependencias de desarrollo ni compila. Si cambias algo en `src/sources/` o `src/catalog.ts`, recompila y súbelo.

## Añadir un juego: siempre completo

Un gacha nuevo se añade de una vez con **todo** lo que tienen los demás: eventos, banners, desafíos, **códigos de canje** (`codes`) y
**recompensas y tiradas** de los eventos (`items`/`pulls`; la equivalencia moneda→tirada va en `RULES` de `src/sources/pulls.ts`),
**retratos** de los destacados (`withFeaturedIcons` en `src/collector.ts`: convención de iconos de su wiki en `ICON_FILES`) y **lo próximo** si existe:
banners y eventos ya anunciados, y personajes anunciados sin fecha como banner `precision: 'estimated'` a continuación del actual
(ejemplos: Lou en `mongil.ts`, Arman en `soc.ts`). Busca siempre la fuente de lo próximo (avisos oficiales, "upcoming" de Prydwen/GameWith, foros).

## Iconos: toda recompensa con icono y todo destacado con retrato

Siempre faltan iconos, así que se revisa en cada juego nuevo y en cada cambio de fuentes: `node scripts/check-icons.mjs` (copias locales en `.cache/snapshots`, o la carpeta
que le pases) o `node scripts/check-icons.mjs --data` (las publicadas) lista por juego las recompensas sin icono y los destacados sin retrato. Orden para cubrirlos:
1. **La propia fuente**: si el aviso o la guía pone la imagen junto a la recompensa o al personaje, guárdala ahí (`mongil.ts`: la imagen previa al nombre; `soc.ts`, `ptn.ts`).
2. **El buscador del recolector** (`src/collector.ts`): `withItemIcons` (archivos "Item X.png", "X.png", "X Icon.png"… y, si no, la imagen principal de la página
   del objeto) y `withFeaturedIcons` (convención de cada wiki en `ICON_FILES`, y la página del personaje). Si una wiki usa otro nombre de archivo, añádelo ahí.
3. **Juegos sin wiki**: un mapa de iconos propio en `ITEM_ICONS` de `src/sources/index.ts` (MHO desde GameWith, BLEACH desde su web oficial).
Lo que no tenga icono en ninguna fuente se deja dicho en `docs/fuentes-y-proxy.md` (hoy: CZN, sin wiki ni guía con iconos de objetos; algunos trajes y cosméticos).
Si alguna parte no tiene fuente permitida, se deja dicho (en el código y en `docs/fuentes-y-proxy.md`), no se omite en silencio.

## Antes de tocar fuentes, proxy o recolector

Lee **`docs/fuentes-y-proxy.md`**: explica el incidente en que gachafocus bloqueó al servidor (403 en todas las páginas) y cómo se evitó repetirlo.
Reglas que no se rompen:

- Nunca consultes una fuente externa desde el navegador ni "por visita": todo va por `/proxy` (con caché) o por el recolector.
- No añadas páginas a gachafocus sin necesidad (hoy ~12 por ciclo) ni metas reintentos o dobles peticiones en bucle.
- La cola por sitio (gachafocus 2 s, Prydwen 10 s por su `Crawl-delay`) y la pausa con retroceso tras un 403/429 son a propósito.
- Prydwen rechaza el `fetch` de Node; el proxy usa `node:https` con el UA identificado.
- Botkeep reemplaza los archivos en cada deploy (se pierde `.cache/`): junta los cambios en pocos deploys.

## Recolector y copias por juego

- `server/collector.mjs` ejecuta cada fuente (las mismas de `src/sources`) cada 1–6 h, de juego en juego, y guarda el resultado en `.cache/snapshots/<juego>.json`. Se sirve en `GET /data/<juego>.json`.
- La app (`src/store.ts`) pide primero esa copia (`fetchSnapshot` en `src/net.ts`, solo si hay servidor) y, si no existe o tiene más de 24 h, consulta las fuentes ella misma a través de `/proxy`.
- **Gachafocus está APAGADO por defecto** (`GACHAFOCUS_ENABLED`): su web prohíbe la recolección automatizada y ofrecerá una API de pago. No lo reactives para scrapear; ver "Estado actual" en `docs/fuentes-y-proxy.md`. Epic Seven usa `src/sources/epic7.ts` (bannerhistory.app + avisos oficiales de STOVE). Lo siguiente de este punto describe cómo se usaba antes.
- Gachafocus se consultaba donde no hay otra fuente (Epic Seven: eventos y banners; Stella Sora y CZN: solo eventos) y, como complemento, donde más aporta: Arknights, Blue Archive, Reverse: 1999, WuWa y NTE (eventos) y NIKKE (eventos y banners), unas 11 páginas por ciclo (WuWa y NTE ya tienen eventos propios de Game8; gachafocus solo los corrige). `GACHAFOCUS_EXTRAS` lo ajusta en el servidor: `0` = solo donde es imprescindible, `1` = también para todos los demás juegos, o una lista de ids (`nikke,arknights`).
- Tras un 403/429 de una fuente, el proxy espera 10 min y duplica la espera en cada fallo seguido (máx. 2 h).
- **Copias desde otra IP**: `npm run snapshot:publish` ejecuta el recolector en este equipo y publica las copias en la rama `data`; el servidor las lee de GitHub cada 20 min (sin claves ni despliegue). Hay un flujo de GitHub Actions (`.github/workflows/snapshots.yml`) que lo hace cada 3 h. Ver `docs/fuentes-y-proxy.md`.
- Las fuentes se escriben para el navegador (`DOMParser`), pero también deben funcionar en Node con `linkedom`: no uses `table.rows`/`row.cells` ni APIs de layout.


## Discord (Stella Sora, Blue Archive Global y otros 12 juegos)

Canales configurados (13 nov 2026): stellasora, bluearchive, limbus, arknights, honkai3, azurlane, infinitynikki, nikke, dna, trickcal, gfl2, mho, bleach, ptn y soc
(este sigue #official-news y #social-media-news de SoC: sus parches pequeños no tienen aviso en la web). Onmyoji no: su Discord está abandonado y su web dejó de publicar en 2020.
Al conectar un canal nuevo, prueba el lector (`parseNotices`) con avisos reales del juego y vuelve a pasar los canales que ya funcionan para ver que no cambia nada.
Discord complementa, no sustituye: cada juego con canal debe tener también una fuente web (Azur Lane: avisos de azurlane.yo-star.com; PtN: avisos de ptn.aisnogames.com).

- `src/sources/discord.ts` lee los canales de un servidor propio que "sigue" los anuncios oficiales. Solo con `DISCORD_TOKEN` y `DISCORD_CHANNELS` en el servidor
  (guía en `docs/discord-bot.md`). El token nunca va al repositorio ni al navegador: la fuente `discord` del proxy es interna.

## Skins: legibilidad revisada en cada una

Toda skin nueva (o cambio grande de una) se valida con `scripts/skin-contrast.js` en todas las pantallas, escritorio y móvil,
más capturas de pantalla, hasta que no quede ningún texto por debajo de 4.5:1. Además, cada skin da estilo propio a los retratos de
los destacados y a las cabeceras de sección de la ventana del evento (como Genshin y WuWa). Procedimiento y trampas conocidas en
**`src/skins/README.md`** ("Regla: toda skin se revisa campo por campo").

**Toda skin nueva lleva su reproductor de música temático** (`src/skins/SkinMusic.tsx`: su música en `MUSIC` y su id en `MINI`; su diseño en
`src/skins/skins.css`, "Temas compactos"). Cada uno con **silueta propia y compacta** basada en un objeto de su juego, no la misma caja con otros
colores: ZZZ la tele CRT (solo suya), HSR funda de vinilo con el disco girando, Genshin pergamino, NIKKE el teléfono del comandante, WuWa panel
holográfico, Arknights ficha de PRTS, Uma entrada del Winning Live, Blue Archive una conversación de MomoTalk. El vídeo siempre entero a 200×200 y sin nada encima (norma de YouTube).

## Otros detalles útiles

- Los finales de línea dan avisos "LF will be replaced by CRLF": es ruido de Windows, no hay cambios de contenido.
- `public/sw.js`: el HTML va "red primero" para que un deploy se vea en la primera carga; los `/assets/` con hash van desde caché.
  Si cambias la estrategia de caché, sube también el nombre de la caché (`whengacha-shell-vN`).
- El proxy (`server/proxy.mjs`) solo permite las fuentes de su lista: una fuente nueva necesita su entrada ahí.
- El recolector sustituye `globalThis.fetch` por el del proxy (lista cerrada, sin cabeceras). Todo lo que el servidor pida por su cuenta
  (GitHub, Resend…) usa `nativeFetch` de `server/native-fetch.mjs`; con `fetch` a secas responde "Fuente no permitida" (403).
- Botkeep no pasa las variables del panel al proceso: las deja en un `.env` que carga `server/env.mjs` (importado el primero).
- Anti-scraping (13 nov 2026): `public/robots.txt` cierra `/data/`, `/proxy` y `/api/` a todos los robots y la web entera a los de IA/SEO; `server/antiscrape.mjs`
  responde 403 en `/data/*` y `/proxy` a esos rastreadores, a herramientas (curl, python-requests, Scrapy, navegadores sin interfaz…), a peticiones sin
  User-Agent y a las `Sec-Fetch-Site: cross-site`, con límite por IP. Si algún servicio propio necesita leer `/data/`, que use un User-Agent de navegador o pásalo por GitHub.
- `server/visits.mjs`: contador de visitas en el log (`[visitas] …` por cada carga de la página y resumen diario, GMT-3). No guarda IPs;
  descarta bots y monitores. Cada servidor cuenta lo suyo y se reinicia en cada deploy; las cifras históricas están en Cloudflare → Analytics.
- `server/skin-live.mjs`: cada 12 h mira el vídeo/imagen de portada de las webs de Genshin, ZZZ y WuWa (fuentes `internal` del proxy) para el fondo de las skins (`/data/skin-live.json`). No descarga vídeos; ver "Fondos de las skins según la versión" en `docs/fuentes-y-proxy.md`.
