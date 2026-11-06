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

## Recolector y copias por juego

- `server/collector.mjs` ejecuta cada fuente (las mismas de `src/sources`) cada 1–6 h, de juego en juego, y guarda el resultado en `.cache/snapshots/<juego>.json`. Se sirve en `GET /data/<juego>.json`.
- La app (`src/store.ts`) pide primero esa copia (`fetchSnapshot` en `src/net.ts`, solo si hay servidor) y, si no existe o tiene más de 24 h, consulta las fuentes ella misma a través de `/proxy`.
- Gachafocus se consulta donde no hay otra fuente (Epic Seven y Stella Sora: eventos y banners; Wuthering Waves, NTE y CZN: solo eventos) y, como complemento, donde más aporta: Arknights, Blue Archive y Reverse: 1999 (eventos) y NIKKE (eventos y banners), unas 12 páginas por ciclo. `GACHAFOCUS_EXTRAS` lo ajusta en el servidor: `0` = solo donde es imprescindible, `1` = también para todos los demás juegos, o una lista de ids (`nikke,arknights`).
- Tras un 403/429 de una fuente, el proxy espera 10 min y duplica la espera en cada fallo seguido (máx. 2 h).
- Las fuentes se escriben para el navegador (`DOMParser`), pero también deben funcionar en Node con `linkedom`: no uses `table.rows`/`row.cells` ni APIs de layout.


## Otros detalles útiles

- Los finales de línea dan avisos "LF will be replaced by CRLF": es ruido de Windows, no hay cambios de contenido.
- `public/sw.js`: el HTML va "red primero" para que un deploy se vea en la primera carga; los `/assets/` con hash van desde caché.
  Si cambias la estrategia de caché, sube también el nombre de la caché (`whengacha-shell-vN`).
- El proxy (`server/proxy.mjs`) solo permite las fuentes de su lista: una fuente nueva necesita su entrada ahí.
