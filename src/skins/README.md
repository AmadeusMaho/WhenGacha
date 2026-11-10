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
  aportó el dueño; sin arte de personajes. `bg.webp`: el fondo de los menús del juego (Backgrounds de skowt.cc, asset oficial
  "Non-commercial fan use only"; añadido el 10 nov 2026 por decisión del dueño), oscurecido bajo el brillo y las motas.
- `zzz.css` (prueba, 10 nov 2026): la skin **Zenless Zone Zero**, con el estilo "callejero" de los menús del juego (capturas del dueño):
  paneles negros con borde gris grueso, pestañas en cápsula con la activa amarilla y el borde inclinado, etiquetas oscuras con el texto
  de color (como INQUIRY / POST / INTEL), títulos blancos muy gruesos (".TÍTULO" fuera de los paneles, "- TÍTULO -" dentro), franjas
  diagonales amarillas en el fondo y el amarillo del juego **#FFDD00** (muestreado de sus imágenes).
  - **Fuente**: la del juego, 印品鸿蒙体 (inpin hongmengti, © 上海萌言文化创意有限公司 / 印品字库; de pago para uso comercial), con el
    archivo que aportó el dueño (10 nov 2026). `public/skins/zzz/zzz-font.woff2` es un recorte solo latino (8,9 KB; el original pesa 1,9 MB):
    en el original las tildes, la ñ, «…», «→» y «≈» tienen ancho completo como un carácter chino y se veían separadas («L í nea»), así que
    el recorte les pone el ancho de su letra base. Se regenera con `scripts/skin-font.py` (necesita `pip install fonttools brotli`).
    El chino y lo que no cubre caen en Rubik (Google Fonts). En móvil, la fuente es más ancha: hay un bloque `@media` al final de `zzz.css`.
  - `public/skins/zzz/`: `scene.webp` = viñeta de cómic Scene OVA00_03_03_01 de skowt.cc (fondo, oscurecida) y `live.webp` = IconEmoji01
    (carita en los eventos en curso), assets oficiales marcados "Non-commercial fan use only" (derechos de miHoYo); el dueño decidió usarlos.
    `cursor.png` (32 px) y `cursor@2x.png` (64 px) = el cursor del juego, recortado del `.cur` que aportó el dueño (traía 3×3 copias sobre fondo de cuadros: se tomó una, sin fondo y con contorno oscuro). Punta en (2, 2).
  - Las pegatinas chibi se probaron y se quitaron (no gustaron).
- `hsr.css` (prueba, 10 nov 2026, rehecha con capturas del juego): la skin **Honkai: Star Rail**, como sus menús de teléfono y misiones:
  paneles carbón con borde gris fino, dorado ámbar de acento, fila seleccionada clara con franja dorada, botón principal en píldora gris
  clara, pestaña activa blanca con barra debajo, títulos como la barra "Trailblaze Mission" (estrella de cuatro puntas, se difumina),
  fichas de destacados como las recompensas (fondo de rareza y franja oscura) y fondo de escena desenfocado.
  `public/skins/hsr/`: `bg.webp` (Backgrounds, nebulosa con destellos dorados) y `star.webp` (Star of Honor), assets oficiales de skowt.cc
  marcados "Non-commercial fan use only" (el dueño decidió usarlos); `cursor.png` = el cursor del juego, convertido del `.cur` que aportó el dueño (punta en 4, 4).
  Fuente: la del juego en inglés es **DIN Next** (Monotype, de pago): se usa si el visitante la tiene instalada; si no, **Barlow** (OFL).
- **Vista previa de skins** (`SkinPicker.tsx`): cambia al MOVER el ratón por una fila y se quita al salir del menú entero. El menú tiene
  posición fija (medida al abrirlo) y las mismas medidas y fuente con cualquier skin (bloque final de `skins.css`): antes cambiaba de tamaño
  en cada vista previa y saltaba bajo el ratón (parpadeo con ZZZ). Una skin nueva NO debe tocar las medidas del menú, solo sus colores.
