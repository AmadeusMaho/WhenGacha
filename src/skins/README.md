# Skins del sitio (prototipo, 9 nov 2026)

Botón con un pincel en la cabecera, al lado del idioma: "Original" o una skin de gacha que cambia **todo** el aspecto
(cabecera, pestañas, botones, filtros, paneles, línea de tiempo, ventana del evento, tipografía, fondo y cursor).

- `skins.ts`: lista de skins (`SKINS`), guardado (`localStorage`, clave `whengacha:skin`) y `data-skin` en `<html>`.
- `SkinPicker.tsx` + `skins.css`: el botón y su menú.
- `SupporterBadge.tsx`: insignia dorada **"Premium"** junto al nombre de la web, solo con el desbloqueo de apoyo (mismo estado que las skins).
  En `App.tsx` va dentro de `.brand`, marcada con `{/* skins */}`.
- `wuwa.css`: la skin **Wuthering Waves**. Solo aplica con `<html data-skin="wuwa">`.
- `genshin.css` (prueba): la skin **Genshin Impact**, con el estilo de los menús del juego (barras pizarra, paneles y filas crema con texto
  gris azulado, tarjetas tipo objeto con fondo naranja y franja crema, contadores arena, botón principal amarillo). Fondo animado propio en
  CSS (motas de luz y brillo), sin vídeo. `public/skins/genshin/`: cursor, destello y fondo de ranura, de la carpeta de Drive "UI Assets" que
  aportó el dueño; sin arte de personajes.
- `public/skins/wuwa/`: sus recursos. `btn.png`, `bg.jpg` y `glow.png` son de la web oficial (wutheringwaves.kurogames.com,
  arte de Kuro Games, copiados el 9 nov 2026). `cursor.png` (48 px) y `cursor@2x.png` (96 px) son el cursor del juego, del `Aki.zip`
  del cliente que aportó el dueño (`Content/Aki/Cursor/CursorNor*.png`; los estados Hi y Pre son la misma imagen). Punta en (3, 3).
- `public/skins/wuwa/ui/`: piezas de la interfaz del juego, del repo `TomyJan/WutheringWaves-UIResources` (rama 3.7, `UIResources/Common`;
  sin licencia, extraídas del juego por un tercero). `btn`/`btn-hold` = `T_BtnStyleA2Nor/Hold` (botones), `btn-main`/`btn-main-hold` =
  `T_BtnStyleA1Nor/Hold` (botón principal), `chip`/`chip-hold` = `T_BtnStyleCNor/Hold` (chips y filtros), `row` = `T_TogListNor` (filas de
  lista), `title` = `T_ShopTitleBg` (títulos), `star` = `Cursor/T_PcStarB` (destello) y `emblem` = recorte del emblema dorado de
  `Atlas/Button/T_TPI_Common_Button1_UIAtlas`. Se usan con `border-image` en el bloque "Piezas de la interfaz del juego" de `wuwa.css`
  (cortadas dejando una franja central: si se cortan justo por la mitad, el botón muestra una raya horizontal).

- `LiveWallpaper.tsx`: fondo animado de la **línea de tiempo** (no sale en "Mis gachas" ni en "Parches"), si la skin tiene `live` en `SKINS`.
  WuWa usa el vídeo de la portada de su web oficial (`public/skins/wuwa/live.mp4`, arte de Kuro Games: sin bandas negras, 960 px, sin audio,
  24 MB → 2,3 MB) y un fotograma fijo (`live.jpg`) para móvil, "ahorro de datos" y "reducir movimiento". Se pausa con la pestaña oculta.
  Para quitar solo el vídeo: borra `live` de la entrada de WuWa en `skins.ts` y los dos archivos.
- En la skin, el color de cada juego (`--c`/`--c2`) se sustituye por el dorado y carbón de WuWa en tarjetas, carriles y barras.

Antes hubo temas ("Negro OLED", "Colores") y opciones de fondo/acento/cursor; se quitaron.

## Solo para WhenGacha Premium

Las skins (y la insignia) son de **WhenGacha Premium**: se consigue apoyando con PayPal desde el pincel y se entra con el correo
(enlace de un solo uso), así que no hay nada que se pueda publicar. "Original" siempre está disponible. Configuración, variables y
gestión (`npm run premium -- add|revoke|check correo`): **`docs/premium.md`**.

- `premium.ts`: sesión (token firmado por el servidor, `whengacha:session`, revalidada cada 12 h), enlace del correo (`?acceso=…`) y pago.
- `SupportDialog.tsx`: ventana de apoyo (importe, botón de PayPal, correo).
- Sigue siendo posible activar una skin a mano tocando el código de la web (el CSS y las imágenes siempre se pueden descargar); lo que
  ya no se puede es compartir un acceso.
- Los códigos `WG-…` anteriores ya no existen.

## Añadir otra skin

1. `public/skins/<id>/` con sus imágenes.
2. `src/skins/<id>.css` con todas las reglas bajo `html[data-skin="<id>"]` (usa `wuwa.css` de modelo) e impórtala en `SkinPicker.tsx`.
3. Una entrada en `SKINS` (`skins.ts`).

## Cómo quitarlas del todo

1. En `src/App.tsx`, borra lo marcado con `// skins` o `{/* skins */}`: los `import` de `SkinPicker` y `SupporterBadge`, `<SkinPicker … />` y `<SupporterBadge />`.
2. Borra esta carpeta (`src/skins/`) y `public/skins/`.
3. Si también quitas Premium: `server/supporter.mjs` (+ `.d.mts`), `server/support/`, `scripts/premium.mjs`, el script `premium` de
   `package.json`, las líneas de `/api/` en `server/index.mjs` y `vite.config.ts`, `docs/premium.md` y el apartado de Premium de `public/privacidad.html`.
4. `npm run build:prod` y subir `dist/` como siempre.
