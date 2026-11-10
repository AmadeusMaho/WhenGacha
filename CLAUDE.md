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

`build:prod` también regenera `server/bundle/collector.mjs` (el recolector del servidor, con las fuentes de `src/sources` y `linkedom` ya dentro).
Ese archivo **también se versiona**: el host no instala dependencias de desarrollo ni compila. Si cambias algo en `src/sources/` o `src/catalog.ts`, recompila y súbelo.

## Añadir un juego: siempre completo

Un gacha nuevo se añade de una vez con **todo** lo que tienen los demás: eventos, banners, desafíos, **códigos de canje** (`codes`) y
**recompensas y tiradas** de los eventos (`items`/`pulls`; la equivalencia moneda→tirada va en `RULES` de `src/sources/pulls.ts`).
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


## Discord (Stella Sora y Blue Archive Global)

- `src/sources/discord.ts` lee los canales de un servidor propio que "sigue" los anuncios oficiales. Solo con `DISCORD_TOKEN` y `DISCORD_CHANNELS` en el servidor
  (guía en `docs/discord-bot.md`). El token nunca va al repositorio ni al navegador: la fuente `discord` del proxy es interna.

## Skins: legibilidad revisada en cada una

Toda skin nueva (o cambio grande de una) se valida con `scripts/skin-contrast.js` en todas las pantallas, escritorio y móvil,
más capturas de pantalla, hasta que no quede ningún texto por debajo de 4.5:1. Además, cada skin da estilo propio a los retratos de
los destacados y a las cabeceras de sección de la ventana del evento (como Genshin y WuWa). Procedimiento y trampas conocidas en
**`src/skins/README.md`** ("Regla: toda skin se revisa campo por campo").

## Otros detalles útiles

- Los finales de línea dan avisos "LF will be replaced by CRLF": es ruido de Windows, no hay cambios de contenido.
- `public/sw.js`: el HTML va "red primero" para que un deploy se vea en la primera carga; los `/assets/` con hash van desde caché.
  Si cambias la estrategia de caché, sube también el nombre de la caché (`whengacha-shell-vN`).
- El proxy (`server/proxy.mjs`) solo permite las fuentes de su lista: una fuente nueva necesita su entrada ahí.
- `server/skin-live.mjs`: cada 12 h mira el vídeo/imagen de portada de las webs de Genshin, ZZZ y WuWa (fuentes `internal` del proxy) para el fondo de las skins (`/data/skin-live.json`). No descarga vídeos; ver "Fondos de las skins según la versión" en `docs/fuentes-y-proxy.md`.