- **Fuentes de los juegos** (10 nov 2026, archivos aportados por el dueño; recortes solo latinos con `scripts/skin-font.py`, que también
  arregla los signos de ancho completo):
  - Genshin: **HYWenHei-85W** (`zhcn.ttf` del cliente, © Beijing Hanyi Keyin) → `public/skins/genshin/genshin-font.woff2` (16,7 KB).
  - ZZZ: **印品鸿蒙体** → `public/skins/zzz/zzz-font.woff2` (ver abajo).
  - WuWa: **Sora** (Google Fonts, licencia libre OFL), la más parecida a Cocogoose Pro tras compararlas una al lado de la otra.
    Cocogoose no se usa: el archivo aportado es la versión de prueba de Zetafonts, cuya licencia (dentro del .ttf) prohíbe usarla como
    fuente web, y además trae los números sustituidos por un bloque de relleno.
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
4. **Revisión de legibilidad (obligatoria antes de subirla)**: ver abajo.

## Regla: toda skin se revisa campo por campo antes de subirla

La hoja base (`App.css`) fija muchos colores claros pensados para el fondo oscuro (`#fff`, `#ddd`, `#ccd`, `#fcd34d`…: nombres de
parches, "Caduca…", `.desc`, `.prec`, `.stars`, `.cur-name`, texto de las barras…). Si la skin pone paneles claros, esos textos
desaparecen aunque se cambien `--text`/`--muted`. Pasó con Genshin (10 nov 2026). Por eso, con la skin puesta:

1. En la consola (con `npm run dev`):
   `eval(await (await fetch('/@fs/C:/Users/PC/Documents/Whengacha/app/scripts/skin-contrast.js')).text()); __skinAudit()`
   (o pega `scripts/skin-contrast.js` en la consola). Devuelve cada texto visible por debajo de **4.5:1** (3:1 si es grande).
2. Pásalo en **todas** las pantallas: Línea de tiempo (vista Líneas y Cuadrícula), Mis gachas (con los códigos desplegados),
   Parches, ventana de un evento, Filtros, menú de idioma, menú de skins, ventana de apoyo; en escritorio **y** en móvil (375 px).
3. El resultado debe quedar vacío, salvo falsos positivos que se revisan a ojo: texto sobre degradado o imagen (marcado `IMG:`,
   p. ej. el botón de donar) y adornos (estrellas, ✦).
4. Además, captura de pantalla de cada vista: el script no ve texto encima del arte (barras de la línea de tiempo, títulos sobre
   imágenes), ni campos/botones del mismo color que su panel (un input crema en un panel crema "no se ve" aunque su texto pase).
5. Nada de `opacity` para apagar texto (barras pasadas, etiquetas): baja el contraste por debajo del mínimo; usa colores o `filter`.

## Regla: los destacados de un banner se ven como en el juego

Cada skin da su propio estilo a los retratos de la ventana del evento (`.featured .portrait`: imagen, nombre y `small` opcional) y a las
cabeceras de sección dentro de los paneles (`.modal-body h3`, etc.), en lugar del círculo y la barra rectangular de la base:

- **Genshin**: ficha de objeto del inventario (fondo naranja de rareza + franja crema con el nombre); la cabecera pizarra se difumina a la derecha.
- **ZZZ**: ficha de agente (borde gris grueso, brillo amarillo, nombre en blanco grueso sobre línea amarilla); la cabecera no lleva bloque: texto centrado entre guiones ("- DESTACADOS -"), como en el juego.
- **WuWa**: ficha de resonador (tarjeta oscura con esquina cortada, brillo dorado desde abajo, franja con línea dorada); la cabecera usa `title.png`, que ya se desvanece.

Una skin nueva debe traer su versión de ambos (bloque "Destacados" de su CSS) y probarse con un banner que tenga retratos
(p. ej. uno de Uma, que desde el 10 nov 2026 los trae de umapyoi.net, o de Genshin/HSR/ZZZ).

## Cómo quitarlas del todo

1. En `src/App.tsx`, borra lo marcado con `// skins` o `{/* skins */}`: los `import` de `SkinPicker` y `SupporterBadge`, `<SkinPicker … />` y `<SupporterBadge />`.
2. Borra esta carpeta (`src/skins/`) y `public/skins/`.
3. Si también quitas Premium: `server/supporter.mjs` (+ `.d.mts`), `server/support/`, `scripts/premium.mjs`, el script `premium` de
   `package.json`, las líneas de `/api/` en `server/index.mjs` y `vite.config.ts`, `docs/premium.md` y el apartado de Premium de `public/privacidad.html`.
4. `npm run build:prod` y subir `dist/` como siempre.
